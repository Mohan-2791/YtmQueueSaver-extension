import { logger } from '../lib/logger';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import {
  getSettings,
  getAuthSession,
  setAuthSession,
  clearAuthSession,
  setStoredCachedQueue,
  getStoredCachedQueue,
} from '../lib/storage';
import type {
  ExtensionMessage,
  ApiResponse,
  SnapshotCreatePayload,
  PlaylistSnapshot,
  Category,
  UserProfile,
} from '../types';

async function performGoogleAuth(interactive = true): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!chrome.identity || !chrome.identity.getAuthToken) {
      reject(new Error('Chrome Identity API is not available in this context.'));
      return;
    }

    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error('Failed to acquire Google token.'));
        return;
      }
      resolve(token);
    });
  });
}

async function getOrRefreshToken(): Promise<string> {
  const session = await getAuthSession();
  if (session.authToken) {
    return session.authToken;
  }

  const googleToken = await performGoogleAuth(true);
  const settings = await getSettings();

  const response = await fetchWithTimeout(`${settings.apiUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id_token: googleToken,
      token_data: { access_token: googleToken },
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to authenticate with API server.');
  }

  const authData = (await response.json()) as { access_token: string; user_id?: number };
  const newAuthToken = authData.access_token;

  let profile: UserProfile | null = null;
  try {
    const userinfoResp = await fetchWithTimeout(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${googleToken}` } },
    );
    if (userinfoResp.ok) {
      const uData = (await userinfoResp.json()) as { email?: string; name?: string; picture?: string };
      profile = {
        id: authData.user_id ? String(authData.user_id) : undefined,
        email: uData.email,
        name: uData.name,
        picture: uData.picture,
      };
    }
  } catch (err) {
    logger.warn('[Background] Could not fetch Google user profile details:', err);
  }

  await setAuthSession({
    authToken: newAuthToken,
    googleToken,
    currentUser: profile,
  });

  return newAuthToken;
}

export async function getAuthState(): Promise<{ isAuthenticated: boolean; user: UserProfile | null }> {
  const session = await getAuthSession();
  return {
    isAuthenticated: Boolean(session.authToken),
    user: session.currentUser,
  };
}

export async function loginWithGoogle(): Promise<{ token: string; user: UserProfile | null }> {
  const token = await getOrRefreshToken();
  const session = await getAuthSession();
  return { token, user: session.currentUser };
}

export async function logout(): Promise<boolean> {
  const session = await getAuthSession();
  if (session.googleToken && chrome.identity?.removeCachedAuthToken) {
    await new Promise<void>((resolve) => {
      chrome.identity.removeCachedAuthToken({ token: session.googleToken! }, () => resolve());
    });
  }
  await clearAuthSession();
  return true;
}

export async function saveSnapshot(payload: SnapshotCreatePayload): Promise<PlaylistSnapshot> {
  const token = await getOrRefreshToken();
  const settings = await getSettings();

  const response = await fetchWithTimeout(`${settings.apiUrl}/api/snapshots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 401) {
      await clearAuthSession();
      throw new Error('Session expired. Please log in again.');
    }
    throw new Error('Failed to save queue snapshot.');
  }

  return (await response.json()) as PlaylistSnapshot;
}

export async function fetchSnapshots(category: Category = 'SESSION_WIPE'): Promise<PlaylistSnapshot[]> {
  const token = await getOrRefreshToken();
  const settings = await getSettings();

  const response = await fetchWithTimeout(
    `${settings.apiUrl}/api/snapshots?category=${encodeURIComponent(category)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    if (response.status === 401) {
      await clearAuthSession();
      throw new Error('Session expired. Please log in again.');
    }
    throw new Error('Failed to fetch snapshot history.');
  }

  return (await response.json()) as PlaylistSnapshot[];
}

export async function deleteSnapshot(snapshotId: number): Promise<void> {
  const token = await getOrRefreshToken();
  const settings = await getSettings();

  const response = await fetchWithTimeout(`${settings.apiUrl}/api/snapshots/${snapshotId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error('Failed to delete snapshot.');
  }
}

export async function restoreSnapshot(snapshotId: number): Promise<unknown> {
  const token = await getOrRefreshToken();
  const settings = await getSettings();

  const response = await fetchWithTimeout(
    `${settings.apiUrl}/api/restore/${snapshotId}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
    45000,
  );

  if (!response.ok) {
    throw new Error('Failed to restore snapshot to YouTube Music.');
  }

  return await response.json();
}

export async function handleExtensionMessage(
  message: ExtensionMessage,
): Promise<ApiResponse> {
  try {
    switch (message.action) {
      case 'GET_AUTH_STATUS':
      case 'GET_AUTH_STATE': {
        const data = await getAuthState();
        return { status: 'success', data };
      }

      case 'LOGIN':
      case 'LOGIN_GOOGLE': {
        const data = await loginWithGoogle();
        return { status: 'success', data };
      }

      case 'LOGOUT': {
        await logout();
        return { status: 'success' };
      }

      case 'SAVE_SNAPSHOT': {
        const data = await saveSnapshot(message.payload);
        return { status: 'success', data };
      }

      case 'FETCH_SNAPSHOTS': {
        const data = await fetchSnapshots(message.category);
        return { status: 'success', data };
      }

      case 'DELETE_SNAPSHOT': {
        await deleteSnapshot(message.snapshotId);
        return { status: 'success' };
      }

      case 'RESTORE_SNAPSHOT': {
        const data = await restoreSnapshot(message.snapshotId);
        return { status: 'success', data };
      }

      case 'GET_CACHED_QUEUE': {
        const cached = await getStoredCachedQueue();
        return { status: 'success', data: cached };
      }

      case 'SET_CACHED_QUEUE': {
        await setStoredCachedQueue(message.payload || null);
        return { status: 'success' };
      }

      default:
        return { status: 'error', message: 'Unhandled message action' };
    }
  } catch (err) {
    logger.error('[Background Handler] Error handling action:', err);
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'An unexpected error occurred.',
    };
  }
}