import { ISearchProvider } from './interface';
import { InfuseoSearchProvider } from './infuseoProvider';

class SearchManager {
  private primaryProvider: ISearchProvider;

  constructor() {
    this.primaryProvider = new InfuseoSearchProvider();
  }

  async search(query: string) {
    // In the future, we can add fallbacks or multi-provider search here
    return this.primaryProvider.search(query);
  }
}

export const searchManager = new SearchManager();
export * from './interface';
