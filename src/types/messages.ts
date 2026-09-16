import type { Category, SnapshotCreatePayload, Track, PlaybackMode, CachedQueueData } from './snapshots';

export type ExtensionMessage =
  | { action: 'SAVE_SNAPSHOT'; payload: SnapshotCreatePayload }
  | { action: 'FETCH_SNAPSHOTS'; category?: Category }
  | { action: 'RESTORE_SNAPSHOT'; snapshotId: number }
  | { action: 'DELETE_SNAPSHOT'; snapshotId: number }
  | { action: 'SCRAPE_NOW' }
  | { action: 'GET_CACHED_QUEUE' }
  | { action: 'SET_CACHED_QUEUE'; payload?: CachedQueueData | null }
  | { action: 'CLEAR_CACHED_QUEUE' }
  | { action: 'LOGIN' }
  | { action: 'LOGIN_GOOGLE' }
  | { action: 'LOGOUT' }
  | { action: 'GET_AUTH_STATUS' }
  | { action: 'GET_AUTH_STATE' }
  | {
      action: 'RESTORE_DIRECT_PLAYLIST';
      payload: { title: string; tracks: Track[]; playbackMode: PlaybackMode };
    };