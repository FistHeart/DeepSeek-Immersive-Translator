/**
 * Translation Watchdog v1 — deadlock prevention and auto-recovery.
 *
 * Runs periodic checks to prevent:
 *   - RED indicator deadlock (stuck in 'detected' > 4s)
 *   - Visible untranslated paragraphs
 *   - Missed viewport scheduling
 *   - Translation starvation
 *
 * Recovery actions are delegated to callbacks registered by ArticleTranslator.
 */
const TransWatchdog = {
  _timer: null,
  _interval: 2000,       // Check every 2s
  _stuckThreshold: 4000, // 4s in 'detected' = stuck
  _onStuck: null,        // callback(stuckElements[])
  _onVisibleUntranslated: null, // callback(visibleUntranslated[])
  _onQueueFlush: null,   // callback() — request queue flush
  _running: false,
  _recoveryInFlight: new Set(), // prevent duplicate recovery triggers

  /**
   * Start the watchdog cycle.
   * @param {Object} callbacks
   * @param {Function} callbacks.onStuck - called with array of stuck elements in 'detected' state
   * @param {Function} callbacks.onVisibleUntranslated - called with visible elements lacking translation
   * @param {Function} callbacks.onQueueFlush - request queue processing
   */
  start(callbacks = {}) {
    if (this._running) return;
    this._running = true;
    this._onStuck = callbacks.onStuck || null;
    this._onVisibleUntranslated = callbacks.onVisibleUntranslated || null;
    this._onQueueFlush = callbacks.onQueueFlush || null;
    this._recoveryInFlight.clear();
    console.log('[DTI] Watchdog started — interval:', this._interval, 'ms, stuck threshold:', this._stuckThreshold, 'ms');
    this._tick();
  },

  stop() {
    this._running = false;
    clearTimeout(this._timer);
    this._timer = null;
    this._recoveryInFlight.clear();
    console.log('[DTI] Watchdog stopped');
  },

  /** Immediate check (called after batch completion too) */
  poke() {
    if (!this._running) return;
    clearTimeout(this._timer);
    this._tick();
  },

  _tick() {
    if (!this._running) return;
    this._check();
    this._timer = setTimeout(() => this._tick(), this._interval);
  },

  _check() {
    const now = Date.now();
    const stuck = [];
    const visibleUntranslated = [];

    for (const [el, entry] of ParaState._map) {
      // Skip elements being recovered already
      if (this._recoveryInFlight.has(el)) continue;

      const state = entry.state;
      const ts = entry.timestamp || 0;
      const age = now - ts;

      // Stuck detection: 'detected' state > threshold
      if (state === 'detected' && age > this._stuckThreshold) {
        stuck.push(el);
        this._recoveryInFlight.add(el);
        console.log('[DTI] Watchdog: stuck RED paragraph detected, age=', age, 'ms, text=', el.textContent?.substring(0, 50));
      }

      // Stuck detection: 'error' state > threshold (2x threshold for errors)
      if (state === 'error' && age > this._stuckThreshold * 2) {
        stuck.push(el);
        this._recoveryInFlight.add(el);
        console.log('[DTI] Watchdog: stuck ERROR paragraph detected, age=', age, 'ms');
      }

      // Visible content guarantee: visible but untranslated
      if ((state === 'detected' || state === 'error') && ViewportManager.isVisible(el)) {
        visibleUntranslated.push(el);
        if (!this._recoveryInFlight.has(el)) {
          this._recoveryInFlight.add(el);
          console.log('[DTI] Watchdog: visible untranslated paragraph, priority=high, text=', el.textContent?.substring(0, 50));
        }
      }
    }

    // Trigger recovery callbacks
    if (stuck.length && this._onStuck) {
      this._onStuck(stuck);
    }
    if (visibleUntranslated.length && this._onVisibleUntranslated) {
      this._onVisibleUntranslated(visibleUntranslated);
    }
    // Always request queue flush if anything was found
    if ((stuck.length || visibleUntranslated.length) && this._onQueueFlush) {
      this._onQueueFlush();
    }
  },

  /** Mark an element as no longer in recovery (called after recovery completes) */
  clearRecovery(el) {
    this._recoveryInFlight.delete(el);
  },

  /** Reset all recovery tracking */
  reset() {
    this._recoveryInFlight.clear();
  }
};
