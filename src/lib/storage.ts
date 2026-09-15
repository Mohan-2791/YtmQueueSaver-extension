import {
  isValidHttpUrl,
  isValidUserId,
  isValidRetentionLimit,
} from './validation';

import type {
  CachedQueueData,
  RetainScope,
  UserProfile,
} from '../types';

/**
 * Extension settings persisted in chrome.storage.local.
 *
 * IMPORTANT:
 * The public API of this module intentionally remains compatible with the
 * previous implementation. Existing consumers should not need to change.
 */
export interface ExtensionSettings {
  apiUrl: string;
  userId: number;

  /** Max snapshots kept per category (SESSION_WIPE / ARCHIVE_HISTORY). */
  maxSnapshotsPerCategory: number;

  /** Number of songs to retain per queue save (0 or negative means all songs). */
  songsToRetain: number;

  /**
   * Retain strategy:
   * - all: retain the entire queue up to the configured limit
   * - remaining: retain from the currently playing track onwards
   */
  retainScope: RetainScope;

  /** Optional custom Google OAuth Client ID. */
  googleClientId?: string;
}

/**
 * Authentication/session information persisted in chrome.storage.local.
 */
export interface StoredSession {
  authToken: string | null;
  googleToken: string | null;
  currentUser: UserProfile | null;
}

/**
 * Default settings.
 *
 * These remain intentionally compatible with the previous implementation.
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiUrl:
    import.meta.env.VITE_DEFAULT_API_URL ||
    'https://ytm-queue-saver.onrender.com',

  userId: 1,

  maxSnapshotsPerCategory: 50,

  songsToRetain: 0,

  retainScope: 'all',
};

/* -------------------------------------------------------------------------- */
/* Storage context detection                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Chrome extension APIs are available in extension contexts and isolated
 * content-script worlds.
 *
 * They are NOT available to ordinary page scripts / MAIN-world scripts.
 *
 * We therefore never access chrome.storage.local directly without checking
 * that it exists first.
 */
function getDirectStorageArea():
  | chrome.storage.LocalStorageArea
  | null {
  try {
    const chromeApi = globalThis.chrome;

    if (!chromeApi) {
      return null;
    }

    if (!chromeApi.storage) {
      return null;
    }

    if (!chromeApi.storage.local) {
      return null;
    }

    return chromeApi.storage.local;
  } catch {
    return null;
  }
}

/**
 * Determines whether runtime messaging is available.
 *
 * This is used only as a fallback when direct storage access is unavailable.
 */
function canUseRuntimeMessaging(): boolean {
  try {
    return Boolean(
      globalThis.chrome &&
        globalThis.chrome.runtime &&
        typeof globalThis.chrome.runtime.sendMessage === 'function',
    );
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Internal storage bridge                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Internal message namespace.
 *
 * These messages are deliberately kept separate from the application's public
 * ExtensionMessage union so no existing application message types need to be
 * changed.
 */
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

type StorageBridgeResponse<T = unknown> =
  | StorageBridgeSuccess<T>
  | StorageBridgeFailure;

/**
 * Sends a storage operation to the extension service worker.
 *
 * This fallback is used only when chrome.storage.local is unavailable in the
 * current execution context.
 *
 * The service worker has normal extension privileges and can therefore perform
 * the actual chrome.storage.local operation.
 */
async function sendStorageBridge<T>(
  operation: StorageBridgeOperation,
  payload?: unknown,
): Promise<T> {
  if (!canUseRuntimeMessaging()) {
    throw new Error(
      '[YTM Queue Saver] Extension storage is unavailable in this execution context, and runtime messaging is also unavailable.',
    );
  }

  const request: StorageBridgeRequest = {
    type: STORAGE_BRIDGE_TYPE,
    operation,
    payload,
  };

  return new Promise<T>((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        request,
        (response: StorageBridgeResponse<T> | undefined) => {
          const runtimeError = chrome.runtime.lastError;

          if (runtimeError) {
            reject(
              new Error(
                runtimeError.message ||
                  'Unable to communicate with the extension service worker.',
              ),
            );
            return;
          }

          if (!response) {
            reject(
              new Error(
                'The extension service worker returned no storage response.',
              ),
            );
            return;
          }

          if (!response.ok) {
            reject(new Error(response.error));
            return;
          }

          resolve(response.data as T);
        },
      );
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : new Error(String(error)),
      );
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reads extension settings from chrome.storage.local with safe defaults.
 *
 * Existing behavior is preserved.
 */
export async function getSettings(): Promise<ExtensionSettings> {
  const storage = getDirectStorageArea();

  let res: Record<string, unknown>;

  if (storage) {
    res = (await storage.get([
      'apiUrl',
      'userId',
      'maxSnapshotsPerCategory',
      'songsToRetain',
      'retainScope',
      'googleClientId',
    ])) as Record<string, unknown>;
  } else {
    res =
      (await sendStorageBridge<Record<string, unknown>>(
        'GET_SETTINGS',
      )) || {};
  }

  const apiUrl =
    typeof res.apiUrl === 'string' &&
    isValidHttpUrl(res.apiUrl)
      ? res.apiUrl
      : DEFAULT_SETTINGS.apiUrl;

  const userId =
    typeof res.userId === 'number' &&
    isValidUserId(res.userId)
      ? res.userId
      : DEFAULT_SETTINGS.userId;

  const maxSnapshotsPerCategory =
    typeof res.maxSnapshotsPerCategory === 'number' &&
    isValidRetentionLimit(res.maxSnapshotsPerCategory)
      ? res.maxSnapshotsPerCategory
      : DEFAULT_SETTINGS.maxSnapshotsPerCategory;

  const songsToRetain =
    typeof res.songsToRetain === 'number' &&
    res.songsToRetain >= 0
      ? res.songsToRetain
      : DEFAULT_SETTINGS.songsToRetain;

  const retainScope: RetainScope =
    res.retainScope === 'remaining'
      ? 'remaining'
      : 'all';

  const googleClientId =
    typeof res.googleClientId === 'string' &&
    res.googleClientId.trim()
      ? res.googleClientId.trim()
      : undefined;

  return {
    apiUrl,
    userId,
    maxSnapshotsPerCategory,
    songsToRetain,
    retainScope,
    googleClientId,
  };
}

/**
 * Updates one or more extension settings.
 *
 * Existing callers can continue passing Partial<ExtensionSettings>.
 */
export async function setSettings(
  settings: Partial<ExtensionSettings>,
): Promise<void> {
  const storage = getDirectStorageArea();

  if (storage) {
    await storage.set(settings);
    return;
  }

  await sendStorageBridge<void>('SET_SETTINGS', settings);
}

/* -------------------------------------------------------------------------- */
/* Authentication/session storage                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reads the stored authentication session.
 */
export async function getAuthSession(): Promise<StoredSession> {
  const storage = getDirectStorageArea();

  let res: Record<string, unknown>;

  if (storage) {
    res = (await storage.get([
      'authToken',
      'googleToken',
      'currentUser',
    ])) as Record<string, unknown>;
  } else {
    res =
      (await sendStorageBridge<Record<string, unknown>>(
        'GET_AUTH_SESSION',
      )) || {};
  }

  return {
    authToken:
      typeof res.authToken === 'string'
        ? res.authToken
        : null,

    googleToken:
      typeof res.googleToken === 'string'
        ? res.googleToken
        : null,

    currentUser:
      (res.currentUser as UserProfile) || null,
  };
}

/**
 * Stores part or all of the authentication session.
 */
export async function setAuthSession(
  session: Partial<StoredSession>,
): Promise<void> {
  const storage = getDirectStorageArea();

  if (storage) {
    await storage.set(session);
    return;
  }

  await sendStorageBridge<void>(
    'SET_AUTH_SESSION',
    session,
  );
}

/**
 * Clears all authentication/session information.
 */
export async function clearAuthSession(): Promise<void> {
  const storage = getDirectStorageArea();

  if (storage) {
    await storage.remove([
      'authToken',
      'googleToken',
      'currentUser',
    ]);
    return;
  }

  await sendStorageBridge<void>(
    'CLEAR_AUTH_SESSION',
  );
}

/* -------------------------------------------------------------------------- */
/* Live cached queue                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Gets the queue currently cached by the YouTube Music content script.
 */
export async function getStoredCachedQueue(): Promise<CachedQueueData | null> {
  const storage = getDirectStorageArea();

  if (storage) {
    const res = await storage.get('currentCachedQueue');

    return (
      (res.currentCachedQueue as CachedQueueData) ||
      null
    );
  }

  return (
    (await sendStorageBridge<CachedQueueData | null>(
      'GET_CACHED_QUEUE',
    )) || null
  );
}

/**
 * Stores or clears the live cached queue.
 *
 * The storage key remains exactly the same as before:
 *
 *     currentCachedQueue
 *
 * This means existing popup/background functionality remains compatible.
 */
export async function setStoredCachedQueue(
  queue: CachedQueueData | null,
): Promise<void> {
  const storage = getDirectStorageArea();

  if (storage) {
    if (!queue) {
      await storage.remove('currentCachedQueue');
    } else {
      await storage.set({
        currentCachedQueue: queue,
      });
    }

    return;
  }

  await sendStorageBridge<void>(
    'SET_CACHED_QUEUE',
    queue,
  );
}