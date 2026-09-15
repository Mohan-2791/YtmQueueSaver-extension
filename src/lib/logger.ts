/**
 * Thin logging wrapper so every message is consistently prefixed. Unlike a
 * public website, this only runs inside the extension's own contexts
 * (content script / background worker / popup) — nobody sees these logs
 * unless they deliberately open DevTools on that context — so we keep
 * debug/info logging on even in production builds. That's deliberate:
 * it's what makes issues like "queue isn't being detected" diagnosable
 * from an already-installed, packaged extension instead of only in `vite dev`.
 */
const PREFIX = '[YTM Queue Saver]';

export const logger = {
  debug: (...args: unknown[]): void => {
    console.debug(PREFIX, ...args);
  },
  info: (...args: unknown[]): void => {
    console.info(PREFIX, ...args);
  },
  warn: (...args: unknown[]): void => {
    console.warn(PREFIX, ...args);
  },
  error: (...args: unknown[]): void => {
    console.error(PREFIX, ...args);
  },
};
