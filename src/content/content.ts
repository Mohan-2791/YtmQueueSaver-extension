import { logger } from '../lib/logger';
import { throttle } from '../lib/throttle';
import { scrapeQueue, detectPlaybackMode, getCurrentPlayingIndex } from './scrape';
import { getSettings, setStoredCachedQueue } from '../lib/storage';
import type { ExtensionMessage, Track, CachedQueueData } from '../types';

logger.info('[YTM Queue Saver] Content script injected.');

function isContextValid(): boolean {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

try {
  const shieldScript = document.createElement('script');
  shieldScript.src = chrome.runtime.getURL('injected/shield.js');
  shieldScript.onload = () => shieldScript.remove();
  (document.head || document.documentElement).appendChild(shieldScript);
} catch (err) {
  logger.error('[YTM Queue Saver] Failed to inject shield script:', err);
}

let lastKnownQueue: Track[] = [];
let isSaving = false;

function applyRetentionSettings(
  tracks: Track[],
  songsToRetain: number,
  retainScope: 'all' | 'remaining',
): Track[] {
  if (!tracks || tracks.length === 0) return [];
  let result = [...tracks];

  if (retainScope === 'remaining') {
    const currentIndex = getCurrentPlayingIndex(tracks);
    if (currentIndex >= 0 && currentIndex < tracks.length) {
      result = result.slice(currentIndex);
    }
  }

  if (songsToRetain > 0 && result.length > songsToRetain) {
    result = result.slice(0, songsToRetain);
  }

  return result.length > 0 ? result : tracks.slice(0, songsToRetain > 0 ? songsToRetain : undefined);
}

function isDifferentQueue(prev: Track[], next: Track[]): boolean {
  if (next.length === 0 || prev.length === 0) return false;

  const prevIds = new Set(prev.map((t) => t.videoId));
  const nextIds = new Set(next.map((t) => t.videoId));

  let shared = 0;
  for (const id of nextIds) {
    if (prevIds.has(id)) shared++;
  }

  const overlapRatio = shared / Math.min(prevIds.size, nextIds.size);
  return overlapRatio < 0.3;
}

async function snapshotDiscardedQueue(discarded: Track[]): Promise<void> {
  if (!isContextValid() || discarded.length === 0 || isSaving) return;

  isSaving = true;
  setTimeout(() => { isSaving = false; }, 1500);

  try {
    const settings = await getSettings();
    const filteredTracks = applyRetentionSettings(
      discarded,
      settings.songsToRetain,
      settings.retainScope,
    );

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const message: ExtensionMessage = {
      action: 'SAVE_SNAPSHOT',
      payload: {
        title: `Auto-Saved Queue (${timestamp})`,
        category: 'SESSION_WIPE',
        playback_mode: detectPlaybackMode(),
        tracks: filteredTracks,
      },
    };

    if (isContextValid()) {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) return;
        logger.info('[YTM Queue Saver] Queue auto-saved successfully.', res);
      });
    }
  } catch (err) {
    logger.error('[YTM Queue Saver] Error during auto-save queue snapshot:', err);
  }
}

function refreshCachedQueue(): void {
  if (!isContextValid()) {
    cleanup();
    return;
  }

  const currentQueue = scrapeQueue();
  if (currentQueue.length === 0) return;

  if (lastKnownQueue.length > 0 && isDifferentQueue(lastKnownQueue, currentQueue)) {
    snapshotDiscardedQueue(lastKnownQueue).catch(() => {});
  }

  lastKnownQueue = currentQueue;
  const currentPlayingIdx = getCurrentPlayingIndex(currentQueue);
  const playbackMode = detectPlaybackMode();

  const cachedData: CachedQueueData = {
    tracks: currentQueue,
    count: currentQueue.length,
    playbackMode,
    currentTrackIndex: currentPlayingIdx,
    updatedAt: new Date().toISOString(),
  };

  setStoredCachedQueue(cachedData).catch(() => {});
}

const throttledRefresh = throttle(refreshCachedQueue, 500);

const observer = new MutationObserver(() => {
  if (!isContextValid()) {
    cleanup();
    return;
  }
  throttledRefresh();
});

observer.observe(document.body, { childList: true, subtree: true });

const pollInterval = setInterval(() => {
  if (!isContextValid()) {
    cleanup();
    return;
  }
  refreshCachedQueue();
}, 2000);

function cleanup(): void {
  try {
    observer.disconnect();
    clearInterval(pollInterval);
  } catch {}
}

if (isContextValid()) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (!isContextValid()) return false;

    if (message.action === 'SCRAPE_NOW') {
      const currentQueue = scrapeQueue();
      const activeTracks = currentQueue.length > 0 ? currentQueue : lastKnownQueue;

      if (activeTracks.length === 0) {
        sendResponse({ status: 'error', message: 'No active queue items found in player.' });
        return true;
      }

      getSettings().then((settings) => {
        const filteredTracks = applyRetentionSettings(
          activeTracks,
          settings.songsToRetain,
          settings.retainScope,
        );

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const saveMsg: ExtensionMessage = {
          action: 'SAVE_SNAPSHOT',
          payload: {
            title: `Manual Snapshot (${timestamp})`,
            category: 'ARCHIVE_HISTORY',
            playback_mode: detectPlaybackMode(),
            tracks: filteredTracks,
          },
        };

        if (isContextValid()) {
          chrome.runtime.sendMessage(saveMsg, (res) => {
            sendResponse(res || { status: 'success', data: { trackCount: filteredTracks.length } });
          });
        }
      });

      return true;
    }

    return false;
  });
}