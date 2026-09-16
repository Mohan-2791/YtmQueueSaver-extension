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

function VuMeter(): React.ReactElement {
  return (
    <div className="flex items-end gap-0.5 h-3.5">
      <span className="vu-bar b1 h-full" />
      <span className="vu-bar b2 h-full" />
      <span className="vu-bar b3 h-full" />
      <span className="vu-bar b4 h-full" />
    </div>
  );
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
      showToast('Could not read the loaded tape.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadCache();
  }, [isOpen]);

  if (!isOpen) return null;

  const tracks: Track[] = cachedData?.tracks || [];
  const activeCount = tracks.length;
  const displayedTracks = retainLimit > 0 && retainLimit < tracks.length ? tracks.slice(0, retainLimit) : tracks;

  const handleRefreshLive = () => {
    setLoading(true);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        showToast('No active YouTube Music tab found.', 'error');
        setLoading(false);
        return;
      }
      chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_NOW' }, (_res) => {
        if (chrome.runtime.lastError) {
          showToast('Could not reach the YouTube Music tab.', 'error');
          setLoading(false);
        } else {
          showToast('Tape re-read from the live player.', 'success');
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
      const title = `Live Queue Snapshot (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      const res = await sendExtensionMessage<ApiResponse<{ playlist_url?: string }>>({
        action: 'RESTORE_DIRECT_PLAYLIST',
        payload: { title, tracks: displayedTracks, playbackMode: cachedData?.playbackMode || 'SONG' },
      });

      if (res?.status === 'success') {
        showToast('Saved directly to your YouTube Music account.', 'success');
        onSnapshotSaved();
      } else {
        showToast(res?.message || 'Could not create the playlist. Check your connection.', 'error');
      }
    } catch {
      showToast('Error saving to YouTube Music.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    await setStoredCachedQueue(null);
    setCachedData(null);
    showToast('Tape cleared from the deck.', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-fadeIn">
      <div className="cassette-shell border-t border-[var(--shell-edge)] rounded-t-2xl max-h-[92vh] flex flex-col overflow-hidden animate-slideUp">
        {/* Header */}
        <div className="tape-window m-2 mb-0 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {activeCount > 0 ? <VuMeter /> : <span className="led led-off" />}
            <div>
              <h2 className="text-xs font-bold text-zinc-100 uppercase tracking-wide m-0">Tape in deck</h2>
              <p className="text-[10px] text-zinc-500 m-0">
                {cachedData ? `${activeCount} tracks on the loaded tape` : 'No tape loaded'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button onClick={handleRefreshLive} disabled={loading} title="Re-read the tape" className="transport-btn p-1.5 rounded-md cursor-pointer">
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button onClick={onClose} className="transport-btn p-1.5 rounded-md cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Retain selector */}
        {activeCount > 0 && (
          <div className="px-4 py-2.5 flex items-center justify-between text-xs">
            <span className="text-zinc-400 text-[11px]">
              Recording:{' '}
              <strong className="counter-digits rounded px-1.5 py-0.5">
                {retainLimit > 0 ? `${displayedTracks.length}/${activeCount}` : `ALL/${activeCount}`}
              </strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setRetainLimit(0)} className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition ${retainLimit === 0 ? 'transport-btn is-primary' : 'transport-btn'}`}>
                All
              </button>
              {[10, 25, 50].map((num) => (
                <button key={num} onClick={() => setRetainLimit(num)} className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition ${retainLimit === num ? 'transport-btn is-primary' : 'transport-btn'}`}>
                  {num}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Track list */}
        <div className="p-3 overflow-y-auto max-h-64 space-y-1.5">
          {loading ? (
            <div className="py-8 text-center text-xs text-zinc-500">Scanning the live player...</div>
          ) : tracks.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-3xl leading-none" aria-hidden>📼</p>
              <p className="text-xs text-zinc-400 m-0">No tape is currently loaded.</p>
              <p className="text-[10px] text-zinc-500 m-0">Play something on music.youtube.com to start recording.</p>
            </div>
          ) : (
            displayedTracks.map((t, idx) => (
              <div
                key={`${t.videoId}-${idx}`}
                className={`flex items-center gap-2.5 p-1.5 rounded-lg transition ${
                  t.isPlaying ? 'label-panel' : 'bg-white/[0.03] text-zinc-200'
                }`}
              >
                <div className="w-5 text-center font-mono text-[10px]">
                  {t.isPlaying ? <VuMeter /> : idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate m-0">{t.title}</p>
                  <p className={`text-[10px] truncate m-0 ${t.isPlaying ? 'label-sub' : 'text-zinc-400'}`}>{t.artist}</p>
                </div>
                {t.duration && <span className="text-[10px] font-mono shrink-0 opacity-70">{t.duration}</span>}
              </div>
            ))
          )}
        </div>

        {/* Footer transport */}
        {activeCount > 0 && (
          <div className="p-3 flex gap-2 border-t border-white/5">
            <button
              onClick={handleSaveToYTM}
              disabled={saving}
              className="flex-1 transport-btn is-primary font-semibold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <span className="inline-block animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
              ) : (
                <span aria-hidden>▶</span>
              )}
              <span>Play onto YouTube Music</span>
            </button>
            <button onClick={handleClearCache} className="transport-btn px-2.5 py-2 rounded-xl text-xs cursor-pointer" title="Clear the loaded tape">
              ⏏
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
