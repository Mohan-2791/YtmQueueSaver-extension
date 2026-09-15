/**
 * Small validation/sanitization helpers. These guard the two settings a
 * user can freely type into (API URL, user ID) and the free-text scraped
 * off the YouTube Music DOM before either gets persisted or sent over
 * the network.
 */

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidUserId(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value < 2 ** 31;
}

/** Keep this sane — 0 would mean "delete everything immediately", and an
 *  unbounded number defeats the point of having a limit at all. */
export function isValidRetentionLimit(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 500;
}

/** Collapses whitespace, trims, and hard-caps length for any scraped text. */
export function sanitizeText(value: string, maxLength = 200): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** YouTube video IDs are always 11 URL-safe characters. */
export function isValidVideoId(value: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}
