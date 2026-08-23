// ============================================================================
// timer.js — QuestionTimer: a single, guarded timer per question.
//
// Design notes (spec §17, §34-37):
//  - Based on performance.now() elapsed time, NOT on counting rAF/interval
//    callbacks, so pausing/resuming or a slow frame never skews duration.
//  - Only ONE QuestionTimer instance may be "live" at a time; quiz.js is
//    responsible for calling .cancel() on the previous timer before creating
//    a new one (§37 timer lifecycle).
//  - onTick(remainingMs, totalMs) drives the UI progress bar.
//  - onExpire() fires exactly once when time runs out.
// ============================================================================

export class QuestionTimer {
  /**
   * @param {number} totalSeconds
   * @param {Object} callbacks
   * @param {(remainingMs:number, totalMs:number) => void} callbacks.onTick
   * @param {() => void} callbacks.onExpire
   */
  constructor(totalSeconds, { onTick, onExpire }) {
    this.totalMs = totalSeconds * 1000;
    this.onTick = onTick || (() => {});
    this.onExpire = onExpire || (() => {});

    this._elapsedMs = 0;       // accumulated elapsed time (frozen while paused)
    this._segmentStart = null; // performance.now() when the current running segment began
    this._running = false;
    this._expired = false;
    this._cancelled = false;
    this._rafId = null;
  }

  /** Begin running. Should be called only once the question is visible (§17, §33). */
  start() {
    if (this._cancelled) return;
    this._running = true;
    this._segmentStart = performance.now();
    this._tick();
  }

  /** Pause: freeze elapsed time, stop ticking. Idempotent. (§34) */
  pause() {
    if (!this._running || this._cancelled || this._expired) return;
    this._accumulate();
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Resume from exactly where it was paused. Idempotent. (§34) */
  resume() {
    if (this._running || this._cancelled || this._expired) return;
    this._segmentStart = performance.now();
    this._running = true;
    this._tick();
  }

  /** Permanently stop this timer (used on completion or when moving to next question). (§37) */
  cancel() {
    this._cancelled = true;
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  get remainingMs() {
    let elapsed = this._elapsedMs;
    if (this._running && this._segmentStart !== null) {
      elapsed += performance.now() - this._segmentStart;
    }
    return Math.max(0, this.totalMs - elapsed);
  }

  _accumulate() {
    if (this._segmentStart !== null) {
      this._elapsedMs += performance.now() - this._segmentStart;
      this._segmentStart = null;
    }
  }

  _tick() {
    if (this._cancelled || !this._running || this._expired) return;
    const remaining = this.remainingMs;
    this.onTick(remaining, this.totalMs);
    if (remaining <= 0) {
      this._expired = true;
      this._running = false;
      if (this._rafId !== null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      this.onExpire(); // fires exactly once (§30, §36)
      return;
    }
    this._rafId = requestAnimationFrame(() => this._tick());
  }
}
