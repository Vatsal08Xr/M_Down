import { ISearchProvider, Track } from './interface';
import { ProviderError } from '../errors';

export class InfuseoSearchProvider implements ISearchProvider {
  async search(query: string): Promise<Track[]> {
    try {
      const url = new URL('https://www.infuseo.fr/search.php');
      // Infuseo expects space replaced by underscore usually, or url encoded
      url.searchParams.set('q', query.replace(/\s/g, '_'));

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        },
        // add small timeout (Node 18+ fetch doesn't have native timeout easily, but we can use AbortController if needed)
      });

      if (!response.ok) {
        throw new ProviderError(`Infuseo API returned status ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data.items && Array.isArray(data.items)) {
        return data.items.map((item: any) => ({
          id: item.id,
          title: item.title,
          channelTitle: item.channelTitle,
          duration: item.duration,
          source: 'youtube'
        }));
      }

      return [];
    } catch (error: any) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError('Failed to fetch from Infuseo search: ' + error.message);
    }
  }
}
