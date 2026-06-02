import { Readable } from 'stream';

export interface AudioStream {
  stream: Readable | NodeJS.ReadableStream;
  mimeType: string;
  ext: string;
  size?: number;
}

export interface IExtractorProvider {
  /**
   * Extract the best audio stream for a given ID.
   * @param id The source ID (e.g. YouTube video ID)
   * @returns A promise that resolves to the AudioStream.
   */
  extractAudio(id: string): Promise<AudioStream>;
}
