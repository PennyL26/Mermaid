// ============================================================
// app.js — application bootstrap and event wiring.
// Keeps orchestration logic; delegates rendering to ui.js,
// data rules to excel.js/quiz.js, and timing to timer.js.
// ============================================================
import { appState, States } from "./state.js";
import { collectDom, showScreenForState, applyPanelColor, updateTimerBarVisual, setTimerBarPausedVisual, renderQuestion, setAnswerButtonsEnabled, renderResults, renderReviewItem, announce } from "./ui.js";
import { DATA_PATHS, DEFAULT_AFFIRMATION, loadQuestionDataset, loadAffirmationsDataset } from "./excel.js";
import { QuizSession, buildQuestionSequence, resultMessageForPercent, QuestionStatus } from "./quiz.js";
import { initSettingsForm } from "./settings.js";
import { loadSettings } from "./storage.js";
import { fisherYatesShuffle, formatTimestampForFilename, csvEscape, downloadBlob, devLog } from "./utils.js";

const FADE_TRANSITION_MS = 1200;
const MERMAID_IMAGE_COUNT = 13;

const dom = collectDom();

/** @type {{KUMITE: object|null, KATA: object|null}} */
const datasets = { KUMITE: null, KATA: null };

/** @type {QuizSession|null} */
let activeSession = null;

/** @type {import('./quiz.js').QuestionStatus} */
let reviewIndex = 0;
let reviewItems = [];

let affirmationBag = [];

// ------------------------------------------------------------
// Startup
// ------------------------------------------------------------
async function main() {
  wireGlobalListeners();
  checkProtocol();
  registerServiceWorker();
  pickRandomBackground();

  appState.subscribe((next) => showScreenForState(dom, next));
  showScreenForState(dom, appState.current); // paint LOADING immediately

  try {
    await loadAllDatasets();
    prepareAffirmations();
    initSettingsForm({
      settingQuestionTime: dom.settingQuestionTime,
      settingQuestionCount: dom.settingQuestionCount,
      questionCountWrap: dom.questionCountWrap,
      selectionModeRadios: dom.selectionModeRadios,
      panelColorRadios: dom.panelColorRadios,
    });
    updateMenuAvailability();
    appState.transition(States.WELCOME);
  } catch (e) {
    console.error("Fatal startup error", e);
    showError("Παρουσιάστηκε απρόσμενο σφάλμα κατά την εκκίνηση της εφαρμογής.");
  }
}

function checkProtocol() {
  if (window.location.protocol === "file:") {
    dom.protocolWarning.hidden = false;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch((e) => {
    devLog("Service worker registration failed", e);
    dom.swNotice.hidden = false;
    setTimeout(() => (dom.swNotice.hidden = true), 6000);
  });
}

function wireGlobalListeners() {
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  document.addEventListener("keydown", handleGlobalKeydown);

  dom.kbHelpClose.addEventListener("click", () => (dom.kbHelp.hidden = true));

  dom.startButton.addEventListener("click", () => appState.transition(States.HOME));

  dom.btnKumite.addEventListener("click", () => startQuiz("KUMITE"));
  dom.btnKata.addEventListener("click", () => startQuiz("KATA"));
  dom.btnSettings.addEventListener("click", () => appState.transition(States.SETTINGS));
  dom.btnExit.addEventListener("click", handleExit);

  dom.settingsBack.addEventListener("click", () => appState.transition(States.HOME));

  dom.pauseBtn.addEventListener("click", togglePause);
  dom.resumeBtn.addEventListener("click", togglePause);
  dom.trueBtn.addEventListener("click", () => handleAnswer("TRUE"));
  dom.falseBtn.addEventListener("click", () => handleAnswer("FALSE"));

  dom.questionPanel.addEventListener("click", () => handlePanelNext());
  wireSwipe(dom.questionPanel, handlePanelNext);

  dom.leaveCancel.addEventListener("click", () => (dom.leaveConfirm.hidden = true));
  dom.leaveConfirmBtn.addEventListener("click", confirmLeaveQuiz);

  dom.reviewBtn.addEventListener("click", startReview);
  dom.reviewBack.addEventListener("click", () => appState.transition(States.RESULTS));
  dom.reviewPanel.addEventListener("click", advanceReview);
  wireSwipe(dom.reviewPanel, advanceReview);

  dom.exportBtn.addEventListener("click", exportResults);
  dom.homeBtn.addEventListener("click", finishToHome);

  dom.errorHomeBtn.addEventListener("click", () => window.location.reload());
}

function updateOnlineStatus() {
  dom.offlineBanner.hidden = navigator.onLine;
}

// ------------------------------------------------------------
// Background decoration + affirmations
// ------------------------------------------------------------
function pickRandomBackground() {
  const n = 1 + Math.floor(Math.random() * MERMAID_IMAGE_COUNT);
  const url = `assets/mermaid-${n}.png`;
  dom.homeBgDecor.style.backgroundImage = `url("${url}")`;
  dom.menuBgDecor.style.backgroundImage = `url("${url}")`;
}

function prepareAffirmations() {
  const loaded = datasets.AFFIRMATIONS;
  const pool = loaded && loaded.valid && loaded.items.length > 0 ? loaded.items : [DEFAULT_AFFIRMATION];
  affirmationBag = fisherYatesShuffle(pool);
  showNextAffirmation(pool);
}

function showNextAffirmation(pool) {
  if (affirmationBag.length === 0) affirmationBag = fisherYatesShuffle(pool);
  const text = affirmationBag.pop();
  dom.affirmationText.textContent = text;
}

// ------------------------------------------------------------
// Dataset loading (KUMITE / KATA independent, spec section 12)
// ------------------------------------------------------------
async function loadAllDatasets() {
  const [kumite, kata, affirmations] = await Promise.all([
    loadQuestionDataset(DATA_PATHS.KUMITE),
    loadQuestionDataset(DATA_PATHS.KATA),
    loadAffirmationsDataset(DATA_PATHS.AFFIRMATIONS),
  ]);
  datasets.KUMITE = kumite;
  datasets.KATA = kata;
  datasets.AFFIRMATIONS = affirmations;
}

function updateMenuAvailability() {
  const MIN_QUESTIONS = 1;
  const kumiteOk = datasets.KUMITE && datasets.KUMITE.valid && datasets.KUMITE.items.length >= MIN_QUESTIONS;
  const kataOk = datasets.KATA && datasets.KATA.valid && datasets.KATA.items.length >= MIN_QUESTIONS;

  dom.btnKumite.disabled = !kumiteOk;
  dom.kumiteStatus.textContent = kumiteOk
    ? `${datasets.KUMITE.items.length} ερωτήσεις διαθέσιμες`
    : datasets.KUMITE?.errorReason || "Μη διαθέσιμο";

  dom.btnKata.disabled = !kataOk;
  dom.kataStatus.textContent = kataOk
    ? `${datasets.KATA.items.length} ερωτήσεις διαθέσιμες`
    : datasets.KATA?.errorReason || "Μη διαθέσιμο";
}

function showMenuMessage(text) {
  dom.menuMessage.textContent = text;
  dom.menuMessage.hidden = false;
  setTimeout(() => {
    dom.menuMessage.hidden = true;
  }, 5000);
}

// ------------------------------------------------------------
// Starting a quiz
// ------------------------------------------------------------
function startQuiz(datasetName) {
  const dataset = datasets[datasetName];
  if (!dataset || !dataset.valid) {
    showMenuMessage(`Τα δεδομένα για ${datasetName} δεν είναι διαθέσιμα.`);
    return;
  }

  // Settings snapshot is taken exactly once, at the moment the exam starts
  // (spec section 15/44): it will not change even if Settings are edited later.
  const settingsSnapshot = loadSettings();

  const sequenceResult = buildQuestionSequence(dataset.items, settingsSnapshot);
  if (!sequenceResult.ok) {
    showMenuMessage(sequenceResult.reason);
    return;
  }

  activeSession = new QuizSession(datasetName, sequenceResult.questions, settingsSnapshot);
  applyPanelColor(dom, settingsSnapshot.panelColor);

  if (!appState.transition(States.QUIZ_READY)) return;
  showCurrentQuestion();
}

function showCurrentQuestion() {
  if (!activeSession) return;
  renderQuestion(dom, activeSession);
  setAnswerButtonsEnabled(dom, true);
  dom.pauseOverlay.hidden = true;

  appState.transition(States.QUESTION_ACTIVE);

  activeSession.startTimerForCurrentQuestion({
    onTick: (fraction) => updateTimerBarVisual(dom, fraction, false),
    onComplete: () => onQuestionResolved(null), // timeout -> unanswered
  });
}

// ------------------------------------------------------------
// Answering / completing a question — every path funnels here.
// ------------------------------------------------------------
function handleAnswer(answer) {
  if (!appState.is(States.QUESTION_ACTIVE)) return;
  onQuestionResolved(answer);
}

function handlePanelNext() {
  if (!appState.is(States.QUESTION_ACTIVE)) return;
  onQuestionResolved(null); // click/swipe-to-next without an answer = unanswered
}

/**
 * Single funnel for TRUE, FALSE, timeout, click, and swipe.
 * QuizSession#completeQuestion() is itself idempotent, and the state
 * machine's transition() is also guarded, giving two independent layers
 * against double-completion race conditions (spec sections 28, 36).
 */
function onQuestionResolved(answer) {
  if (!activeSession) return;
  const completed = activeSession.completeQuestion(answer);
  if (!completed) return; // already completed by a earlier, near-simultaneous event

  setAnswerButtonsEnabled(dom, false);
  const moved = appState.transition(States.QUESTION_TRANSITION);
  if (!moved) return;

  runFadeTransition(() => {
    // The quiz may have been abandoned (Esc -> confirm leave) while this
    // fade was still pending — if so, there is nothing left to advance to.
    if (!activeSession) return;
    const hasNext = activeSession.advance();
    if (hasNext) {
      // showCurrentQuestion() transitions QUESTION_TRANSITION -> QUESTION_ACTIVE and starts the timer.
      showCurrentQuestion();
    } else {
      finishQuiz();
    }
  });
}

function runFadeTransition(onMidpoint) {
  dom.fadeOverlay.classList.add("is-active");
  setTimeout(() => {
    onMidpoint();
    // Let the new content paint, then fade back out.
    requestAnimationFrame(() => {
      dom.fadeOverlay.classList.remove("is-active");
    });
  }, FADE_TRANSITION_MS);
}

// ------------------------------------------------------------
// Pause / Resume
// ------------------------------------------------------------
function togglePause() {
  if (appState.is(States.QUESTION_ACTIVE)) {
    activeSession.pauseTimer();
    appState.transition(States.QUESTION_PAUSED);
    dom.pauseOverlay.hidden = false;
    setTimerBarPausedVisual(dom, true); // width stays exactly where it was
  } else if (appState.is(States.QUESTION_PAUSED)) {
    dom.pauseOverlay.hidden = true;
    appState.transition(States.QUESTION_ACTIVE);
    setTimerBarPausedVisual(dom, false);
    activeSession.resumeTimer();
  }
}

// ------------------------------------------------------------
// Leaving an active quiz
// ------------------------------------------------------------
function handleGlobalKeydown(e) {
  // Keyboard Shortcuts Help — available everywhere.
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "?") {
    e.preventDefault();
    dom.kbHelp.hidden = !dom.kbHelp.hidden;
    return;
  }
  if (!dom.kbHelp.hidden && e.key === "Escape") {
    dom.kbHelp.hidden = true;
    return;
  }

  // Shortcuts are disabled on Settings / Review / Results to avoid conflicts
  // with form inputs and accidental exits (spec section 48).
  if (appState.is(States.SETTINGS, States.REVIEW, States.RESULTS)) return;

  const inQuiz = appState.is(States.QUESTION_ACTIVE, States.QUESTION_PAUSED, States.QUESTION_TRANSITION);

  // If focus is on a control that has its own native Space/Enter activation
  // (TRUE/FALSE/Pause/Resume buttons), let the browser handle it natively
  // instead of racing our own "advance" shortcut against it.
  const selfHandlingControls = [dom.trueBtn, dom.falseBtn, dom.pauseBtn, dom.resumeBtn];
  const focusIsOnOwnControl = selfHandlingControls.includes(document.activeElement);

  switch (e.key) {
    case " ":
    case "Enter":
      if (appState.is(States.QUESTION_ACTIVE) && !focusIsOnOwnControl) {
        e.preventDefault();
        handlePanelNext();
      }
      break;
    case "t":
    case "T":
      if (appState.is(States.QUESTION_ACTIVE)) handleAnswer("TRUE");
      break;
    case "f":
    case "F":
      if (appState.is(States.QUESTION_ACTIVE)) handleAnswer("FALSE");
      break;
    case "p":
    case "P":
      if (appState.is(States.QUESTION_ACTIVE, States.QUESTION_PAUSED)) togglePause();
      break;
    case "Escape":
      if (inQuiz) {
        e.preventDefault();
        requestLeaveQuiz();
      }
      break;
  }
}

function requestLeaveQuiz() {
  // Pause first (if active) so time doesn't keep running behind the modal.
  if (appState.is(States.QUESTION_ACTIVE)) togglePause();
  dom.leaveConfirm.hidden = false;
}

function confirmLeaveQuiz() {
  dom.leaveConfirm.hidden = true;
  if (activeSession) {
    activeSession.destroy();
    activeSession = null;
  }
  // Force back to HOME regardless of whether we were ACTIVE/PAUSED/TRANSITION.
  forceStateTo(States.HOME);
}

/** Bypass the strict transition table for an explicit user-initiated abandon. */
function forceStateTo(target) {
  const ok = appState.transition(target);
  if (!ok) {
    // Direct transition not legal from current state (e.g. QUESTION_PAUSED);
    // step through QUESTION_ACTIVE first, which IS always a legal exit point.
    appState.transition(States.QUESTION_ACTIVE);
    appState.transition(target === States.HOME ? States.HOME : target);
  }
}

// ------------------------------------------------------------
// Finishing a quiz -> Results
// ------------------------------------------------------------
function finishQuiz() {
  appState.transition(States.RESULTS);
  const summary = activeSession.computeResultsSummary();
  const band = resultMessageForPercent(summary.percent);
  renderResults(dom, summary, band);

  const reviewable = activeSession.getReviewableQuestions();
  dom.reviewBtn.disabled = reviewable.length === 0;
  dom.reviewBtn.textContent =
    reviewable.length === 0 ? "Δεν υπάρχουν λανθασμένες απαντήσεις" : "REVIEW WRONG ANSWERS";
  dom.exportBtn.hidden = false;

  announce(dom, `Η εξέταση ολοκληρώθηκε. Ποσοστό επιτυχίας ${summary.percent.toFixed(1)} τοις εκατό.`);
}

function finishToHome() {
  if (activeSession) {
    activeSession.destroy();
    activeSession = null;
  }
  appState.transition(States.HOME);
}

// ------------------------------------------------------------
// Review Wrong Answers
// ------------------------------------------------------------
function startReview() {
  if (!activeSession) return;
  reviewItems = activeSession.getReviewableQuestions();
  if (reviewItems.length === 0) return;
  reviewIndex = 0;
  appState.transition(States.REVIEW);
  renderReviewItem(dom, reviewItems[reviewIndex], reviewIndex, reviewItems.length);
}

function advanceReview() {
  if (!appState.is(States.REVIEW)) return;
  reviewIndex = (reviewIndex + 1) % reviewItems.length; // wrap around for continuous browsing
  renderReviewItem(dom, reviewItems[reviewIndex], reviewIndex, reviewItems.length);
}

// ------------------------------------------------------------
// Export results (spec section 61)
// ------------------------------------------------------------
function exportResults() {
  if (!activeSession) return;
  const ts = formatTimestampForFilename();
  const summary = activeSession.computeResultsSummary();

  const csvLines = ["Number,Question,UserAnswer,CorrectAnswer,Status"];
  for (const r of activeSession.results) {
    csvLines.push(
      [
        r.number,
        csvEscape(r.text),
        r.userAnswer === null ? "NO ANSWER" : r.userAnswer,
        r.correctAnswer,
        r.status,
      ].join(",")
    );
  }
  const csvContent = "\uFEFF" + csvLines.join("\r\n"); // UTF-8 BOM for correct Greek display in Excel
  downloadBlob(new Blob([csvContent], { type: "text/csv;charset=utf-8" }), `Lovely_Penny_${ts}.csv`);

  const txtLines = [
    `Εξέταση: ${activeSession.datasetName}`,
    `Ημερομηνία: ${new Date(activeSession.startedAt).toLocaleString("el-GR")}`,
    `Σύνολο ερωτήσεων: ${summary.total}`,
    `Σωστές: ${summary.correct}`,
    `Λάθος: ${summary.wrong}`,
    `Αναπάντητες: ${summary.unanswered}`,
    `Ποσοστό επιτυχίας: ${summary.percent.toFixed(1)}%`,
  ];
  downloadBlob(new Blob([txtLines.join("\r\n")], { type: "text/plain;charset=utf-8" }), `exam_results_${ts}.txt`);
}

// ------------------------------------------------------------
// Exit
// ------------------------------------------------------------
function handleExit() {
  dom.exitMessage.hidden = true;
  let closed = false;
  try {
    window.close();
    // Some browsers silently ignore window.close() on a tab they didn't open,
    // rather than throwing — detect that by checking visibility shortly after.
    closed = window.closed;
  } catch (e) {
    closed = false;
  }
  if (!closed) {
    dom.exitMessage.hidden = false;
  }
}

// ------------------------------------------------------------
// Error screen
// ------------------------------------------------------------
function showError(message) {
  dom.errorMessage.textContent = message;
  appState.transition(States.ERROR);
}

// ------------------------------------------------------------
// Swipe gesture detection (spec section 31)
// horizontal distance > 50px AND vertical distance < 30px = swipe-next
// ------------------------------------------------------------
function wireSwipe(el, onSwipeNext) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  el.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    },
    { passive: true }
  );

  el.addEventListener(
    "touchmove",
    () => {
      // Distance is computed on touchend; touchmove only needs to keep the
      // browser's default vertical-scroll behavior available (touch-action: pan-y).
    },
    { passive: true }
  );

  el.addEventListener(
    "touchend",
    (e) => {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) > 50 && Math.abs(dy) < 30) {
        onSwipeNext();
      }
      // Vertical or diagonal swipes are ignored entirely (not treated as NEXT).
    },
    { passive: true }
  );
}

main();
