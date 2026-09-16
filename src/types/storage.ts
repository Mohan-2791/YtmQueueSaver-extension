import type { UserProfile, RetainScope } from './snapshots';

export type { RetainScope };

export interface ExtensionSettings {
  apiUrl: string;
  maxSnapshotsPerCategory: number;
  songsToRetain: number;
  retainScope: RetainScope;
  googleClientId?: string;
}

export interface StoredSession {
  authToken: string | null;
  googleToken: string | null;
  currentUser: UserProfile | null;
}