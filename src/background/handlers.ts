import {
  getSettings,
  getAuthSession,
  setAuthSession,
  clearAuthSession,
  getStoredCachedQueue,
  setStoredCachedQueue,
} from '../lib/storage';
import { fetchJson } from '../lib/fetchWithTimeout';
import { logger } from '../lib/logger';
import type {
  Category,
  PlaylistSnapshot,
  SnapshotCreatePayload,
  UserProfile,
  Track,
  PlaybackMode,
} from '../types';

/**
 * Validates a Google OAuth access token.
 */
async function isGoogleTokenValid(token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensures a valid Google OAuth token is available.
 * Tries non-interactive token refresh if the token is missing or expired.
 */
export async function getValidGoogleToken(): Promise<string | null> {
  const session = await getAuthSession();
  let token = session.googleToken;

  if (token && (await isGoogleTokenValid(token))) {
    return token;
  }

  // Clear invalid token from Google cached state if present
  if (token) {
    const currentToken = token;
    await new Promise<void>((resolve) => {
      chrome.identity.removeCachedAuthToken({ token: currentToken }, () => resolve());
    });
  }

  // Attempt silent non-interactive refresh via Chrome Identity API
  try {
    token = await new Promise<string | null>((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (newToken) => {
        if (chrome.runtime.lastError || !newToken) {
          resolve(null);
        } else {
          resolve(newToken);
        }
      });
    });

    if (token) {
      await setAuthSession({ ...session, googleToken: token });
      return token;
    }
  } catch (err) {
    logger.warn('Non-interactive Google token refresh failed:', err);
  }

  return null;
}

/**
 * Builds standard auth headers for backend requests.
 * Includes both backend JWT and Google OAuth token (if present).
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const { authToken } = await getAuthSession();
  const googleToken = await getValidGoogleToken();

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (googleToken) {
    headers['X-Google-Token'] = googleToken;
  }

  return headers;
}

/**
 * Persists snapshot to local backup in chrome.storage.local so user data
 * is never lost even if backend connection is unavailable.
 */
async function saveLocalBackup(snapshot: PlaylistSnapshot): Promise<void> {
  try {
    const res = await chrome.storage.local.get('localSnapshotsBackup');
    const existing: PlaylistSnapshot[] = Array.isArray(res.localSnapshotsBackup)
      ? res.localSnapshotsBackup
      : [];
    const updated = [snapshot, ...existing.filter((s) => s.id !== snapshot.id)];
    await chrome.storage.local.set({ localSnapshotsBackup: updated.slice(0, 200) });
  } catch (err) {
    logger.warn('Failed to store local snapshot backup', err);
  }
}

async function getLocalBackups(category?: Category): Promise<PlaylistSnapshot[]> {
  try {
    const res = await chrome.storage.local.get('localSnapshotsBackup');
    const list: PlaylistSnapshot[] = Array.isArray(res.localSnapshotsBackup)
      ? res.localSnapshotsBackup
      : [];
    return category ? list.filter((s) => s.category === category) : list;
  } catch {
    return [];
  }
}

/**
 * Saves a queue snapshot. Posts to backend API with fallback to local storage.
 */
export async function saveSnapshot(payload: SnapshotCreatePayload): Promise<PlaylistSnapshot> {
  logger.info('[DIAG] saveSnapshot() called with', payload.title, payload.tracks?.length, 'tracks');
  const { apiUrl, userId, maxSnapshotsPerCategory } = await getSettings();
  const headers = await getAuthHeaders();
  const body: SnapshotCreatePayload = { ...payload, user_id: userId };

  let created: PlaylistSnapshot;

  try {
    created = await fetchJson<PlaylistSnapshot>(`${apiUrl}/api/snapshots`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.warn('Backend snapshot save failed, using local persistent fallback:', err);
    created = {
      id: Date.now(),
      user_id: userId,
      title: payload.title,
      category: payload.category,
      playback_mode: payload.playback_mode,
      tracks: payload.tracks,
      created_at: new Date().toISOString(),
    };
  }

  await saveLocalBackup(created);

  enforceRetentionLimit(payload.category, maxSnapshotsPerCategory).catch((err) => {
    logger.error('Failed to enforce snapshot retention limit', err);
  });

  return created;
}

/**
 * Fetches snapshots for a category. Merges backend results with local backups.
 */
export async function fetchSnapshots(category: Category): Promise<PlaylistSnapshot[]> {
  const { apiUrl, userId } = await getSettings();
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ user_id: String(userId), category });

  try {
    const remote = await fetchJson<PlaylistSnapshot[]>(
      `${apiUrl}/api/snapshots?${params.toString()}`,
      { headers },
    );
    if (Array.isArray(remote) && remote.length > 0) {
      for (const s of remote) {
        saveLocalBackup(s).catch(() => {});
      }
      return remote;
    }
  } catch (err) {
    logger.warn('Backend fetch failed, reading from local backup:', err);
  }

  return getLocalBackups(category);
}

/**
 * Creates a playlist directly on YouTube / YouTube Music
 * using the user's verified Google OAuth Access Token via YouTube Data API v3.
 */
export async function createPlaylistOnYouTubeDirect(
  accessToken: string,
  title: string,
  tracks: Track[],
  playbackMode: PlaybackMode,
): Promise<{ playlistId: string; playlistUrl: string }> {
  const description = `Saved via YouTube Music Queue Saver (${playbackMode} Mode) on ${new Date().toLocaleDateString()}`;

  // 1. Create playlist
  const createResp = await fetch(
    'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          title,
          description,
        },
        status: {
          privacyStatus: 'private',
        },
      }),
    },
  );

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`YouTube API playlist creation failed: ${errText}`);
  }

  const playlistData = await createResp.json();
  const playlistId = playlistData.id;

  // 2. Add tracks to playlist in controlled concurrency batches (4 max concurrent)
  const MAX_CONCURRENT_ADDS = 4;
  const videoIds = tracks.map((t) => t.videoId).filter(Boolean);

  async function addTrack(videoId: string): Promise<void> {
    try {
      const res = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: {
            playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            },
          },
        }),
      });
      if (!res.ok) {
        logger.warn(`Failed to add track ${videoId} to playlist ${playlistId}, status: ${res.status}`);
      }
    } catch (itemErr) {
      logger.warn(`Failed to add track ${videoId} to playlist ${playlistId}:`, itemErr);
    }
  }

  for (let i = 0; i < videoIds.length; i += MAX_CONCURRENT_ADDS) {
    const chunk = videoIds.slice(i, i + MAX_CONCURRENT_ADDS);
    await Promise.all(chunk.map((id) => addTrack(id)));
  }

  return {
    playlistId,
    playlistUrl: `https://music.youtube.com/playlist?list=${playlistId}`,
  };
}

/**
 * Restores a snapshot by ID to the user's personal YouTube Music account.
 */
export async function restoreSnapshot(snapshotId: number): Promise<{
  status: string;
  ytm_playlist_id?: string;
  playlist_url?: string;
}> {
  const { apiUrl } = await getSettings();
  const headers = await getAuthHeaders();

  // Try backend restore first
  try {
    const res = await fetchJson<{ status: string; ytm_playlist_id?: string }>(
      `${apiUrl}/api/restore/${encodeURIComponent(String(snapshotId))}`,
      {
        method: 'POST',
        headers,
        retries: 0,
        timeoutMs: 45000,
      },
    );
    if (res?.ytm_playlist_id) {
      return {
        status: 'success',
        ytm_playlist_id: res.ytm_playlist_id,
        playlist_url: `https://music.youtube.com/playlist?list=${res.ytm_playlist_id}`,
      };
    }
  } catch (backendErr) {
    logger.warn('Backend restore failed, attempting direct YouTube API restore:', backendErr);
  }

  // Fallback: direct YouTube Data API v3 restore using valid Google OAuth Token
  const googleToken = await getValidGoogleToken();

  if (googleToken) {
    const all = await getLocalBackups();
    const snapshot = all.find((s) => s.id === snapshotId);
    if (snapshot && snapshot.tracks.length > 0) {
      const result = await createPlaylistOnYouTubeDirect(
        googleToken,
        snapshot.title,
        snapshot.tracks,
        snapshot.playback_mode,
      );
      return {
        status: 'success',
        ytm_playlist_id: result.playlistId,
        playlist_url: result.playlistUrl,
      };
    }
  }

  throw new Error(
    'Unable to restore playlist. Session expired or missing permissions. Please sign in with Google again.',
  );
}

/**
 * Directly restores arbitrary tracks into a new playlist in user's personal account.
 */
export async function restoreDirectPlaylist(
  title: string,
  tracks: Track[],
  playbackMode: PlaybackMode,
): Promise<{ status: string; ytm_playlist_id?: string; playlist_url?: string }> {
  const googleToken = await getValidGoogleToken();
  if (!googleToken) {
    throw new Error('Please sign in with Google first.');
  }

  const result = await createPlaylistOnYouTubeDirect(googleToken, title, tracks, playbackMode);
  return {
    status: 'success',
    ytm_playlist_id: result.playlistId,
    playlist_url: result.playlistUrl,
  };
}

export async function deleteSnapshot(snapshotId: number): Promise<void> {
  const { apiUrl } = await getSettings();
  const headers = await getAuthHeaders();

  try {
    const res = await chrome.storage.local.get('localSnapshotsBackup');
    const existing: PlaylistSnapshot[] = Array.isArray(res.localSnapshotsBackup)
      ? res.localSnapshotsBackup
      : [];
    await chrome.storage.local.set({
      localSnapshotsBackup: existing.filter((s) => s.id !== snapshotId),
    });
  } catch {}

  try {
    await fetchJson<void>(`${apiUrl}/api/snapshots/${encodeURIComponent(String(snapshotId))}`, {
      method: 'DELETE',
      headers,
    });
  } catch (err) {
    logger.warn('Backend delete snapshot returned error:', err);
  }
}

async function enforceRetentionLimit(category: Category, limit: number): Promise<void> {
  const snapshots = await fetchSnapshots(category);
  if (snapshots.length <= limit) return;

  const oldestFirst = [...snapshots].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const excess = oldestFirst.slice(0, oldestFirst.length - limit);

  await Promise.allSettled(excess.map((snapshot) => deleteSnapshot(snapshot.id)));
  logger.info(`Pruned ${excess.length} old "${category}" snapshots.`);
}

/**
 * Authenticates user via Google OAuth using chrome.identity.
 */
export async function loginWithGoogle(): Promise<UserProfile> {
  const manifest = chrome.runtime.getManifest();
  const settings = await getSettings();
  const clientId = settings.googleClientId || manifest.oauth2?.client_id;

  if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
    throw new Error(
      'Google OAuth Client ID not configured. Please paste your Google Client ID in Settings.',
    );
  }

  if (settings.googleClientId) {
    return new Promise((resolve, reject) => {
      const redirectUri = chrome.identity.getRedirectURL();
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(settings.googleClientId!)}` +
        `&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(
          'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/youtube',
        )}`;

      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          const msg = chrome.runtime.lastError?.message || 'Google authentication was cancelled';
          reject(new Error(msg));
          return;
        }

        try {
          const match = responseUrl.match(/[#&]access_token=([^&]+)/);
          const token = match ? match[1] : null;
          if (!token) throw new Error('No access token received from Google');

          const profile = await processGoogleToken(token);
          resolve(profile);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        const msg = chrome.runtime.lastError?.message || 'Google authentication was cancelled';
        reject(new Error(msg));
        return;
      }

      try {
        const profile = await processGoogleToken(token);
        resolve(profile);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}

/**
 * Processes verified Google OAuth token.
 */
async function processGoogleToken(token: string): Promise<UserProfile> {
  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!userinfoRes.ok) {
    throw new Error('Failed to retrieve user profile from Google');
  }

  const profileData = await userinfoRes.json();
  const userProfile: UserProfile = {
    id: profileData.sub,
    googleId: profileData.sub,
    email: profileData.email,
    name: profileData.name,
    picture: profileData.picture,
  };

  let backendJwt: string | null = null;
  try {
    const { apiUrl } = await getSettings();
    const authRes = await fetchJson<{ access_token: string }>(`${apiUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_token: token,
        token_data: { access_token: token },
      }),
    });
    backendJwt = authRes?.access_token || null;
  } catch (backendErr) {
    logger.warn('Backend user registration skipped or failed:', backendErr);
  }

  await setAuthSession({
    googleToken: token,
    authToken: backendJwt,
    currentUser: userProfile,
  });

  return userProfile;
}

export async function loginTestUser(): Promise<UserProfile> {
  const { apiUrl } = await getSettings();
  const testProfile: UserProfile = {
    id: 'local_1',
    googleId: 'local_dev_user',
    email: 'tester@ytm-saver.local',
    name: 'Local Tester (Dev Mode)',
  };

  let backendJwt: string | null = null;
  try {
    const res = await fetchJson<{ access_token: string }>(`${apiUrl}/api/auth/test-login`, {
      method: 'POST',
    });
    backendJwt = res?.access_token || null;
  } catch (err) {
    logger.warn('Could not reach backend test-login route:', err);
  }

  await setAuthSession({
    googleToken: 'dev_mock_token',
    authToken: backendJwt,
    currentUser: testProfile,
  });

  return testProfile;
}

export async function logout(): Promise<void> {
  const { googleToken } = await getAuthSession();
  if (googleToken) {
    try {
      await new Promise<void>((resolve) => {
        chrome.identity.removeCachedAuthToken({ token: googleToken }, () => resolve());
      });
    } catch (err) {
      logger.warn('Failed to remove cached auth token:', err);
    }
  }

  await clearAuthSession();
}

export async function getAuthState(): Promise<{
  isAuthenticated: boolean;
  user: UserProfile | null;
}> {
  const session = await getAuthSession();
  const validToken = await getValidGoogleToken();
  return {
    isAuthenticated: !!(validToken || session.authToken),
    user: session.currentUser,
  };
}

export async function getCachedQueueData() {
  return getStoredCachedQueue();
}

export async function clearCachedQueueData() {
  return setStoredCachedQueue(null);
}