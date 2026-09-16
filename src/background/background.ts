import { logger } from '../lib/logger';
import { handleExtensionMessage } from './handlers';
import {
  getSettings,
  setSettings,
  getAuthSession,
  setAuthSession,
  clearAuthSession,
  getStoredCachedQueue,
  setStoredCachedQueue,
  ExtensionSettings,
  StoredSession,
} from '../lib/storage';
import type { ExtensionMessage, CachedQueueData, ApiResponse } from '../types';

logger.info('[YTM Queue Saver] Background service worker loaded.');

chrome.alarms.create('ytm_keep_alive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ytm_keep_alive') {
    logger.info('[YTM Queue Saver] Keep-alive ping.');
  }
});

const STORAGE_BRIDGE_TYPE = '__YTM_QUEUE_SAVER_STORAGE__';

interface StorageBridgeRequest {
  type: typeof STORAGE_BRIDGE_TYPE;
  operation:
    | 'GET_SETTINGS'
    | 'SET_SETTINGS'
    | 'GET_AUTH_SESSION'
    | 'SET_AUTH_SESSION'
    | 'CLEAR_AUTH_SESSION'
    | 'GET_CACHED_QUEUE'
    | 'SET_CACHED_QUEUE';
  payload?: unknown;
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as StorageBridgeRequest).type === STORAGE_BRIDGE_TYPE
  ) {
    const bridgeReq = message as StorageBridgeRequest;

    switch (bridgeReq.operation) {
      case 'GET_SETTINGS':
        getSettings()
          .then((settings: ExtensionSettings) => sendResponse({ ok: true, data: settings }))
          .catch((error: unknown) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        return true;

      case 'SET_SETTINGS':
        setSettings((bridgeReq.payload as Partial<ExtensionSettings>) || {})
          .then(() => sendResponse({ ok: true }))
          .catch((error: unknown) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        return true;

      case 'GET_AUTH_SESSION':
        getAuthSession()
          .then((session: StoredSession) => sendResponse({ ok: true, data: session }))
          .catch((error: unknown) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        return true;

      case 'SET_AUTH_SESSION':
        setAuthSession((bridgeReq.payload as Partial<StoredSession>) || {})
          .then(() => sendResponse({ ok: true }))
          .catch((error: unknown) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        return true;

      case 'CLEAR_AUTH_SESSION':
        clearAuthSession()
          .then(() => sendResponse({ ok: true }))
          .catch((error: unknown) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        return true;

      case 'GET_CACHED_QUEUE':
        getStoredCachedQueue()
          .then((queue: CachedQueueData | null) => sendResponse({ ok: true, data: queue }))
          .catch((error: unknown) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        return true;

      case 'SET_CACHED_QUEUE':
        setStoredCachedQueue((bridgeReq.payload as CachedQueueData) || null)
          .then(() => sendResponse({ ok: true }))
          .catch((error: unknown) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        return true;
    }
  }

  const extMsg = message as ExtensionMessage;
  if (!extMsg || typeof extMsg !== 'object' || !extMsg.action) {
    return false;
  }

  handleExtensionMessage(extMsg)
    .then((response: ApiResponse) => sendResponse(response))
    .catch((err: unknown) =>
      sendResponse({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      }),
    );

  return true;
});