// Injected into the page's MAIN execution world at document_start.
// Prevents YouTube Music from pausing audio when switching to another tab.
(function enableBackgroundPlayback() {
  try {
    // 1. Override Page Visibility API
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true,
    });

    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true,
    });

    // 2. Prevent visibilitychange events from reaching YouTube Music's player
    const stopVisibilityEvents = (e: Event) => {
      e.stopImmediatePropagation();
    };

    window.addEventListener('visibilitychange', stopVisibilityEvents, true);
    document.addEventListener('visibilitychange', stopVisibilityEvents, true);

    // 3. Block blur/focusout events that some media players use to pause
    window.addEventListener(
      'blur',
      (e) => {
        // Only stop propagation if target is window/document
        if (e.target === window || e.target === document) {
          e.stopImmediatePropagation();
        }
      },
      true,
    );

    console.info('[YTM Queue Saver] Background playback keeper active.');
  } catch (err) {
    console.warn('[YTM Queue Saver] Could not install background playback hook:', err);
  }
})();
