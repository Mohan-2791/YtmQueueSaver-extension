import { logger } from '../lib/logger';
import { throttle } from '../lib/throttle';
import { scrapeQueue, detectPlaybackMode, getCurrentPlayingIndex } from './scrape';
import { getSettings, setStoredCachedQueue } from '../lib/storage';
import type { ExtensionMessage, Track, CachedQueueData } from '../types';

logger.info('YouTube Music Queue Saver content script injected.');

// Prevent YouTube Music from pausing when user switches to another tab.
//
// Loaded via `src` (not inline textContent) because YTM's page CSP
// (`script-src 'self' ...`) blocks inline scripts outright. `src`-loading
// from `chrome.runtime.getURL(...)` works because the CSP allowlists
// `chrome-extension://<this-extension-id>/`. Requires the file to be
// declared under `web_accessible_resources` in manifest.json (already done).
try {
  const shieldScript = document.createElement('script');
  shieldScript.src = chrome.runtime.getURL('injected/shield.js');
  shieldScript.onload = () => shieldScript.remove();
  shieldScript.onerror = () => {
    logger.error('Failed to load injected shield.js (check web_accessible_resources in manifest.json)');
  };
  (document.head || document.documentElement).appendChild(shieldScript);
} catch (err) {
  logger.error('Failed to inject shield script', err);
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

/**
 * Returns true if `next` looks like a genuinely different queue than `prev`
 * (user jumped to an unrelated song/album/station/related item), as opposed
 * to `prev` simply advancing (tracks falling off the front as they finish)
 * or being reshuffled (same tracks, different order).
 *
 * DELIBERATE DESIGN CHOICE: we compare queue CONTENTS (videoId overlap)
 * instead of watching for specific buttons/classes to be clicked. YTM's UI
 * markup (button labels, wrapper classes, which tab renders which control)
 * changes often and silently breaks click-based detection. The queue's
 * actual track list is read via scrapeQueue(), which pulls from YTM's own
 * internal Polymer `.data` bindings rather than CSS, so it's a meaningfully
 * more stable signal that doesn't need touching every time YTM's UI shifts.
 */
function isDifferentQueue(prev: Track[], next: Track[]): boolean {
  if (prev.length === 0 || next.length === 0) return false;

  const prevIds = new Set(prev.map((t) => t.videoId));
  const nextIds = new Set(next.map((t) => t.videoId));

  let shared = 0;
  for (const id of nextIds) {
    if (prevIds.has(id)) shared++;
  }

  // A queue that's simply progressing or being reshuffled keeps nearly all
  // the same videoIds. A genuinely new queue/station/album shares few or
  // none. 0.3 is a deliberately conservative threshold -- tune upward if you
  // see false negatives (a real swap not being caught), downward if you see
  // false positives (normal playback wrongly triggering a save).
  const overlapRatio = shared / Math.min(prevIds.size, nextIds.size);
  return overlapRatio < 0.3;
}

async function snapshotDiscardedQueue(discarded: Track[]): Promise<void> {
  if (discarded.length === 0 || isSaving) return;

  isSaving = true;
  setTimeout(() => {
    isSaving = false;
  }, 1500);

  logger.info(`Queue replacement detected. Safeguarding previous queue of ${discarded.length} tracks.`);

  try {
    const settings = await getSettings();
    const filteredTracks = applyRetentionSettings(
      discarded,
      settings.songsToRetain,
      settings.retainScope,
    );

    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const message: ExtensionMessage = {
      action: 'SAVE_SNAPSHOT',
      payload: {
        title: `Auto-Saved Queue (${timestamp})`,
        category: 'SESSION_WIPE',
        playback_mode: detectPlaybackMode(),
        tracks: filteredTracks,
      },
    };

    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) {
        logger.error('Failed to send SAVE_SNAPSHOT:', chrome.runtime.lastError.message);
      } else {
        logger.info('Queue successfully saved to session wipes.', res);
      }
    });
  } catch (err) {
    logger.error('Error during auto-save queue snapshot:', err);
  }
}

/**
 * Periodically rescrapes the active queue from the DOM. If the queue
 * appears to have been replaced wholesale, snapshots the OLD queue first
 * (still held in `lastKnownQueue` from before this mutation) -- then writes
 * the new queue to chrome.storage.local as before.
 */
function refreshCachedQueue(): void {
  const currentQueue = scrapeQueue();
  if (currentQueue.length === 0) return;

  if (isDifferentQueue(lastKnownQueue, currentQueue)) {
    snapshotDiscardedQueue(lastKnownQueue).catch((err) =>
      logger.error('Failed to auto-save discarded queue', err),
    );
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

  setStoredCachedQueue(cachedData).catch((err) => {
    logger.error('Failed to store cached queue in chrome.storage', err);
  });
}

// Throttled refresh: player DOM continuously mutates during audio playback
const throttledRefresh = throttle(refreshCachedQueue, 300);

const observer = new MutationObserver(throttledRefresh);
observer.observe(document.body, { childList: true, subtree: true });

// Initial scrape on load
setTimeout(refreshCachedQueue, 1200);

// Listen for manual trigger requests from popup UI (unchanged)
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (res: unknown) => void) => {
    if (message.action === 'SCRAPE_NOW') {
      const currentQueue = scrapeQueue();
      if (currentQueue.length === 0 && lastKnownQueue.length === 0) {
        sendResponse({ status: 'error', message: 'No active queue items found in player.' });
        return false;
      }

      const activeTracks = currentQueue.length > 0 ? currentQueue : lastKnownQueue;

      getSettings().then((settings) => {
        const filteredTracks = applyRetentionSettings(
          activeTracks,
          settings.songsToRetain,
          settings.retainScope,
        );

        const timestamp = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        const saveMsg: ExtensionMessage = {
          action: 'SAVE_SNAPSHOT',
          payload: {
            title: `Manual Snapshot (${timestamp})`,
            category: 'ARCHIVE_HISTORY',
            playback_mode: detectPlaybackMode(),
            tracks: filteredTracks,
          },
        };

        chrome.runtime.sendMessage(saveMsg, (res) => {
          sendResponse(res || { status: 'success', data: { trackCount: filteredTracks.length } });
        });
      });

      return true;
    }

    return false;
  },
);