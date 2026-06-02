import { IExtractorProvider } from './interface';
import { YtDlpExtractor } from './ytdlpProvider';

class ExtractorManager {
  private primaryProvider: IExtractorProvider;

  constructor() {
    this.primaryProvider = new YtDlpExtractor();
  }

  async extractAudio(id: string) {
    return this.primaryProvider.extractAudio(id);
  }
}

export const extractorManager = new ExtractorManager();
export * from './interface';
