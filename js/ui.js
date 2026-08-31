// ============================================================
// ui.js — DOM references + rendering helpers.
// No business logic here — just "given this data, paint the screen".
// ============================================================
import { QuestionStatus } from "./quiz.js";

/** Collect every DOM node the app needs, once, at startup. */
export function collectDom() {
  return {
    // global
    protocolWarning: document.getElementById("protocolWarning"),
    offlineBanner: document.getElementById("offlineBanner"),
    ariaLiveRegion: document.getElementById("ariaLiveRegion"),

    // screens
    screens: {
      LOADING: document.getElementById("screen-loading"),
      WELCOME: document.getElementById("screen-home"),
      HOME: document.getElementById("screen-menu"),
      SETTINGS: document.getElementById("screen-settings"),
      QUESTION_ACTIVE: document.getElementById("screen-quiz"),
      QUESTION_PAUSED: document.getElementById("screen-quiz"),
      QUESTION_TRANSITION: document.getElementById("screen-quiz"),
      QUIZ_READY: document.getElementById("screen-quiz"),
      RESULTS: document.getElementById("screen-results"),
      REVIEW: document.getElementById("screen-review"),
      ERROR: document.getElementById("screen-error"),
    },

    // home / welcome
    homeBgDecor: document.getElementById("homeBgDecor"),
    menuBgDecor: document.getElementById("menuBgDecor"),
    affirmationText: document.getElementById("affirmationText"),
    startButton: document.getElementById("startButton"),

    // menu
    btnKumite: document.getElementById("btnKumite"),
    btnKata: document.getElementById("btnKata"),
    btnSettings: document.getElementById("btnSettings"),
    btnExit: document.getElementById("btnExit"),
    kumiteStatus: document.getElementById("kumiteStatus"),
    kataStatus: document.getElementById("kataStatus"),
    exitMessage: document.getElementById("exitMessage"),

    // settings
    settingsBack: document.getElementById("settingsBack"),
    settingQuestionTime: document.getElementById("settingQuestionTime"),
    settingQuestionCount: document.getElementById("settingQuestionCount"),
    questionCountWrap: document.getElementById("questionCountWrap"),
    selectionModeRadios: Array.from(document.querySelectorAll('input[name="selectionMode"]')),
    panelColorRadios: Array.from(document.querySelectorAll('input[name="panelColor"]')),

    // quiz
    quizProgress: document.getElementById("quizProgress"),
    pauseBtn: document.getElementById("pauseBtn"),
    questionPanel: document.getElementById("questionPanel"),
    questionText: document.getElementById("questionText"),
    timerBar: document.getElementById("timerBar"),
    trueBtn: document.getElementById("trueBtn"),
    falseBtn: document.getElementById("falseBtn"),
    pauseOverlay: document.getElementById("pauseOverlay"),
    resumeBtn: document.getElementById("resumeBtn"),
    leaveConfirm: document.getElementById("leaveConfirm"),
    leaveCancel: document.getElementById("leaveCancel"),
    leaveConfirmBtn: document.getElementById("leaveConfirmBtn"),
    fadeOverlay: document.getElementById("fadeOverlay"),

    // results
    resultMessageBox: document.getElementById("resultMessageBox"),
    resultMessageText: document.getElementById("resultMessageText"),
    statTotal: document.getElementById("statTotal"),
    statCorrect: document.getElementById("statCorrect"),
    statWrong: document.getElementById("statWrong"),
    statUnanswered: document.getElementById("statUnanswered"),
    statPercent: document.getElementById("statPercent"),
    reviewBtn: document.getElementById("reviewBtn"),
    exportBtn: document.getElementById("exportBtn"),
    homeBtn: document.getElementById("homeBtn"),

    // review
    reviewProgress: document.getElementById("reviewProgress"),
    reviewBack: document.getElementById("reviewBack"),
    reviewPanel: document.getElementById("reviewPanel"),
    reviewQuestionText: document.getElementById("reviewQuestionText"),
    reviewUserAnswer: document.getElementById("reviewUserAnswer"),
    reviewCorrectAnswer: document.getElementById("reviewCorrectAnswer"),

    // error
    errorMessage: document.getElementById("errorMessage"),
    errorHomeBtn: document.getElementById("errorHomeBtn"),

    // keyboard help modal
    kbHelp: document.getElementById("kbHelp"),
    kbHelpClose: document.getElementById("kbHelpClose"),
  };
}

let lastShownScreenEl = null;

/** Show the DOM screen associated with `stateName`; hide all others. */
export function showScreenForState(dom, stateName) {
  const target = dom.screens[stateName];
  if (!target) return;
  if (target === lastShownScreenEl) return; // avoid redundant DOM churn
  for (const el of new Set(Object.values(dom.screens))) {
    const isTarget = el === target;
    el.classList.toggle("is-active", isTarget);
    el.setAttribute("aria-hidden", isTarget ? "false" : "true");
  }
  lastShownScreenEl = target;
}

const PANEL_COLOR_CLASSES = ["question-panel--white", "question-panel--pink", "question-panel--yellow", "question-panel--beige"];

export function applyPanelColor(dom, colorKey) {
  dom.questionPanel.classList.remove(...PANEL_COLOR_CLASSES);
  dom.questionPanel.classList.add(`question-panel--${colorKey}`);
  dom.reviewPanel.classList.remove(...PANEL_COLOR_CLASSES);
  dom.reviewPanel.classList.add(`question-panel--${colorKey}`);
}

/**
 * Timer bar (spec section 25). The BAR WIDTH represents elapsed time —
 * it starts at 0% and grows linearly to 100% exactly when time runs out.
 * The BAR COLOR reflects time REMAINING, so it stays calm for most of the
 * question and only turns critical (hot pink) near the very end.
 */
export function updateTimerBarVisual(dom, fraction, isPaused) {
  const elapsedPercent = Math.max(0, Math.min(100, fraction * 100));
  const remainingPercent = 100 - elapsedPercent;
  dom.timerBar.style.width = `${elapsedPercent}%`;
  dom.timerBar.setAttribute("aria-valuenow", String(Math.round(elapsedPercent)));
  dom.timerBar.classList.remove("state-warning", "state-critical", "state-paused");
  if (isPaused) {
    dom.timerBar.classList.add("state-paused");
  } else if (remainingPercent <= 10) {
    dom.timerBar.classList.add("state-critical");
  } else if (remainingPercent <= 25) {
    dom.timerBar.classList.add("state-warning");
  }
  // else: normal color from the base .timerbar rule
}

/** Recolor the timer bar to the paused state without touching its width. */
export function setTimerBarPausedVisual(dom, isPaused) {
  dom.timerBar.classList.toggle("state-paused", isPaused);
}

export function renderQuestion(dom, session) {
  const q = session.currentQuestion;
  dom.questionText.textContent = q.text;
  dom.quizProgress.textContent = `Ερώτηση ${session.currentIndex + 1} / ${session.total}`;
  dom.timerBar.style.width = "0%";
  dom.timerBar.classList.remove("state-warning", "state-critical", "state-paused");
}

export function setAnswerButtonsEnabled(dom, enabled) {
  dom.trueBtn.disabled = !enabled;
  dom.falseBtn.disabled = !enabled;
}

export function renderResults(dom, summary, band) {
  dom.statTotal.textContent = String(summary.total);
  dom.statCorrect.textContent = String(summary.correct);
  dom.statWrong.textContent = String(summary.wrong);
  dom.statUnanswered.textContent = String(summary.unanswered);
  dom.statPercent.textContent = `${summary.percent.toFixed(1)}%`;

  dom.resultMessageText.textContent = band.text;
  dom.resultMessageText.style.color = band.color;
}

export function renderReviewItem(dom, item, index, total) {
  dom.reviewProgress.textContent = `${index + 1} / ${total}`;
  dom.reviewQuestionText.textContent = item.text;
  dom.reviewUserAnswer.textContent = item.status === QuestionStatus.UNANSWERED ? "NO ANSWER" : item.userAnswer;
  dom.reviewCorrectAnswer.textContent = item.correctAnswer;
}

export function announce(dom, message) {
  dom.ariaLiveRegion.textContent = "";
  // Re-trigger for screen readers even if the text is identical to before.
  requestAnimationFrame(() => {
    dom.ariaLiveRegion.textContent = message;
  });
}
