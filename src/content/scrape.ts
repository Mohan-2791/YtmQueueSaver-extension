import { sanitizeText } from '../lib/validation';
import type { PlaybackMode, Track } from '../types';

/** Hard cap so a pathological DOM can't produce an unbounded payload */
const MAX_TRACKS = 500;

/**
 * Minimal shape of the Polymer `.data` object YouTube Music binds onto each
 * <ytmusic-player-queue-item>. This is NOT official/typed by Google — it's
 * YTM's internal rendering data, so treat every field as optional/unstable
 * and never let a missing field throw.
 */
interface QueueItemData {
  videoId?: string;
  title?: { runs?: Array<{ text?: string }> };
  shortBylineText?: { runs?: Array<{ text?: string }> };
  longBylineText?: { runs?: Array<{ text?: string }> };
  lengthText?: { runs?: Array<{ text?: string }> };
  selected?: boolean;
}

function extractRunText(runs?: Array<{ text?: string }>): string {
  if (!runs || runs.length === 0) return '';
  return runs.map((r) => r.text || '').join('').trim();
}

/**
 * Scrapes all track items from the active YouTube Music queue panel.
 *
 * IMPORTANT: We deliberately read from each element's internal Polymer
 * `.data` binding (item.data) rather than parsing visible DOM text/hrefs.
 * YTM's markup (classnames, whether an <a href="watch?v=..."> is even
 * rendered, thumbnail URLs, etc.) changes often and silently breaks
 * text-scraping. The underlying `.data` object is the same structured
 * response data YTM's own UI renders from, so it's a meaningfully more
 * stable surface -- though still an internal/undocumented implementation
 * detail, so every access here stays defensive and falls back to DOM
 * scraping if `.data` is ever missing.
 */
export function scrapeQueue(): Track[] {
  const items = document.querySelectorAll<HTMLElement & { data?: QueueItemData }>(
    'ytmusic-player-queue-item, ytmusic-playlist-panel-video-renderer'
  );

  const queue: Track[] = [];

  for (let i = 0; i < items.length; i++) {
    if (queue.length >= MAX_TRACKS) break;
    const item = items[i];
    if (!item) continue;

    const data = item.data;

    // 1. Extract videoId - prefer the structured data object
    let videoId = data?.videoId || '';

    if (!videoId) {
      // Fallback to old DOM-based extraction in case `.data` is ever absent
      // (e.g. a future YTM rewrite, or a differently-shaped renderer).
      const linkEl = item.querySelector<HTMLAnchorElement>('a[href*="watch?v="]');
      const href = linkEl?.getAttribute('href') || '';
      const match = href.match(/[?&]v=([^&]+)/);
      if (match && match[1]) {
        videoId = match[1];
      }
    }

    if (!videoId) continue;

    // 2. Title
    let rawTitle = extractRunText(data?.title?.runs);
    if (!rawTitle) {
      const titleEl = item.querySelector<HTMLElement>(
        '.song-title, yt-formatted-string.song-title, .title, [has-custom-badge] .title'
      );
      rawTitle = titleEl?.getAttribute('title') || titleEl?.textContent || '';
    }
    const title = sanitizeText(rawTitle.trim() || 'Unknown Track');

    // 3. Artist - shortBylineText is the clean "Artist1 and Artist2" string;
    // longBylineText also includes album/year separated by "•" so we avoid it.
    let rawArtist = extractRunText(data?.shortBylineText?.runs);
    if (!rawArtist) {
      const bylineEl = item.querySelector<HTMLElement>(
        '.byline, yt-formatted-string.byline, .secondary-flex-columns'
      );
      if (bylineEl) {
        const fullByline = bylineEl.textContent || '';
        rawArtist = fullByline.split('•')[0]?.trim() || fullByline;
      }
    }
    const artist = sanitizeText(rawArtist.trim() || 'Unknown Artist');

    // 4. Duration
    let duration = extractRunText(data?.lengthText?.runs) || undefined;
    if (!duration) {
      const durationEl = item.querySelector<HTMLElement>(
        '.duration, yt-formatted-string.duration, span.style-scope.ytmusic-player-queue-item'
      );
      duration = durationEl?.textContent?.trim() || undefined;
    }

    // 5. Thumbnail - always derive from videoId. The thumbnails inside
    // data.thumbnail are channel/artist avatars, NOT video thumbnails.
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

    // 6. Currently Playing Check - data.selected is authoritative when present
    const isPlaying =
      typeof data?.selected === 'boolean'
        ? data.selected
        : item.hasAttribute('selected') ||
          item.classList.contains('selected') ||
          item.getAttribute('play-button-state') === 'playing' ||
          item.getAttribute('play-button-state') === 'paused' ||
          !!item.querySelector('[aria-label*="Pause"], [aria-label*="Now playing"]');

    queue.push({
      videoId,
      title,
      artist,
      duration,
      thumbnail,
      isPlaying
    });
  }

  return queue;
}

/**
 * Returns the index of the currently playing track in the queue, or 0 if none detected.
 */
export function getCurrentPlayingIndex(tracks: Track[]): number {
  const index = tracks.findIndex((t) => t.isPlaying);
  return index >= 0 ? index : 0;
}

/**
 * Detects whether the active player is in Video mode or Song mode.
 */
export function detectPlaybackMode(): PlaybackMode {
  const videoTab = document.querySelector<HTMLElement>(
    'tp-yt-paper-tab#video, .song-video-tab[id="video"]',
  );
  const isVideoSelected =
    videoTab?.classList.contains('iron-selected') ||
    videoTab?.getAttribute('aria-selected') === 'true';

  return isVideoSelected ? 'VIDEO' : 'SONG';
}