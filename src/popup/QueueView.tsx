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
      success ? 'Tape recorded onto your YouTube Music account.' : 'Could not restore. Check your connection.',
      success ? 'success' : 'error',
    );
  };

  const handleDelete = async (id: number): Promise<void> => {
    const success = await remove(id);
    showToast(success ? 'Tape ejected.' : 'Could not eject that tape.', success ? 'info' : 'error');
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
          showToast('Could not reach the YouTube Music tab.', 'error');
          return;
        }
        showToast('Queue recorded to the archive.', 'success');
        setTimeout(refresh, 600);
      });
    });
  };

  const filteredSnapshots = snapshots.filter((s: PlaylistSnapshot) => {
    if (subFilter !== 'all' && s.category !== subFilter) return false;
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
      {mode === 'session' ? (
        <div className="space-y-2">
          <div className="tape-window rounded-xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="led led-red led-pulse" />
              <div>
                <p className="text-xs font-semibold text-zinc-200 m-0">Recording</p>
                <p className="text-[10px] text-zinc-500 m-0">Old queues are captured the moment a new one starts.</p>
              </div>
            </div>
            <button
              onClick={onOpenCachedQueue}
              className="transport-btn text-[10px] px-2.5 py-1 rounded-md cursor-pointer shrink-0"
            >
              Live tape
            </button>
          </div>

          <button
            onClick={handleManualSnapshot}
            className="w-full transport-btn is-primary text-xs font-semibold py-2 px-3 rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span aria-hidden>⏺</span>
            <span>Record current queue now</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="tape-window rounded-xl px-2.5 py-1.5 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-zinc-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search the archive..."
              className="w-full bg-transparent border-0 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-zinc-500 hover:text-zinc-300 text-xs shrink-0">
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[10px]">
            {[
              { id: 'all', label: 'All tapes' },
              { id: 'SESSION_WIPE', label: 'Side A' },
              { id: 'ARCHIVE_HISTORY', label: 'Side B' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSubFilter(f.id as any)}
                className={`px-2 py-0.5 rounded-md transition ${
                  subFilter === f.id ? 'transport-btn is-primary' : 'transport-btn'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-[330px] overflow-y-auto space-y-2 pr-0.5">
        {loading ? (
          <div className="text-center py-10 space-y-2">
            <div className="inline-block animate-spin w-5 h-5 border-2 border-[var(--led-amber)] border-t-transparent rounded-full" />
            <p className="text-xs text-zinc-500">Reading tapes...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8 cassette-shell rounded-xl p-4">
            <p className="text-xs text-red-400 mb-2">{error}</p>
            <button onClick={refresh} className="text-xs text-zinc-300 hover:text-white underline bg-transparent border-0 cursor-pointer">
              Retry
            </button>
          </div>
        ) : filteredSnapshots.length === 0 ? (
          <div className="text-center py-10 cassette-shell rounded-xl p-5 space-y-2">
            <p className="text-3xl leading-none" aria-hidden>📼</p>
            <p className="text-xs font-semibold text-zinc-300 m-0">
              {mode === 'session' ? 'Nothing recorded yet' : 'Archive is empty'}
            </p>
            <p className="text-[11px] text-zinc-500 m-0 max-w-xs mx-auto">
              {mode === 'session'
                ? 'Play something on YouTube Music. When the queue changes, the old one lands here automatically.'
                : searchQuery
                ? 'No tapes match that search.'
                : 'Tap "Record current queue now" to save one manually.'}
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
