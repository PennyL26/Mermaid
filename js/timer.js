// ============================================================
// timer.js — a single question's countdown timer.
//
// Design goals (spec sections 16, 17, 25, 34, 37):
//  - based on real elapsed time (performance.now()), not on
//    counting setInterval ticks
//  - pause/resume preserves exact position
//  - fires its completion callback AT MOST ONCE (guarded/idempotent)
//  - exposes a cancel() so the owner can guarantee at most one
//    active timer at any time
// ============================================================

export class QuestionTimer {
  /**
   * @param {number} durationMs total countdown duration in milliseconds
   * @param {Object} callbacks
   * @param {(fraction:number, remainingMs:number)=>void} callbacks.onTick fraction in [0,1] elapsed
   * @param {()=>void} callbacks.onComplete called exactly once when the timer reaches 0 remaining, only if not cancelled/paused-out
   */
  constructor(durationMs, { onTick, onComplete }) {
    this.durationMs = durationMs;
    this.onTick = onTick || (() => {});
    this.onComplete = onComplete || (() => {});

    this._elapsedBeforePause = 0;
    this._startTimestamp = null;
    this._running = false;
    this._completed = false;
    this._rafId = null;
  }

  start() {
    if (this._completed) return;
    this._elapsedBeforePause = 0;
    this._startTimestamp = performance.now();
    this._running = true;
    this._loop();
  }

  pause() {
    if (!this._running || this._completed) return;
    this._running = false;
    this._elapsedBeforePause += performance.now() - this._startTimestamp;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  resume() {
    if (this._running || this._completed) return;
    this._running = true;
    this._startTimestamp = performance.now();
    this._loop();
  }

  /** Stop the timer permanently without firing onComplete. Idempotent. */
  cancel() {
    this._running = false;
    this._completed = true; // guards against any late callback firing
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  get isPaused() {
    return !this._running && !this._completed;
  }

  _currentElapsedMs() {
    if (!this._running) return this._elapsedBeforePause;
    return this._elapsedBeforePause + (performance.now() - this._startTimestamp);
  }

  _loop() {
    if (!this._running || this._completed) return;
    const elapsed = Math.min(this._currentElapsedMs(), this.durationMs);
    const fraction = this.durationMs > 0 ? elapsed / this.durationMs : 1;
    this.onTick(fraction, this.durationMs - elapsed);

    if (elapsed >= this.durationMs) {
      // Reached the end exactly once: guard, stop, and fire completion.
      if (this._completed) return;
      this._completed = true;
      this._running = false;
      if (this._rafId !== null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      this.onComplete();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._loop());
  }
}
