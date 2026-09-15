import React, { useEffect, useState } from 'react';
import { getStoredCachedQueue, getSettings, setStoredCachedQueue } from '../lib/storage';
import { sendExtensionMessage } from '../lib/chromeMessage';
import type { CachedQueueData, Track, ApiResponse } from '../types';
import { useToast } from '../components/Toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSnapshotSaved: () => void;
}

export function CachedQueueDrawer({ isOpen, onClose, onSnapshotSaved }: Props): React.ReactElement | null {
  const [cachedData, setCachedData] = useState<CachedQueueData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retainLimit, setRetainLimit] = useState<number>(0);
  const { showToast } = useToast();

  const loadCache = async () => {
    setLoading(true);
    try {
      const data = await getStoredCachedQueue();
      setCachedData(data);
      const settings = await getSettings();
      setRetainLimit(settings.songsToRetain);
    } catch {
      showToast('Could not load cached queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCache();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const tracks: Track[] = cachedData?.tracks || [];
  const activeCount = tracks.length;

  const displayedTracks =
    retainLimit > 0 && retainLimit < tracks.length ? tracks.slice(0, retainLimit) : tracks;

  const handleRefreshLive = () => {
    setLoading(true);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        showToast('No active YouTube Music tab found', 'error');
        setLoading(false);
        return;
      }

      chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_NOW' }, (_res) => {
        if (chrome.runtime.lastError) {
          showToast('Could not reach YouTube Music tab', 'error');
          setLoading(false);
        } else {
          showToast('Queue scraped from live player!', 'success');
          setTimeout(() => {
            loadCache();
            onSnapshotSaved();
          }, 400);
        }
      });
    });
  };

  const handleSaveToYTM = async () => {
    if (displayedTracks.length === 0) return;
    setSaving(true);
    try {
      const title = `Live Queue Snapshot (${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })})`;

      const res = await sendExtensionMessage<ApiResponse<{ playlist_url?: string }>>({
        action: 'RESTORE_DIRECT_PLAYLIST',
        payload: {
          title,
          tracks: displayedTracks,
          playbackMode: cachedData?.playbackMode || 'SONG',
        },
      });

      if (res?.status === 'success') {
        showToast('Saved directly to your YouTube Music account!', 'success');
        onSnapshotSaved();
      } else {
        showToast(res?.message || 'Failed to create playlist. Check Google login.', 'error');
      }
    } catch (err) {
      showToast('Error saving playlist to YouTube Music.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    await setStoredCachedQueue(null);
    setCachedData(null);
    showToast('Cached queue cleared', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-fadeIn">
      <div className="bg-[#0c0c10] border-t border-zinc-800 rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slideUp">
        {/* Drawer Header */}
        <div className="p-3.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <div>
              <h2 className="text-xs font-bold text-zinc-100 uppercase tracking-wide m-0">
                Live Cached Queue
              </h2>
              <p className="text-[10px] text-zinc-400 m-0">
                {cachedData ? `${activeCount} tracks monitored in active player` : 'No active queue cached'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRefreshLive}
              disabled={loading}
              title="Rescrape live player"
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Retain Selector Controls */}
        {activeCount > 0 && (
          <div className="bg-zinc-950/70 px-4 py-2.5 border-b border-zinc-800/60 flex items-center justify-between text-xs">
            <span className="text-zinc-400 text-[11px]">
              Retain:{' '}
              <strong className="text-red-400 font-mono">
                {retainLimit > 0 ? `${displayedTracks.length} of ${activeCount}` : `All (${activeCount})`}
              </strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setRetainLimit(0)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                  retainLimit === 0 ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                All
              </button>
              {[10, 25, 50].map((num) => (
                <button
                  key={num}
                  onClick={() => setRetainLimit(num)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                    retainLimit === num ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Track List */}
        <div className="p-3 overflow-y-auto max-h-64 space-y-1.5">
          {loading ? (
            <div className="py-8 text-center text-xs text-zinc-500">Scanning YouTube Music player...</div>
          ) : tracks.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <svg className="w-8 h-8 text-zinc-600 mx-auto" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
              <p className="text-xs text-zinc-400 m-0">No active queue detected in YouTube Music.</p>
              <p className="text-[10px] text-zinc-500 m-0">Play music on music.youtube.com to activate live caching.</p>
            </div>
          ) : (
            displayedTracks.map((t, idx) => (
              <div
                key={`${t.videoId}-${idx}`}
                className={`flex items-center gap-2.5 p-1.5 rounded-lg border transition ${
                  t.isPlaying
                    ? 'bg-red-950/30 border-red-500/40 text-red-200'
                    : 'bg-zinc-900/40 border-zinc-800/40 hover:bg-zinc-800/50 text-zinc-200'
                }`}
              >
                <div className="w-5 text-center font-mono text-[10px] text-zinc-500">
                  {t.isPlaying ? (
                    <div className="flex items-end justify-center gap-0.5 h-3 w-3 mx-auto">
                      <span className="w-0.5 bg-red-500 rounded-full animate-bar-1" />
                      <span className="w-0.5 bg-red-500 rounded-full animate-bar-2" />
                      <span className="w-0.5 bg-red-500 rounded-full animate-bar-3" />
                    </div>
                  ) : (
                    idx + 1
                  )}
                </div>

                {t.thumbnail ? (
                  <img src={t.thumbnail} alt="" className="w-8 h-8 rounded object-cover bg-zinc-800" />
                ) : (
                  <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-zinc-600 text-[10px]">
                    ♪
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate m-0">{t.title}</p>
                  <p className="text-[10px] text-zinc-400 truncate m-0">{t.artist}</p>
                </div>

                {t.duration && (
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0">{t.duration}</span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Drawer Bottom Actions */}
        {activeCount > 0 && (
          <div className="p-3 bg-zinc-900/90 border-t border-zinc-800 flex gap-2">
            <button
              onClick={handleSaveToYTM}
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-xs py-2 px-3 rounded-xl shadow-md border border-red-500/30 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              {saving ? (
                <span className="inline-block animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              )}
              <span>Save as YouTube Music Playlist</span>
            </button>
            <button
              onClick={handleClearCache}
              className="px-2.5 py-2 rounded-xl text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 text-xs transition"
              title="Clear cached queue"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
