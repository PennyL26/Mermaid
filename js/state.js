// ============================================================================
// state.js — Central, explicit state machine.
// Spec §3 forbids uncontrolled independent booleans that could create
// conflicting states. Every transition goes through setAppState / setQState.
// ============================================================================

import { EventBus } from './utils.js';

// ---- Application-level states ----
export const AppState = Object.freeze({
  LOADING: 'LOADING',
  HOME: 'HOME',
  SETTINGS: 'SETTINGS',
  QUIZ_READY: 'QUIZ_READY',
  QUESTION_ACTIVE: 'QUESTION_ACTIVE',
  QUESTION_PAUSED: 'QUESTION_PAUSED',
  QUESTION_TRANSITION: 'QUESTION_TRANSITION',
  RESULTS: 'RESULTS',
  REVIEW: 'REVIEW',
  ERROR: 'ERROR',
});

// ---- Per-question states ----
export const QuestionStatus = Object.freeze({
  PENDING: 'PENDING',       // not yet shown / not yet completed
  CORRECT: 'CORRECT',
  WRONG: 'WRONG',
  UNANSWERED: 'UNANSWERED',
});

/**
 * AppStateMachine centralizes:
 *  - the current AppState
 *  - a bus for state-change notifications
 * It does NOT own quiz data (that lives in quiz.js's QuizSession), but every
 * module reads/writes the "current screen" exclusively through this object,
 * so two conflicting states (e.g. paused AND transitioning) cannot coexist.
 */
export class AppStateMachine {
  constructor() {
    this._state = AppState.LOADING;
    this.bus = new EventBus();
  }

  get state() {
    return this._state;
  }

  /** Transition to a new AppState. Emits 'change' with {from, to}. */
  set(newState) {
    if (!Object.values(AppState).includes(newState)) {
      throw new Error(`Unknown AppState: ${newState}`);
    }
    const from = this._state;
    this._state = newState;
    this.bus.emit('change', { from, to: newState });
  }

  is(...states) {
    return states.includes(this._state);
  }
}
