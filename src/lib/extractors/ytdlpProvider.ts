import { IExtractorProvider, AudioStream } from './interface';
import { ExtractionError, RegionLockError } from '../errors';
import { create } from 'youtube-dl-exec';
import path from 'path';
import fs from 'fs';

function getBinaryPath(): string {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
  
  // Try locating in node_modules relative to process.cwd() (dev environment)
  const localPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', binName);
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  
  // Fallback to system-wide binary
  return 'yt-dlp';
}

export class YtDlpExtractor implements IExtractorProvider {
  async extractAudio(id: string): Promise<AudioStream> {
    const url = `https://www.youtube.com/watch?v=${id}`;
    const binPath = getBinaryPath();
    const execYtDlp = create(binPath);

    try {
      // Execute yt-dlp to get the best audio format
      // We pass `-f bestaudio[ext=m4a]/bestaudio` to prioritize m4a for native support
      // Then output to stdout `-o -`
      const subprocess = execYtDlp.exec(url, {
        format: 'bestaudio[ext=m4a]/bestaudio',
        output: '-',
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
          'referer:youtube.com',
          'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        ]
      });

      if (!subprocess.stdout) {
        throw new ExtractionError('Failed to get stdout from yt-dlp process');
      }

      // Handle process errors gracefully
      subprocess.on('error', (err) => {
        console.error('yt-dlp process error:', err);
      });
      
      subprocess.stderr?.on('data', (data) => {
        const errorMsg = data.toString();
        // Check for common errors
        if (errorMsg.includes('Sign in to confirm your age') || errorMsg.includes('Video unavailable')) {
          console.error('Extraction Error:', errorMsg);
        }
      });

      return {
        stream: subprocess.stdout,
        mimeType: 'audio/mp4', // assuming m4a (AAC)
        ext: 'm4a',
      };
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes('Sign in') || msg.includes('Private video')) {
        throw new RegionLockError('This video is restricted or private.');
      }
      throw new ExtractionError(`Failed to extract audio: ${msg}`);
    }
  }
}
