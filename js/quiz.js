// ============================================================
// quiz.js — quiz session lifecycle and the central, guarded
// "complete the current question" mechanism (spec section 28).
//
// Every input path (TRUE, FALSE, timeout, swipe, click) funnels
// through QuizSession#completeQuestion(). It is idempotent: once
// a question is completed, any further call for that same
// question is a no-op. This is what prevents every race condition
// listed in spec section 36.
// ============================================================
import { fisherYatesShuffle, pickRandomN } from "./utils.js";
import { QuestionTimer } from "./timer.js";

export const QuestionStatus = Object.freeze({
  CORRECT: "CORRECT",
  WRONG: "WRONG",
  UNANSWERED: "UNANSWERED",
});

/**
 * Central, single-source-of-truth result message bands for the Results
 * screen (spec section 39). Centralized here for easy tuning.
 * Evaluated top-to-bottom; first matching band wins. Bands are
 * mutually exclusive and cover the full [0,100] range.
 */
export const RESULT_MESSAGE_BANDS = [
  { min: 100, max: 100, color: "blue", text: "ΑΓΑΠΗ ΜΟΥ ΓΛΥΚΙΑ!!! ΕΙΣΑΙ ΑΨΟΓΗ!!! ΕΞΑΙΡΕΤΙΚΗ!!!    Ελπίζω να έχεις μαζί σου αυτόγραφα, γιατί σε λίγο θα σου ζητάμε όλοι!!!" },
  { min: 90, max: 99.999, color: "green", text: "Θα προσποιηθώ ότι δεν το είδα αυτό, για να μην χαλάσω την εικόνα που έχω για σένα ως ιδιοφυΐα. Πάμε άλλη μια;" },
  { min: 80, max: 89.999, color: "green", text: "Όχι κάτι που θα έγραφε η ιστορία...! Τώρα κάνε το ίδιο, αλλά βάλε να δουλέψει και το υπόλοιπο 90% του εγκεφάλου σου!" },
  { min: 75, max: 79.999, color: "red", text: "Αν η προσπάθειά σου ήταν καφές, αυτό θα ήταν ντεκαφεϊνέ. Δεν το λες αποτυχία, αλλά δεν το λες και λόγο για να ανοίξουμε σαμπάνιες..." },
  { min: 70, max: 74.999, color: "orange", text: "Ποια είσαι εσύ; Σίγουρα όχι η Penny!!! Ζηλεύεις το επίπεδο καπουλέα μήπως;;; Ας κρατήσουμε από αυτό μόνο το ότι... τελείωσε." },
  { min: 60, max: 69.999, color: "red", text: "Τώρα έπεσες στο επίπεδο αρνάρη… Υπήρξε μια εμφανής έλλειψη... οποιασδήποτε μορφής προσπάθειας..." },
  { min: 55, max: 59.999, color: "red", text: "Τώρα προσπαθείς να δώσεις στο επίπεδο αρνάρη νέες διαστάσεις... Πιο κάτω, βρίσκεις πετρέλαιο." },
  { min: 0, max: 54.999, color: "red", text: "Αν η προσπάθειά σου ήταν πλοίο, ο Τιτανικός μπροστά του θα φαινόταν success story... Μήπως να βρεις να κάνεις κάτι άλλο πιο εποικοδομητικό;;;" },
];

export function resultMessageForPercent(percent) {
  for (const band of RESULT_MESSAGE_BANDS) {
    if (percent >= band.min && percent <= band.max) return band;
  }
  return RESULT_MESSAGE_BANDS[RESULT_MESSAGE_BANDS.length - 1];
}

/**
 * Build the ordered list of questions for a new session, according to the
 * settings snapshot's selection mode (spec section 18).
 * @returns {{ok:true, questions:Array} | {ok:false, reason:string}}
 */
export function buildQuestionSequence(allValidQuestions, settingsSnapshot) {
  const total = allValidQuestions.length;
  switch (settingsSnapshot.selectionMode) {
    case "specific_random": {
      const n = settingsSnapshot.questionCount;
      if (n > total) {
        return { ok: false, reason: `Ζητήθηκαν ${n} ερωτήσεις, αλλά υπάρχουν μόνο ${total} διαθέσιμες.` };
      }
      return { ok: true, questions: pickRandomN(allValidQuestions, n) };
    }
    case "all_ordered": {
      const ordered = allValidQuestions.slice().sort((a, b) => a.number - b.number);
      return { ok: true, questions: ordered };
    }
    case "all_random": {
      return { ok: true, questions: fisherYatesShuffle(allValidQuestions) };
    }
    default:
      return { ok: false, reason: "Άγνωστη λειτουργία επιλογής ερωτήσεων." };
  }
}

/**
 * A single quiz session. Owns its own copy of selected questions and all
 * recorded results, isolated from the original dataset (spec section 54).
 */
export class QuizSession {
  constructor(datasetName, questions, settingsSnapshot) {
    this.datasetName = datasetName; // 'KUMITE' | 'KATA'
    this.questions = questions; // [{number, text, answer}] — session-local copy
    this.settingsSnapshot = settingsSnapshot;
    this.currentIndex = 0;
    this.startedAt = Date.now();

    // One result slot per question, in session order.
    this.results = questions.map((q) => ({
      number: q.number,
      text: q.text,
      correctAnswer: q.answer,
      userAnswer: null,
      status: null, // filled in on completion
    }));

    this._questionCompletedGuard = false;
    this._timer = null;
  }

  get total() {
    return this.questions.length;
  }

  get currentQuestion() {
    return this.questions[this.currentIndex];
  }

  get isLastQuestion() {
    return this.currentIndex >= this.total - 1;
  }

  /** Create and start a fresh timer for the current question. Cancels any previous one first. */
  startTimerForCurrentQuestion({ onTick, onComplete }) {
    this._cancelTimer();
    this._questionCompletedGuard = false;
    const durationMs = this.settingsSnapshot.questionTime * 1000;
    this._timer = new QuestionTimer(durationMs, { onTick, onComplete });
    this._timer.start();
    return this._timer;
  }

  pauseTimer() {
    if (this._timer) this._timer.pause();
  }

  resumeTimer() {
    if (this._timer) this._timer.resume();
  }

  _cancelTimer() {
    if (this._timer) {
      this._timer.cancel();
      this._timer = null;
    }
  }

  /**
   * THE central, guarded completion mechanism (spec section 28).
   * @param {'TRUE'|'FALSE'|null} userAnswer null means unanswered/timeout/skip
   * @returns {boolean} true if this call actually completed the question,
   *                     false if it was ignored (already completed).
   */
  completeQuestion(userAnswer) {
    if (this._questionCompletedGuard) return false; // idempotent guard
    this._questionCompletedGuard = true;

    this._cancelTimer(); // stop the timer; only one active timer ever exists

    const result = this.results[this.currentIndex];
    result.userAnswer = userAnswer;
    if (userAnswer === null) {
      result.status = QuestionStatus.UNANSWERED;
    } else if (userAnswer === result.correctAnswer) {
      result.status = QuestionStatus.CORRECT;
    } else {
      result.status = QuestionStatus.WRONG;
    }
    return true;
  }

  /** Advance to the next question. Returns false if there is no next question. */
  advance() {
    if (this.isLastQuestion) return false;
    this.currentIndex += 1;
    return true;
  }

  /** Compute final tallies from recorded statuses only (spec section 55). */
  computeResultsSummary() {
    let correct = 0,
      wrong = 0,
      unanswered = 0;
    for (const r of this.results) {
      if (r.status === QuestionStatus.CORRECT) correct++;
      else if (r.status === QuestionStatus.WRONG) wrong++;
      else unanswered++; // UNANSWERED, or never reached (treated as unanswered)
    }
    const total = this.results.length;
    const percent = total > 0 ? (correct / total) * 100 : 0;
    return { total, correct, wrong, unanswered, percent };
  }

  /** WRONG + UNANSWERED questions, in original session order. */
  getReviewableQuestions() {
    return this.results.filter(
      (r) => r.status === QuestionStatus.WRONG || r.status === QuestionStatus.UNANSWERED
    );
  }

  destroy() {
    this._cancelTimer();
  }
}
