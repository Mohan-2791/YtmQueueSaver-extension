import { isValidHttpUrl, isValidRetentionLimit } from './validation';
import type { CachedQueueData, UserProfile, ExtensionSettings, StoredSession } from '../types';

export type { ExtensionSettings, StoredSession };

export const DEFAULT_SETTINGS: ExtensionSettings = {
  // apiUrl: import.meta.env.VITE_DEFAULT_API_URL || 'https://ytm-queue-saver.onrender.com',
  apiUrl: 'http://127.0.0.1:8000',
  maxSnapshotsPerCategory: 50,
  songsToRetain: 0,
  retainScope: 'all',
};

function isExtensionContextValid(): boolean {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

function getDirectStorageArea(): chrome.storage.LocalStorageArea | null {
  try {
    if (!isExtensionContextValid()) return null;
    if (!chrome.storage || !chrome.storage.local) return null;
    return chrome.storage.local;
  } catch {
    return null;
  }
}

function canUseRuntimeMessaging(): boolean {
  try {
    return isExtensionContextValid() && typeof chrome.runtime.sendMessage === 'function';
  } catch {
    return false;
  }
}

const STORAGE_BRIDGE_TYPE = '__YTM_QUEUE_SAVER_STORAGE__';

type StorageBridgeOperation =
  | 'GET_SETTINGS'
  | 'SET_SETTINGS'
  | 'GET_AUTH_SESSION'
  | 'SET_AUTH_SESSION'
  | 'CLEAR_AUTH_SESSION'
  | 'GET_CACHED_QUEUE'
  | 'SET_CACHED_QUEUE';

interface StorageBridgeRequest {
  type: typeof STORAGE_BRIDGE_TYPE;
  operation: StorageBridgeOperation;
  payload?: unknown;
}

interface StorageBridgeSuccess<T = unknown> {
  ok: true;
  data?: T;
}

interface StorageBridgeFailure {
  ok: false;
  error: string;
}

type StorageBridgeResponse<T = unknown> = StorageBridgeSuccess<T> | StorageBridgeFailure;

async function sendStorageBridge<T>(operation: StorageBridgeOperation, payload?: unknown): Promise<T> {
  if (!canUseRuntimeMessaging()) {
    throw new Error('[YTM Queue Saver] Extension storage is unavailable in this execution context.');
  }

  const request: StorageBridgeRequest = {
    type: STORAGE_BRIDGE_TYPE,
    operation,
    payload,
  };

  return new Promise<T>((resolve, reject) => {
    try {
      if (!isExtensionContextValid()) {
        reject(new Error('Extension context invalidated'));
        return;
      }

      chrome.runtime.sendMessage(request, (response: StorageBridgeResponse<T> | undefined) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || 'Communication error.'));
          return;
        }
        if (!response) {
          reject(new Error('No storage response received.'));
          return;
        }
        if (!response.ok) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.data as T);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function getSettings(): Promise<ExtensionSettings> {
  const storage = getDirectStorageArea();
  let res: Record<string, unknown> = {};

  if (storage) {
    try {
      res = (await storage.get([
        'apiUrl',
        'maxSnapshotsPerCategory',
        'songsToRetain',
        'retainScope',
        'googleClientId',
      ])) as Record<string, unknown>;
    } catch {
      res = {};
    }
  } else if (canUseRuntimeMessaging()) {
    try {
      res = (await sendStorageBridge<Record<string, unknown>>('GET_SETTINGS')) || {};
    } catch {
      res = {};
    }
  }

  return {
    apiUrl:
      typeof res.apiUrl === 'string' && isValidHttpUrl(res.apiUrl)
        ? res.apiUrl
        : DEFAULT_SETTINGS.apiUrl,
    maxSnapshotsPerCategory:
      typeof res.maxSnapshotsPerCategory === 'number' && isValidRetentionLimit(res.maxSnapshotsPerCategory)
        ? res.maxSnapshotsPerCategory
        : DEFAULT_SETTINGS.maxSnapshotsPerCategory,
    songsToRetain:
      typeof res.songsToRetain === 'number' && res.songsToRetain >= 0
        ? res.songsToRetain
        : DEFAULT_SETTINGS.songsToRetain,
    retainScope: res.retainScope === 'remaining' ? 'remaining' : 'all',
    googleClientId:
      typeof res.googleClientId === 'string' && res.googleClientId.trim()
        ? res.googleClientId.trim()
        : undefined,
  };
}

export async function setSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const storage = getDirectStorageArea();
  if (storage) {
    await storage.set(settings);
    return;
  }
  if (canUseRuntimeMessaging()) {
    await sendStorageBridge<void>('SET_SETTINGS', settings);
  }
}

export async function getAuthSession(): Promise<StoredSession> {
  const storage = getDirectStorageArea();
  let res: Record<string, unknown> = {};

  if (storage) {
    try {
      res = (await storage.get(['authToken', 'googleToken', 'currentUser'])) as Record<string, unknown>;
    } catch {
      res = {};
    }
  } else if (canUseRuntimeMessaging()) {
    try {
      res = (await sendStorageBridge<Record<string, unknown>>('GET_AUTH_SESSION')) || {};
    } catch {
      res = {};
    }
  }

  return {
    authToken: typeof res.authToken === 'string' ? res.authToken : null,
    googleToken: typeof res.googleToken === 'string' ? res.googleToken : null,
    currentUser: (res.currentUser as UserProfile) || null,
  };
}

export async function setAuthSession(session: Partial<StoredSession>): Promise<void> {
  const storage = getDirectStorageArea();
  if (storage) {
    await storage.set(session);
    return;
  }
  if (canUseRuntimeMessaging()) {
    await sendStorageBridge<void>('SET_AUTH_SESSION', session);
  }
}

export async function clearAuthSession(): Promise<void> {
  const storage = getDirectStorageArea();
  if (storage) {
    await storage.remove(['authToken', 'googleToken', 'currentUser']);
    return;
  }
  if (canUseRuntimeMessaging()) {
    await sendStorageBridge<void>('CLEAR_AUTH_SESSION');
  }
}

export async function getStoredCachedQueue(): Promise<CachedQueueData | null> {
  const storage = getDirectStorageArea();
  if (storage) {
    try {
      const res = await storage.get('currentCachedQueue');
      return (res.currentCachedQueue as CachedQueueData) || null;
    } catch {
      return null;
    }
  }
  if (canUseRuntimeMessaging()) {
    try {
      return (await sendStorageBridge<CachedQueueData | null>('GET_CACHED_QUEUE')) || null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function setStoredCachedQueue(queue: CachedQueueData | null): Promise<void> {
  const storage = getDirectStorageArea();
  if (storage) {
    try {
      if (!queue) {
        await storage.remove('currentCachedQueue');
      } else {
        await storage.set({ currentCachedQueue: queue });
      }
    } catch {}
    return;
  }
  if (canUseRuntimeMessaging()) {
    try {
      await sendStorageBridge<void>('SET_CACHED_QUEUE', queue);
    } catch {}
  }
}