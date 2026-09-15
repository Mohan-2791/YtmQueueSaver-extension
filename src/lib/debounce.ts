/**
 * Standard trailing-edge debounce. Used to stop the MutationObserver in the
 * content script from re-scraping the DOM on every single mutation event
 * YouTube Music fires (which can be dozens per second during navigation).
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): (...args: Args) => void {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), waitMs);
  };
}
