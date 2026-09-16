import type { ExtensionMessage, ApiResponse } from '../types';

export function sendExtensionMessage<TResponse = ApiResponse>(
  message: ExtensionMessage,
  timeoutMs = 10000,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        reject(new Error('Extension context is invalidated or runtime unavailable.'));
        return;
      }

      const timer = setTimeout(() => reject(new Error('The extension did not respond in time.')), timeoutMs);

      chrome.runtime.sendMessage(message, (response: TResponse) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}