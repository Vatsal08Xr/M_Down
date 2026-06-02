import { IExtractorProvider, AudioStream } from './interface';
import { ExtractionError, RegionLockError } from '../errors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

// MIME type map for audio extensions yt-dlp might choose
const MIME_MAP: Record<string, string> = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  wav: 'audio/wav',
};

function getBinaryPath(): string {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';

  // 1. Check the youtube-dl-exec node_modules bin (local dev)
  const localPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', binName);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // 2. Check /usr/local/bin/yt-dlp (our Docker install target)
  const dockerPath = `/usr/local/bin/${binName}`;
  if (fs.existsSync(dockerPath)) {
    return dockerPath;
  }

  // 3. Fallback — rely on PATH
  return 'yt-dlp';
}

/**
 * Runs yt-dlp and returns the path of the file it created.
 * We use `%(ext)s` in the output template so yt-dlp writes the correct
 * extension regardless of which format it selects. We discover the actual
 * file by globbing for our unique UUID prefix afterwards.
 */
function runYtDlp(binPath: string, url: string, outputTemplate: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      url,
      // Prefer native m4a (AAC). Falls back to best available audio without re-encoding.
      // NOT using --extract-audio to avoid requiring ffmpeg locally.
      '--format', 'bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio[ext=webm]/bestaudio',
      '--output', outputTemplate,
      '--no-check-certificates',
      '--no-warnings',
      '--no-playlist',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
    ];

    console.log(`[yt-dlp] binary: ${binPath}`);
    console.log(`[yt-dlp] template: ${outputTemplate}`);

    const proc = spawn(binPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Make sure system PATH is available
      env: { ...process.env, PATH: `/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}` },
    });

    const stderrChunks: Buffer[] = [];
    const stdoutChunks: Buffer[] = [];
    proc.stdout?.on('data', (d: Buffer) => stdoutChunks.push(d));
    proc.stderr?.on('data', (d: Buffer) => stderrChunks.push(d));

    proc.on('close', (code) => {
      const stderrText = Buffer.concat(stderrChunks).toString();
      const stdoutText = Buffer.concat(stdoutChunks).toString();
      console.log(`[yt-dlp] exit code: ${code}`);
      if (stderrText) console.log(`[yt-dlp] stderr:\n${stderrText.slice(-800)}`);
      if (stdoutText) console.log(`[yt-dlp] stdout:\n${stdoutText.slice(-400)}`);

      if (code !== 0) {
        if (stderrText.includes('Sign in') || stderrText.includes('Private video')) {
          return reject(new RegionLockError('This video is restricted or private.'));
        }
        if (stderrText.includes('Video unavailable')) {
          return reject(new ExtractionError('Video is unavailable.'));
        }
        return reject(new ExtractionError(`yt-dlp failed (exit ${code}): ${stderrText.slice(-500)}`));
      }

      // yt-dlp may have written a file with a different extension than requested.
      // Discover the actual output file by matching on the UUID part of the template.
      const uuidBase = path.basename(outputTemplate).replace('.%(ext)s', '');
      const tmpDir = path.dirname(outputTemplate);
      let found: string | null = null;
      try {
        const files = fs.readdirSync(tmpDir);
        for (const f of files) {
          if (f.startsWith(uuidBase)) {
            found = path.join(tmpDir, f);
            break;
          }
        }
      } catch {
        // ignore readdir errors
      }

      if (!found) {
        return reject(new ExtractionError('yt-dlp ran successfully but output file was not found'));
      }

      resolve(found);
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

    // Use %(ext)s so yt-dlp writes the correct extension
    const tmpDir = os.tmpdir();
    const uuid = crypto.randomUUID();
    const outputTemplate = path.join(tmpDir, `ytdlp-${uuid}.%(ext)s`);

    let tmpFile: string | null = null;
    try {
      tmpFile = await runYtDlp(binPath, url, outputTemplate);

      const stat = fs.statSync(tmpFile);
      if (stat.size === 0) {
        throw new ExtractionError('yt-dlp produced an empty file');
      }

      const ext = path.extname(tmpFile).replace('.', '') || 'm4a';
      const mimeType = MIME_MAP[ext] ?? 'audio/mp4';
      console.log(`[yt-dlp] file ready: ${tmpFile} (${stat.size} bytes, ${ext})`);

      const fileStream = fs.createReadStream(tmpFile);
      fileStream.on('close', () => {
        if (tmpFile) {
          fs.unlink(tmpFile, (err) => {
            if (err) console.warn(`[yt-dlp] cleanup failed: ${tmpFile}`, err);
          });
        }
      });

      return { stream: fileStream, mimeType, ext, size: stat.size };

    } catch (error: any) {
      // Clean up any temp files matching our UUID
      try {
        const files = fs.readdirSync(tmpDir);
        for (const f of files) {
          if (f.startsWith(`ytdlp-${uuid}`)) {
            fs.unlink(path.join(tmpDir, f), () => {});
          }
        }
      } catch { /* ignore */ }

      if (error instanceof RegionLockError || error instanceof ExtractionError) {
        throw error;
      }
      const msg = error?.message || String(error);
      throw new ExtractionError(`Failed to extract audio: ${msg}`);
    }
  }
}
