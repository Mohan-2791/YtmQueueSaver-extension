import React, { useState } from 'react';
import { SnapshotCard } from '../components/SnapshotCard';
import { useSnapshots, SnapshotFilterCategory } from '../hooks/useSnapshots';
import { useToast } from '../components/Toast';
import { logger } from '../lib/logger';
import type { PlaylistSnapshot } from '../types';

interface Props {
  mode: 'session' | 'history';
  onOpenCachedQueue: () => void;
}

export function QueueView({ mode, onOpenCachedQueue }: Props): React.ReactElement {
  const filterCategory: SnapshotFilterCategory = mode === 'session' ? 'SESSION_WIPE' : 'ALL';
  const { snapshots, loading, error, restoringId, refresh, restore, remove } = useSnapshots(filterCategory);
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [subFilter, setSubFilter] = useState<'all' | 'SESSION_WIPE' | 'ARCHIVE_HISTORY'>('all');

  const handleRestore = async (id: number): Promise<void> => {
    const success = await restore(id);
    showToast(
      success ? 'Queue restored directly to your YouTube Music account!' : 'Failed to restore playlist. Check login.',
      success ? 'success' : 'error',
    );
  };

  const handleDelete = async (id: number): Promise<void> => {
    const success = await remove(id);
    if (success) {
      showToast('Snapshot removed.', 'info');
    } else {
      showToast('Failed to delete snapshot.', 'error');
    }
  };

  const handleManualSnapshot = (): void => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        showToast('Open music.youtube.com first.', 'error');
        return;
      }

      chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_NOW' }, (_res) => {
        if (chrome.runtime.lastError) {
          logger.error('SCRAPE_NOW failed', chrome.runtime.lastError.message);
          showToast('Could not reach YouTube Music player tab.', 'error');
          return;
        }
        showToast('Current queue saved to history!', 'success');
        setTimeout(refresh, 600);
      });
    });
  };

  // Filter snapshots based on search query and sub-filters
  const filteredSnapshots = snapshots.filter((s: PlaylistSnapshot) => {
    if (subFilter !== 'all' && s.category !== subFilter) {
      return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();

    const titleMatch = s.title.toLowerCase().includes(q);
    const trackMatch = s.tracks.some(
      (t) => t.title.toLowerCase().includes(q) || (t.artist && t.artist.toLowerCase().includes(q)),
    );

    return titleMatch || trackMatch;
  });

  return (
    <div className="space-y-3">
      {/* Session Tab Top Header Bar */}
      {mode === 'session' ? (
        <div className="space-y-2">
          <div className="bg-gradient-to-r from-red-950/40 to-zinc-900/60 p-2.5 rounded-xl border border-red-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <div>
                <p className="text-xs font-semibold text-zinc-200 m-0">Wipe Protection Active</p>
                <p className="text-[10px] text-zinc-400 m-0">
                  Queues are automatically preserved when a new song is clicked.
                </p>
              </div>
            </div>
            <button
              onClick={onOpenCachedQueue}
              className="text-[11px] font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-lg border border-red-500/30 transition shrink-0"
            >
              View Live Queue
            </button>
          </div>

          <button
            onClick={handleManualSnapshot}
            className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-[0.99] text-white text-xs font-semibold py-2 px-3 rounded-xl shadow-md border border-red-500/30 cursor-pointer flex items-center justify-center gap-1.5 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Snapshot Active Queue Now</span>
          </button>
        </div>
      ) : (
        /* History Tab Search & Filter Bar */
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by playlist, song title, or artist..."
              className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500 transition"
            />
            <svg
              className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-zinc-500 mr-1">Filter:</span>
            {[
              { id: 'all', label: 'All Saves' },
              { id: 'SESSION_WIPE', label: 'Auto-Wipes' },
              { id: 'ARCHIVE_HISTORY', label: 'Manual Snapshots' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSubFilter(f.id as any)}
                className={`px-2 py-0.5 rounded-lg border transition ${
                  subFilter === f.id
                    ? 'bg-red-600/30 border-red-500/60 text-red-300 font-medium'
                    : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Snapshot Cards Container */}
      <div className="max-h-[340px] overflow-y-auto space-y-2 pr-0.5">
        {loading ? (
          <div className="text-center py-10 space-y-2">
            <div className="inline-block animate-spin w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full" />
            <p className="text-xs text-zinc-500">Loading saved queues...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8 glass-panel rounded-xl p-4">
            <p className="text-xs text-red-400 mb-2">{error}</p>
            <button
              onClick={refresh}
              className="text-xs text-zinc-300 hover:text-white underline bg-transparent border-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredSnapshots.length === 0 ? (
          <div className="text-center py-10 glass-panel rounded-xl p-5 space-y-2">
            <svg className="w-10 h-10 text-zinc-700 mx-auto" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
            <p className="text-xs font-semibold text-zinc-300 m-0">
              {mode === 'session' ? 'No session saves yet' : 'No history found'}
            </p>
            <p className="text-[11px] text-zinc-500 m-0 max-w-xs mx-auto">
              {mode === 'session'
                ? 'Play songs on YouTube Music. When you click outside the queue, your playlist will automatically be captured here!'
                : searchQuery
                ? 'No playlists match your search terms.'
                : 'Click "Snapshot Active Queue" to manually preserve your current playlist.'}
            </p>
          </div>
        ) : (
          filteredSnapshots.map((item) => (
            <SnapshotCard
              key={item.id}
              snapshot={item}
              isRestoring={restoringId === item.id}
              onRestore={handleRestore}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
