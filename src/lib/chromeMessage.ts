import type { ExtensionMessage, ApiResponse } from '../types';

/**
 * Promise-based, typed wrapper around chrome.runtime.sendMessage that also
 * surfaces chrome.runtime.lastError (which the raw callback API silently
 * swallows unless you check for it) and times out instead of hanging
 * forever if the service worker doesn't respond.
 */
export function sendExtensionMessage<TResponse = ApiResponse>(
  message: ExtensionMessage,
  timeoutMs = 10000,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The extension did not respond in time.')), timeoutMs);

    try {
      chrome.runtime.sendMessage(message, (response: TResponse) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
