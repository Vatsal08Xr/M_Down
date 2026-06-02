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
      const url = `/api/download?id=${encodeURIComponent(track.id)}&title=${encodeURIComponent(track.title)}`;
      const res = await fetch(url);

      if (!res.ok) {
        // Server returned an error — parse and show it
        let msg = `Download failed (${res.status})`;
        try {
          const data = await res.json();
          if (data.error) msg = data.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      // Read the binary body and create an object URL
      const blob = await res.blob();

      // Extract filename from Content-Disposition if present, otherwise fall back
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `${track.title}.m4a`;

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      setError(err.message || 'Download failed');
    } finally {
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
