export type Category = 'SESSION_WIPE' | 'ARCHIVE_HISTORY';
export type PlaybackMode = 'SONG' | 'VIDEO';
export type RetainScope = 'all' | 'remaining';

export interface Track {
  videoId: string;
  title: string;
  artist?: string;
  duration?: string;
  thumbnail?: string;
  isPlaying?: boolean;
}

export interface PlaylistSnapshot {
  id: number;
  user_id: number;
  title: string;
  category: Category;
  playback_mode: PlaybackMode;
  tracks: Track[];
  created_at: string;
}

export interface SnapshotCreatePayload {
  user_id?: number;
  title: string;
  category: Category;
  playback_mode: PlaybackMode;
  tracks: Track[];
}

export interface CachedQueueData {
  tracks: Track[];
  count: number;
  playbackMode: PlaybackMode;
  currentTrackIndex: number;
  updatedAt: string;
  sourceTitle?: string;
}

export interface UserProfile {
  id?: string;
  googleId?: string;
  email?: string;
  name?: string;
  picture?: string;
}
