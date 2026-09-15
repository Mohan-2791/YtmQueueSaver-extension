/**
 * Leading+trailing throttle: guarantees `fn` runs at least once every
 * `waitMs`, even under a continuous stream of calls. This matters for the
 * queue MutationObserver — YouTube Music's player UI mutates the DOM
 * almost constantly during playback (progress bar, timestamps, buffering
 * state), so a plain trailing-edge *debounce* can starve indefinitely and
 * never get a quiet window to fire in. Throttle avoids that failure mode
 * while still bounding how often we re-scrape the DOM.
 */
export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): (...args: Args) => void {
  let lastRan = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return (...args: Args) => {
    const now = Date.now();
    const remaining = waitMs - (now - lastRan);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      lastRan = now;
      fn(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastRan = Date.now();
        timeout = undefined;
        fn(...args);
      }, remaining);
    }
  };
}
