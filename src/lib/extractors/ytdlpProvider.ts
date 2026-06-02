import { IExtractorProvider, AudioStream } from './interface';
import { ExtractionError, RegionLockError } from '../errors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

function getBinaryPath(): string {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';

  // Try locating in node_modules relative to process.cwd() (dev environment)
  const localPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', binName);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // Fallback to system-wide binary (installed via apk/apt/brew)
  return 'yt-dlp';
}

/**
 * Downloads audio to a temp file using yt-dlp, then returns a readable stream
 * of that file. This is more reliable than piping stdout across all environments.
 */
function runYtDlp(binPath: string, url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      url,
      '--format', 'bestaudio[ext=m4a]/bestaudio/best',
      '--output', outputPath,
      '--no-check-certificates',
      '--no-warnings',
      '--no-playlist',
      '--add-header', 'referer:youtube.com',
      '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    ];

    console.log(`[yt-dlp] spawning: ${binPath} with output: ${outputPath}`);

    const proc = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const stderrChunks: Buffer[] = [];
    proc.stderr?.on('data', (d: Buffer) => stderrChunks.push(d));

    proc.on('close', (code) => {
      const stderrText = Buffer.concat(stderrChunks).toString();
      console.log(`[yt-dlp] exited with code ${code}`);
      if (code !== 0) {
        console.error(`[yt-dlp] stderr: ${stderrText}`);
        if (stderrText.includes('Sign in') || stderrText.includes('Private video')) {
          return reject(new RegionLockError('This video is restricted or private.'));
        }
        return reject(new ExtractionError(`yt-dlp failed (exit ${code}): ${stderrText.slice(-300)}`));
      }
      resolve();
    });

    proc.on('error', (err) => {
      reject(new ExtractionError(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

export class YtDlpExtractor implements IExtractorProvider {
  async extractAudio(id: string): Promise<AudioStream> {
    const url = `https://www.youtube.com/watch?v=${id}`;
    const binPath = getBinaryPath();

    // Write to a unique temp file to avoid collisions
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `ytdlp-${crypto.randomUUID()}.m4a`);

    try {
      await runYtDlp(binPath, url, tmpFile);

      // Verify the file actually has content
      const stat = fs.statSync(tmpFile);
      if (stat.size === 0) {
        throw new ExtractionError('yt-dlp produced an empty file');
      }

      console.log(`[yt-dlp] file ready: ${tmpFile} (${stat.size} bytes)`);

      // Create a read stream and schedule cleanup after it finishes
      const fileStream = fs.createReadStream(tmpFile);
      fileStream.on('close', () => {
        fs.unlink(tmpFile, (err) => {
          if (err) console.warn(`[yt-dlp] failed to delete temp file: ${tmpFile}`, err);
        });
      });

      return {
        stream: fileStream,
        mimeType: 'audio/mp4',
        ext: 'm4a',
        size: stat.size,
      };
    } catch (error: any) {
      // Clean up temp file if it exists on error
      if (fs.existsSync(tmpFile)) {
        fs.unlink(tmpFile, () => {});
      }
      if (error instanceof RegionLockError || error instanceof ExtractionError) {
        throw error;
      }
      const msg = error?.message || String(error);
      throw new ExtractionError(`Failed to extract audio: ${msg}`);
    }
  }
}
