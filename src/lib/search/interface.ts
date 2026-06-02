export interface Track {
  id: string;
  title: string;
  channelTitle: string;
  duration: string;
  thumbnailUrl?: string;
  source: string;
}

export interface ISearchProvider {
  /**
   * Search for tracks by a given query.
   * @param query The search string
   * @returns A promise that resolves to a list of tracks.
   */
  search(query: string): Promise<Track[]>;
}
