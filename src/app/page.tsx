'use client';

import { useState } from 'react';
import { Search, Download, AlertCircle, Music } from 'lucide-react';
import { Track } from '@/lib/search';

export default function Home() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);
    setTracks([]);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to search');
      
      setTracks(data.tracks || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownload = async (track: Track) => {
    setDownloadingId(track.id);
    setError(null);
    try {
      // Trigger download by creating an invisible anchor
      const url = `/api/download?id=${encodeURIComponent(track.id)}&title=${encodeURIComponent(track.title)}`;
      
      // We can directly open the url in a new tab, or use an anchor tag
      // Using an anchor tag with 'download' attribute helps enforce download
      const a = document.createElement('a');
      a.href = url;
      a.download = `${track.title}.m4a`; 
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // We simulate download state clearance since it's a direct browser download
      setTimeout(() => setDownloadingId(null), 2000);
    } catch (err: any) {
      setError('Failed to initiate download');
      setDownloadingId(null);
    }
  };

  return (
    <main className="container">
      <div className="header">
        <h1>VibeStream</h1>
        <p>Premium Audio Extraction & Downloading</p>
      </div>

      <div className="glass-panel">
        <form onSubmit={handleSearch} className="search-form">
          <div className="input-group">
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter song name, artist, or YouTube URL..."
              autoFocus
            />
          </div>
          <button type="submit" disabled={isSearching} className="btn btn-primary">
            {isSearching ? <div className="loader" /> : <Search size={20} />}
            Search
          </button>
        </form>
      </div>

      {error && (
        <div className="alert">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {isSearching && (
        <div className="loading-container glass-panel">
          <div className="loader" style={{ width: '40px', height: '40px' }} />
          <p>Searching for the best vibes...</p>
        </div>
      )}

      {!isSearching && tracks.length > 0 && (
        <div className="glass-panel results-list">
          {tracks.map((track) => (
            <div key={track.id} className="track-card">
              <div className="track-info">
                <div className="track-title" title={track.title}>{track.title}</div>
                <div className="track-meta">
                  <span>{track.channelTitle}</span>
                  <span>•</span>
                  <span>{track.duration}</span>
                </div>
              </div>
              <button 
                onClick={() => handleDownload(track)}
                disabled={downloadingId === track.id}
                className="btn btn-primary"
                style={{ padding: '0.6rem 1rem' }}
              >
                {downloadingId === track.id ? (
                  <><div className="loader" /> Fetching...</>
                ) : (
                  <><Download size={18} /> Get</>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
      
      {!isSearching && tracks.length === 0 && !error && query && (
        <div className="glass-panel" style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
          <Music size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
          <p>No results found for "{query}".</p>
        </div>
      )}
    </main>
  );
}
