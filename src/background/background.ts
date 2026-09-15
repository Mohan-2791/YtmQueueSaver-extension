import { logger } from '../lib/logger';
import { ApiError } from '../lib/fetchWithTimeout';

import {
  saveSnapshot,
  fetchSnapshots,
  restoreSnapshot,
  deleteSnapshot,
  restoreDirectPlaylist,
  loginWithGoogle,
  loginTestUser,
  logout,
  getAuthState,
  getCachedQueueData,
  clearCachedQueueData,
} from './handlers';

import {
  getSettings,
  setSettings,
  getAuthSession,
  setAuthSession,
  clearAuthSession,
  getStoredCachedQueue,
  setStoredCachedQueue,
} from '../lib/storage';

import type {
  ExtensionMessage,
  ApiResponse,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Error handling                                                             */
/* -------------------------------------------------------------------------- */

function toErrorResponse(err: unknown): ApiResponse {
  const message =
    err instanceof ApiError || err instanceof Error
      ? err.message
      : String(err);

  return {
    status: 'error',
    message,
  };
}

/* -------------------------------------------------------------------------- */
/* Internal storage bridge                                                    */
/* -------------------------------------------------------------------------- */

/**
 * This bridge exists specifically for contexts where chrome.storage.local
 * isn't exposed directly.
 *
 * Normal extension contexts continue using chrome.storage.local directly.
 *
 * The bridge is intentionally namespaced so it cannot collide with the
 * application's normal ExtensionMessage actions.
 */
const STORAGE_BRIDGE_TYPE =
  '__YTM_QUEUE_SAVER_STORAGE__';

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

interface StorageBridgeSuccess {
  ok: true;
  data?: unknown;
}

interface StorageBridgeFailure {
  ok: false;
  error: string;
}

type StorageBridgeResponse =
  | StorageBridgeSuccess
  | StorageBridgeFailure;

/**
 * Returns a safe error string suitable for crossing the Chrome messaging
 * boundary.
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

/**
 * Processes internal storage bridge requests.
 *
 * IMPORTANT:
 * This listener is intentionally NOT async.
 *
 * Chrome's runtime messaging API requires an explicit `true` return when
 * sendResponse() will happen asynchronously. This also keeps the code
 * compatible with Chrome versions where Promise-returning listeners aren't
 * universally available. :contentReference[oaicite:2]{index=2}
 */
chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    sender,
    sendResponse: (
      response?: StorageBridgeResponse,
    ) => void,
  ): boolean => {
    const request =
      message as Partial<StorageBridgeRequest> | null;

    if (
      !request ||
      request.type !== STORAGE_BRIDGE_TYPE
    ) {
      return false;
    }

    /*
     * Only accept messages originating from this extension.
     *
     * runtime.onMessage already scopes normal extension messaging to the
     * extension, but this additional check makes the bridge explicit.
     */
    if (
      sender.id &&
      chrome.runtime.id &&
      sender.id !== chrome.runtime.id
    ) {
      sendResponse({
        ok: false,
        error: 'Unauthorized storage bridge request.',
      });

      return false;
    }

    const operation = request.operation;

    if (!operation) {
      sendResponse({
        ok: false,
        error: 'Missing storage bridge operation.',
      });

      return false;
    }

    /*
     * GET_SETTINGS
     */
    if (operation === 'GET_SETTINGS') {
      getSettings()
        .then((settings) => {
          sendResponse({
            ok: true,
            data: settings,
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: getErrorMessage(error),
          });
        });

      return true;
    }

    /*
     * SET_SETTINGS
     */
    if (operation === 'SET_SETTINGS') {
      const settings =
        request.payload &&
        typeof request.payload === 'object'
          ? request.payload as Parameters<
              typeof setSettings
            >[0]
          : {};

      setSettings(settings)
        .then(() => {
          sendResponse({
            ok: true,
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: getErrorMessage(error),
          });
        });

      return true;
    }

    /*
     * GET_AUTH_SESSION
     */
    if (operation === 'GET_AUTH_SESSION') {
      getAuthSession()
        .then((session) => {
          sendResponse({
            ok: true,
            data: session,
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: getErrorMessage(error),
          });
        });

      return true;
    }

    /*
     * SET_AUTH_SESSION
     */
    if (operation === 'SET_AUTH_SESSION') {
      const session =
        request.payload &&
        typeof request.payload === 'object'
          ? request.payload as Parameters<
              typeof setAuthSession
            >[0]
          : {};

      setAuthSession(session)
        .then(() => {
          sendResponse({
            ok: true,
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: getErrorMessage(error),
          });
        });

      return true;
    }

    /*
     * CLEAR_AUTH_SESSION
     */
    if (operation === 'CLEAR_AUTH_SESSION') {
      clearAuthSession()
        .then(() => {
          sendResponse({
            ok: true,
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: getErrorMessage(error),
          });
        });

      return true;
    }

    /*
     * GET_CACHED_QUEUE
     */
    if (operation === 'GET_CACHED_QUEUE') {
      getStoredCachedQueue()
        .then((queue) => {
          sendResponse({
            ok: true,
            data: queue,
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: getErrorMessage(error),
          });
        });

      return true;
    }

    /*
     * SET_CACHED_QUEUE
     *
     * The content script can call this frequently while YouTube Music is
     * mutating the queue. We serialize writes to avoid overlapping writes to
     * the same storage key.
     */
    if (operation === 'SET_CACHED_QUEUE') {
      const queue =
        request.payload === null
          ? null
          : request.payload as Parameters<
              typeof setStoredCachedQueue
            >[0];

      cachedQueueWriteChain = cachedQueueWriteChain
        .catch(() => undefined)
        .then(() =>
          setStoredCachedQueue(queue),
        )
        .then(() => {
          sendResponse({
            ok: true,
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: getErrorMessage(error),
          });
        });

      return true;
    }

    sendResponse({
      ok: false,
      error: `Unsupported storage bridge operation: ${String(
        operation,
      )}`,
    });

    return false;
  },
);

/**
 * Serializes cached queue writes.
 *
 * The content script already throttles queue scraping, but this additional
 * serialization prevents concurrent writes from racing when several DOM
 * mutations occur close together.
 */
let cachedQueueWriteChain: Promise<void> = Promise.resolve();

/* -------------------------------------------------------------------------- */
/* Application message handling                                               */
/* -------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener(
  (
    request: ExtensionMessage,
    _sender,
    sendResponse: (
      response: ApiResponse,
    ) => void,
  ) => {
    switch (request.action) {
      case 'SAVE_SNAPSHOT': {
        saveSnapshot(request.payload)
          .then((data) =>
            sendResponse({
              status: 'success',
              data,
            }),
          )
          .catch((err) => {
            logger.error(
              'SAVE_SNAPSHOT failed',
              err,
            );

            sendResponse(
              toErrorResponse(err),
            );
          });

        return true;
      }

      case 'FETCH_SNAPSHOTS': {
        fetchSnapshots(request.category)
          .then((data) =>
            sendResponse({
              status: 'success',
              data,
            }),
          )
          .catch((err) => {
            logger.error(
              'FETCH_SNAPSHOTS failed',
              err,
            );

            sendResponse(
              toErrorResponse(err),
            );
          });

        return true;
      }

      case 'RESTORE_SNAPSHOT': {
        restoreSnapshot(request.snapshotId)
          .then((data) =>
            sendResponse({
              status: 'success',
              data,
            }),
          )
          .catch((err) => {
            logger.error(
              'RESTORE_SNAPSHOT failed',
              err,
            );

            sendResponse(
              toErrorResponse(err),
            );
          });

        return true;
      }

      case 'DELETE_SNAPSHOT': {
        deleteSnapshot(request.snapshotId)
          .then(() =>
            sendResponse({
              status: 'success',
            }),
          )
          .catch((err) => {
            logger.error(
              'DELETE_SNAPSHOT failed',
              err,
            );

            sendResponse(
              toErrorResponse(err),
            );
          });

        return true;
      }

      case 'RESTORE_DIRECT_PLAYLIST': {
        const {
          title,
          tracks,
          playbackMode,
        } = request.payload;

        restoreDirectPlaylist(
          title,
          tracks,
          playbackMode,
        )
          .then((data) =>
            sendResponse({
              status: 'success',
              data,
            }),
          )
          .catch((err) => {
            logger.error(
              'RESTORE_DIRECT_PLAYLIST failed',
              err,
            );

            sendResponse(
              toErrorResponse(err),
            );
          });

        return true;
      }

      case 'GET_CACHED_QUEUE': {
        getCachedQueueData()
          .then((data) =>
            sendResponse({
              status: 'success',
              data,
            }),
          )
          .catch((err) =>
            sendResponse(
              toErrorResponse(err),
            ),
          );

        return true;
      }

      case 'CLEAR_CACHED_QUEUE': {
        clearCachedQueueData()
          .then(() =>
            sendResponse({
              status: 'success',
            }),
          )
          .catch((err) =>
            sendResponse(
              toErrorResponse(err),
            ),
          );

        return true;
      }

      case 'LOGIN_GOOGLE': {
        loginWithGoogle()
          .then((user) =>
            sendResponse({
              status: 'success',
              data: user,
            }),
          )
          .catch((err) => {
            logger.error(
              'LOGIN_GOOGLE failed',
              err,
            );

            sendResponse(
              toErrorResponse(err),
            );
          });

        return true;
      }

      case 'LOGIN_TEST_USER': {
        loginTestUser()
          .then((user) =>
            sendResponse({
              status: 'success',
              data: user,
            }),
          )
          .catch((err) => {
            logger.error(
              'LOGIN_TEST_USER failed',
              err,
            );

            sendResponse(
              toErrorResponse(err),
            );
          });

        return true;
      }

      case 'LOGOUT': {
        logout()
          .then(() =>
            sendResponse({
              status: 'success',
            }),
          )
          .catch((err) =>
            sendResponse(
              toErrorResponse(err),
            ),
          );

        return true;
      }

      case 'GET_AUTH_STATE': {
        getAuthState()
          .then((state) =>
            sendResponse({
              status: 'success',
              data: state,
            }),
          )
          .catch((err) =>
            sendResponse(
              toErrorResponse(err),
            ),
          );

        return true;
      }

      case 'SCRAPE_NOW':
        /*
         * Handled by the content script.
         */
        return false;

      default: {
        const _exhaustive: never = request;

        logger.warn(
          'Unhandled message action',
          _exhaustive,
        );

        return false;
      }
    }
  },
);

logger.info(
  'Background service worker ready.',
);