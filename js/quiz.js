// ============================================================================
// quiz.js — QuizSession: an isolated snapshot of one exam run.
//
// Central guarantee (spec §28, §36): completeQuestion() is idempotent and
// guarded — the FIRST call for a given question index wins; every subsequent
// call (from a race between TRUE/FALSE/timeout/swipe/click) is a no-op.
// ============================================================================

import { QuestionStatus } from './state.js';
import { pickRandomN, fisherYatesShuffle } from './utils.js';
import { QuestionTimer } from './timer.js';

export class QuizSession {
  /**
   * @param {Object} opts
   * @param {Array} opts.sourceRecords   full validated dataset (never mutated)
   * @param {Object} opts.settingsSnapshot  frozen settings at quiz start (§15, §44)
   * @param {string} opts.discipline     'KUMITE' | 'KATA'
   */
  constructor({ sourceRecords, settingsSnapshot, discipline }) {
    this.discipline = discipline;
    this.settings = Object.freeze({ ...settingsSnapshot }); // snapshot, immutable (§15)
    this.startedAt = new Date();

    // Build the selected question list WITHOUT mutating sourceRecords (§54)
    this.questions = this._selectQuestions(sourceRecords, this.settings);

    // Per-question runtime state, isolated from the source dataset (§54)
    this.answers = this.questions.map(() => null); // true/false/null
    this.statuses = this.questions.map(() => QuestionStatus.PENDING);

    this.currentIndex = -1; // -1 = not started yet
    this.timer = null;

    // Guards against double-completion / double-transition (§28, §36)
    this._questionCompleted = false; // true once current question is locked
    this._transitioning = false;     // true during the fade transition window
  }

  _selectQuestions(sourceRecords, settings) {
    switch (settings.selectionMode) {
      case 'all_ordered':
        return sourceRecords.slice().sort((a, b) => a.number - b.number);
      case 'all_random':
        return fisherYatesShuffle(sourceRecords);
      case 'specific_random':
      default:
        return pickRandomN(sourceRecords, settings.questionCount);
    }
  }

  get total() {
    return this.questions.length;
  }

  get currentQuestion() {
    if (this.currentIndex < 0 || this.currentIndex >= this.total) return null;
    return this.questions[this.currentIndex];
  }

  get isLastQuestion() {
    return this.currentIndex === this.total - 1;
  }

  /** True while the CURRENT question is neither completed nor transitioning — i.e. answerable. */
  get isQuestionAnswerable() {
    return !this._questionCompleted && !this._transitioning;
  }

  /**
   * Starts the timer for the CURRENT question. Cancels any previous timer
   * first (§37: at most one live timer mechanism per question).
   * @param {Object} callbacks {onTick, onExpire}
   */
  startTimerForCurrent(callbacks) {
    if (this.timer) {
      this.timer.cancel();
      this.timer = null;
    }
    this._questionCompleted = false;
    this._transitioning = false;
    this.timer = new QuestionTimer(this.settings.questionTimeSeconds, {
      onTick: callbacks.onTick,
      onExpire: () => {
        this.completeQuestion({ type: 'timeout' });
        callbacks.onExpire();
      },
    });
    this.timer.start();
  }

  pauseTimer() {
    this.timer?.pause();
  }

  resumeTimer() {
    this.timer?.resume();
  }

  /**
   * THE central, guarded completion mechanism (spec §28-32, §36).
   * Every possible triggering event (TRUE/FALSE, timeout, swipe, click)
   * MUST call this. Only the first call for the current question has effect.
   *
   * @param {Object} event
   * @param {'answer'|'timeout'|'swipe'|'click'} event.type
   * @param {boolean} [event.userAnswer] required when type === 'answer'
   * @returns {boolean} true if this call actually completed the question
   */
  completeQuestion(event) {
    // Guard: already completed or mid-transition -> ignore (§28, §33, §36)
    if (this._questionCompleted || this._transitioning) return false;
    if (this.currentIndex < 0 || this.currentIndex >= this.total) return false;

    this._questionCompleted = true; // lock immediately (idempotency)
    this.timer?.cancel(); // stop the timer exactly once (§29 step 6, §37)

    const idx = this.currentIndex;
    const q = this.questions[idx];

    if (event.type === 'answer') {
      const userAnswer = !!event.userAnswer;
      this.answers[idx] = userAnswer;
      this.statuses[idx] = userAnswer === q.answer ? QuestionStatus.CORRECT : QuestionStatus.WRONG;
    } else {
      // timeout, swipe-without-answer, click-without-answer -> UNANSWERED (§30-32)
      this.answers[idx] = null;
      this.statuses[idx] = QuestionStatus.UNANSWERED;
    }

    this._transitioning = true; // enter transition window; blocks further events (§33)
    return true;
  }

  /** Call once the fade transition visually completes, to unlock for the next question. */
  endTransition() {
    this._transitioning = false;
  }

  /** Advance to the next question index. Returns false if quiz is finished. */
  advance() {
    if (this.currentIndex + 1 >= this.total) return false;
    this.currentIndex += 1;
    return true;
  }

  /** Begin the quiz (moves to question index 0). */
  start() {
    this.currentIndex = 0;
  }

  /**
   * Computes results strictly from recorded statuses (§55) — never from
   * separately-tracked UI counters, so drift is structurally impossible.
   */
  computeResults() {
    let correct = 0, wrong = 0, unanswered = 0;
    for (const s of this.statuses) {
      if (s === QuestionStatus.CORRECT) correct++;
      else if (s === QuestionStatus.WRONG) wrong++;
      else if (s === QuestionStatus.UNANSWERED) unanswered++;
      // PENDING should not occur once quiz is finished; if it does, we
      // deliberately do NOT silently count it anywhere to keep the
      // correct+wrong+unanswered===total invariant visible/debuggable.
    }
    const total = this.total;
    const scorePercent = total > 0 ? (correct / total) * 100 : 0;
    return { total, correct, wrong, unanswered, scorePercent };
  }

  /** Wrong + unanswered questions, in original quiz order, for the Review screen (§40). */
  getReviewList() {
    const list = [];
    for (let i = 0; i < this.total; i++) {
      if (this.statuses[i] === QuestionStatus.WRONG || this.statuses[i] === QuestionStatus.UNANSWERED) {
        list.push({
          index: i,
          number: this.questions[i].number,
          question: this.questions[i].question,
          userAnswer: this.answers[i], // null => "NO ANSWER"
          correctAnswer: this.questions[i].answer,
          status: this.statuses[i],
        });
      }
    }
    return list;
  }

  /** Fully stop everything — used when abandoning a quiz or returning HOME. */
  destroy() {
    this.timer?.cancel();
    this.timer = null;
  }
}
