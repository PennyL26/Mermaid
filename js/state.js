// ============================================================
// state.js — central application state machine
//
// This is the single source of truth for "where the app is".
// No other module should keep its own independent boolean flags
// that could put the UI into a conflicting state (spec section 3).
// ============================================================
import { devLog } from "./utils.js";

export const States = Object.freeze({
  LOADING: "LOADING",
  WELCOME: "WELCOME", // initial greeting screen (section 14, first half)
  HOME: "HOME", // KUMITE / KATA / SETTINGS / EXIT menu (section 14, second half)
  SETTINGS: "SETTINGS",
  QUIZ_READY: "QUIZ_READY", // transient: quiz session built, about to show first question
  QUESTION_ACTIVE: "QUESTION_ACTIVE",
  QUESTION_PAUSED: "QUESTION_PAUSED",
  QUESTION_TRANSITION: "QUESTION_TRANSITION",
  RESULTS: "RESULTS",
  REVIEW: "REVIEW",
  ERROR: "ERROR",
});

// Explicit allow-list of legal transitions. This is the mechanism that
// enforces the critical constraint from spec section 3: the ONLY legal
// transition out of QUESTION_PAUSED is back to QUESTION_ACTIVE.
const ALLOWED_TRANSITIONS = {
  [States.LOADING]: [States.WELCOME, States.ERROR],
  [States.WELCOME]: [States.HOME],
  [States.HOME]: [States.SETTINGS, States.QUIZ_READY, States.ERROR],
  [States.SETTINGS]: [States.HOME],
  [States.QUIZ_READY]: [States.QUESTION_ACTIVE, States.HOME, States.ERROR],
  [States.QUESTION_ACTIVE]: [States.QUESTION_PAUSED, States.QUESTION_TRANSITION, States.HOME],
  [States.QUESTION_PAUSED]: [States.QUESTION_ACTIVE], // <-- the only allowed exit
  [States.QUESTION_TRANSITION]: [States.QUESTION_ACTIVE, States.RESULTS],
  [States.RESULTS]: [States.REVIEW, States.HOME],
  [States.REVIEW]: [States.RESULTS],
  [States.ERROR]: [States.HOME],
};

class AppStateMachine {
  constructor() {
    this._current = States.LOADING;
    this._listeners = new Set();
  }

  get current() {
    return this._current;
  }

  /**
   * Attempt to transition to a new state. Returns true if the transition
   * was legal and applied, false if it was rejected.
   */
  transition(next, meta = {}) {
    const allowed = ALLOWED_TRANSITIONS[this._current] || [];
    if (!allowed.includes(next)) {
      devLog(`Rejected illegal transition: ${this._current} -> ${next}`);
      return false;
    }
    const prev = this._current;
    this._current = next;
    devLog(`State: ${prev} -> ${next}`, meta);
    for (const listener of this._listeners) {
      try {
        listener(next, prev, meta);
      } catch (e) {
        console.error("State listener error", e);
      }
    }
    return true;
  }

  is(...states) {
    return states.includes(this._current);
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}

export const appState = new AppStateMachine();
