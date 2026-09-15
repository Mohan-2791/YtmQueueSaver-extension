(function() {
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    window.addEventListener('visibilitychange', function(e) { e.stopImmediatePropagation(); }, true);
    document.addEventListener('visibilitychange', function(e) { e.stopImmediatePropagation(); }, true);
  } catch (e) {}
})();