// ============================================================================
// app.js — Application bootstrap & controller.
// Wires: state machine (state.js) + quiz session (quiz.js) + rendering (ui.js)
// + settings (settings.js) + excel loading (excel.js) + storage (storage.js).
// ============================================================================

import { DATA_PATHS, SWIPE_MIN_DISTANCE_PX, TRANSITION_DURATION_MS, EXPORT_EMAIL } from './config.js';
import { AppState, AppStateMachine, QuestionStatus } from './state.js';
import { loadQuestionDataset, loadAffirmationsDataset } from './excel.js';
import { QuizSession } from './quiz.js';
import { SettingsController } from './settings.js';
import * as UI from './ui.js';
import { qs, pickRandom, timestampForFilename, downloadTextFile, csvEscape } from './utils.js';
import { logDev } from './config.js';

// ---------------------------------------------------------------------------
// Global application state (single source of truth for cross-module wiring)
// ---------------------------------------------------------------------------
const machine = new AppStateMachine();
const settingsCtrl = new SettingsController();

let kumiteResult = { ok: false, records: [], error: null };
let kataResult = { ok: false, records: [], error: null };
let affirmationsResult = { ok: false, records: [] };

let activeSession = null; // QuizSession | null
let reviewList = [];
let reviewIndex = 0;

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------
async function boot() {
  UI.showScreen('screen-loading');

  const [kumite, kata, affirmations] = await Promise.all([
    loadQuestionDataset(DATA_PATHS.KUMITE),
    loadQuestionDataset(DATA_PATHS.KATA),
    loadAffirmationsDataset(DATA_PATHS.AFFIRMATIONS),
  ]);
  kumiteResult = kumite;
  kataResult = kata;
  affirmationsResult = affirmations;

  logDev('KUMITE dataset:', kumiteResult.ok ? `${kumiteResult.records.length} OK` : kumiteResult.error);
  logDev('KATA dataset:', kataResult.ok ? `${kataResult.records.length} OK` : kataResult.error);
  logDev('Affirmations dataset:', affirmationsResult.ok ? `${affirmationsResult.records.length} OK` : affirmationsResult.error);

  goHome();
}

function goHome() {
  machine.set(AppState.HOME);
  const text = affirmationsResult.ok
    ? pickRandom(affirmationsResult.records).text
    : 'Καλή επιτυχία στην προπόνησή σου!';
  UI.renderHome(text);
  UI.showScreen('screen-home');
}

function goMenu() {
  machine.set(AppState.HOME); // menu is a sub-state of HOME conceptually
  const statusParts = [];
  if (!kumiteResult.ok) statusParts.push(`KUMITE μη διαθέσιμο: ${kumiteResult.error}`);
  if (!kataResult.ok) statusParts.push(`KATA μη διαθέσιμο: ${kataResult.error}`);
  UI.renderMenu({
    kumiteEnabled: kumiteResult.ok,
    kataEnabled: kataResult.ok,
    statusMessage: statusParts.join(' · '),
  });
  UI.showScreen('screen-menu');
}

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------
function openSettings() {
  machine.set(AppState.SETTINGS);
  settingsCtrl.renderToForm();
  qs('#settingsError').classList.add('is-hidden');
  UI.showScreen('screen-settings');
}

function handleSettingsSubmit(e) {
  e.preventDefault();
  const { ok, errors } = settingsCtrl.saveFromForm();
  if (!ok) {
    qs('#settingsError').textContent = errors.join(' ');
    qs('#settingsError').classList.remove('is-hidden');
    return;
  }
  UI.applyPanelColor(settingsCtrl.current.panelColor);
  goMenu();
}

// ---------------------------------------------------------------------------
// Starting a quiz
// ---------------------------------------------------------------------------
function startQuiz(discipline) {
  const dataset = discipline === 'KUMITE' ? kumiteResult : kataResult;
  if (!dataset.ok) {
    UI.renderError(`Το dataset ${discipline} δεν είναι διαθέσιμο: ${dataset.error}`);
    return;
  }
  const settingsSnapshot = settingsCtrl.getSnapshot(); // frozen at start (§15, §44)

  if (settingsSnapshot.selectionMode === 'specific_random' &&
      settingsSnapshot.questionCount > dataset.records.length) {
    UI.renderError(
      `Ζητήθηκαν ${settingsSnapshot.questionCount} ερωτήσεις αλλά το dataset ${discipline} διαθέτει μόνο ` +
      `${dataset.records.length}. Μειώστε τον αριθμό ερωτήσεων στις Ρυθμίσεις.`
    );
    return;
  }

  activeSession?.destroy();
  activeSession = new QuizSession({
    sourceRecords: dataset.records,
    settingsSnapshot,
    discipline,
  });

  UI.applyPanelColor(settingsSnapshot.panelColor);
  activeSession.start();
  machine.set(AppState.QUESTION_ACTIVE);
  UI.showScreen('screen-question');
  showCurrentQuestion();
}

function showCurrentQuestion() {
  const q = activeSession.currentQuestion;
  UI.renderQuestion({ index: activeSession.currentIndex, total: activeSession.total, text: q.question });
  UI.setPauseButtonLabel(false);
  qs('#btnPause').disabled = false;

  activeSession.startTimerForCurrent({
    onTick: (remainingMs, totalMs) => UI.renderTimerBar(remainingMs, totalMs, false),
    onExpire: () => {
      // completeQuestion() was already invoked by QuizSession internally on expire.
      runTransitionToNext();
    },
  });
  machine.set(AppState.QUESTION_ACTIVE);
}

// ---------------------------------------------------------------------------
// Answer / swipe / click handling — ALL funnel through completeQuestion()
// ---------------------------------------------------------------------------
function handleAnswer(userAnswer) {
  if (!machine.is(AppState.QUESTION_ACTIVE)) return; // ignore during pause/transition
  if (!activeSession || !activeSession.isQuestionAnswerable) return;
  const completed = activeSession.completeQuestion({ type: 'answer', userAnswer });
  if (completed) runTransitionToNext();
}

function handleSwipeOrClickNext(sourceType) {
  if (!machine.is(AppState.QUESTION_ACTIVE)) return;
  if (!activeSession || !activeSession.isQuestionAnswerable) return;
  const completed = activeSession.completeQuestion({ type: sourceType });
  if (completed) runTransitionToNext();
}

function runTransitionToNext() {
  machine.set(AppState.QUESTION_TRANSITION);
  qs('#btnPause').disabled = true; // §35: pause unavailable during transition
  const panel = qs('#questionPanel');
  panel.classList.add('fade-transition');

  setTimeout(() => {
    panel.classList.remove('fade-transition');
    activeSession.endTransition();
    const advanced = activeSession.advance();
    if (advanced) {
      showCurrentQuestion();
    } else {
      finishQuiz();
    }
  }, TRANSITION_DURATION_MS);
}

// ---------------------------------------------------------------------------
// Pause / Resume
// ---------------------------------------------------------------------------
function togglePause() {
  if (machine.is(AppState.QUESTION_ACTIVE)) {
    activeSession.pauseTimer();
    machine.set(AppState.QUESTION_PAUSED);
    UI.setPauseButtonLabel(true);
    UI.renderTimerBar(activeSession.timer?.remainingMs ?? 0, activeSession.timer?.totalMs ?? 1, true);
  } else if (machine.is(AppState.QUESTION_PAUSED)) {
    activeSession.resumeTimer();
    machine.set(AppState.QUESTION_ACTIVE);
    UI.setPauseButtonLabel(false);
  }
}

// ---------------------------------------------------------------------------
// Results / Review
// ---------------------------------------------------------------------------
function finishQuiz() {
  machine.set(AppState.RESULTS);
  const results = activeSession.computeResults();
  UI.renderResults(results);
  reviewList = activeSession.getReviewList();
  UI.setReviewButtonEnabled(reviewList.length > 0);
  UI.showScreen('screen-results');
}

function openReview() {
  if (reviewList.length === 0) return;
  machine.set(AppState.REVIEW);
  reviewIndex = 0;
  UI.renderReviewItem(reviewList[reviewIndex], reviewIndex, reviewList.length);
  UI.showScreen('screen-review');
}

function reviewNext() {
  if (reviewIndex + 1 < reviewList.length) {
    reviewIndex += 1;
    UI.renderReviewItem(reviewList[reviewIndex], reviewIndex, reviewList.length);
  } else {
    // Wrapped past the end -> back to results, per natural flow
    machine.set(AppState.RESULTS);
    UI.showScreen('screen-results');
  }
}

function backToResultsFromReview() {
  machine.set(AppState.RESULTS);
  UI.showScreen('screen-results');
}

function returnHomeFromResults() {
  activeSession?.destroy();
  activeSession = null;
  reviewList = [];
  goMenu();
}

// ---------------------------------------------------------------------------
// Export results — §61
// Note: automatic email delivery is not achievable from a pure client-side,
// backend-less app (browsers cannot send SMTP mail on their own). Instead we
// (a) trigger the two file downloads with the exact spec'd filenames, and
// (b) open the user's mail client via a mailto: link pre-addressed to
// soulouwarez@gmail.com with instructions to attach the just-downloaded
// files, since mailto cannot attach files programmatically.
// ---------------------------------------------------------------------------
function exportResults() {
  if (!activeSession) return;
  const ts = timestampForFilename();
  const csvName = `exam_results_${ts}.csv`;
  const txtName = `exam_results_${ts}.txt`;

  const csvRows = [['Number', 'Question', 'UserAnswer', 'CorrectAnswer', 'Status']];
  for (let i = 0; i < activeSession.total; i++) {
    const q = activeSession.questions[i];
    const userAns = activeSession.answers[i];
    csvRows.push([
      q.number,
      q.question,
      userAns === null ? 'NO ANSWER' : (userAns ? 'TRUE' : 'FALSE'),
      q.answer ? 'TRUE' : 'FALSE',
      activeSession.statuses[i],
    ]);
  }
  const csvContent = csvRows.map((row) => row.map(csvEscape).join(',')).join('\r\n');

  const results = activeSession.computeResults();
  const txtContent = [
    `Exam results — ${activeSession.discipline}`,
    `Date: ${activeSession.startedAt.toLocaleString('el-GR')}`,
    `Total questions: ${results.total}`,
    `Correct: ${results.correct}`,
    `Wrong: ${results.wrong}`,
    `Unanswered: ${results.unanswered}`,
    `Score: ${results.scorePercent.toFixed(1)}%`,
  ].join('\r\n');

  downloadTextFile(csvName, csvContent, 'text/csv;charset=utf-8');
  downloadTextFile(txtName, txtContent, 'text/plain;charset=utf-8');

  const subject = encodeURIComponent(`Exam results ${ts}`);
  const body = encodeURIComponent(
    `Επισυνάψτε τα δύο αρχεία που μόλις κατέβηκαν (${csvName} και ${txtName}) πριν την αποστολή.`
  );
  window.location.href = `mailto:${EXPORT_EMAIL}?subject=${subject}&body=${body}`;
}

// ---------------------------------------------------------------------------
// Exit
// ---------------------------------------------------------------------------
function attemptExit() {
  const win = window.open('', '_self');
  win.close();
  // If we're still here after a tick, the browser blocked window.close().
  setTimeout(() => {
    UI.showScreen('screen-exit');
  }, 50);
}

// ---------------------------------------------------------------------------
// Swipe detection (touch) — §31
// ---------------------------------------------------------------------------
function attachSwipeHandler(panelEl, onSwipeNext) {
  let startX = null, startY = null;
  panelEl.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    startX = t.clientX;
    startY = t.clientY;
  }, { passive: true });
  panelEl.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    startX = null; startY = null;
    if (Math.abs(dx) >= SWIPE_MIN_DISTANCE_PX && Math.abs(dx) > Math.abs(dy)) {
      onSwipeNext(); // horizontal swipe only; vertical/diagonal ignored (§31)
    }
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// Online/offline + orientation watchers
// ---------------------------------------------------------------------------
function updateConnectionBanner() {
  UI.showConnectionBanner(navigator.onLine);
}

function updateOrientationOverlay() {
  const isSmallScreen = window.matchMedia('(max-width: 900px)').matches;
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const inQuestionFlow = machine.is(AppState.QUESTION_ACTIVE, AppState.QUESTION_PAUSED, AppState.QUESTION_TRANSITION);
  UI.setOrientationOverlayActive(isSmallScreen && isPortrait && inQuestionFlow);
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts — §48
// ---------------------------------------------------------------------------
function attachKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const key = e.key.toLowerCase();

    if (machine.is(AppState.QUESTION_ACTIVE)) {
      if (key === 't') { handleAnswer(true); return; }
      if (key === 'f') { handleAnswer(false); return; }
      if (key === 'p') { togglePause(); return; }
      if (key === ' ' || key === 'enter') { e.preventDefault(); handleSwipeOrClickNext('click'); return; }
    } else if (machine.is(AppState.QUESTION_PAUSED)) {
      if (key === 'p') { togglePause(); return; }
    }

    if (key === 'escape') {
      handleEscapeKey();
    }
  });
}

async function handleEscapeKey() {
  if (machine.is(AppState.QUESTION_ACTIVE, AppState.QUESTION_PAUSED)) {
    const wasActive = machine.is(AppState.QUESTION_ACTIVE);
    if (wasActive) activeSession.pauseTimer();
    const confirmed = await UI.showConfirmDialog(
      'Are you sure you want to leave this examination? Current results will be lost.'
    );
    if (confirmed) {
      activeSession?.destroy();
      activeSession = null;
      goMenu();
    } else if (wasActive) {
      activeSession.resumeTimer();
    }
  } else if (machine.is(AppState.SETTINGS)) {
    goMenu();
  } else if (machine.is(AppState.REVIEW)) {
    backToResultsFromReview();
  }
}

// ---------------------------------------------------------------------------
// Wire up all static DOM event listeners
// ---------------------------------------------------------------------------
function attachEventListeners() {
  qs('#btnWelcomeNext').addEventListener('click', goMenu);
  qs('#btnStartKumite').addEventListener('click', () => startQuiz('KUMITE'));
  qs('#btnStartKata').addEventListener('click', () => startQuiz('KATA'));
  qs('#btnOpenSettings').addEventListener('click', openSettings);
  qs('#btnExit').addEventListener('click', attemptExit);

  qs('#settingsForm').addEventListener('submit', handleSettingsSubmit);
  qs('#btnSettingsBack').addEventListener('click', goMenu);
  settingsCtrl.attachFormListeners();

  qs('#btnTrue').addEventListener('click', () => handleAnswer(true));
  qs('#btnFalse').addEventListener('click', () => handleAnswer(false));
  qs('#btnPause').addEventListener('click', togglePause);
  qs('#questionPanel').addEventListener('click', () => handleSwipeOrClickNext('click'));
  attachSwipeHandler(qs('#questionPanel'), () => handleSwipeOrClickNext('swipe'));

  qs('#btnReview').addEventListener('click', openReview);
  qs('#btnExport').addEventListener('click', exportResults);
  qs('#btnResultsHome').addEventListener('click', returnHomeFromResults);

  qs('#reviewPanel').addEventListener('click', reviewNext);
  attachSwipeHandler(qs('#reviewPanel'), reviewNext);
  qs('#btnReviewBack').addEventListener('click', backToResultsFromReview);

  qs('#btnErrorHome').addEventListener('click', goMenu);

  window.addEventListener('online', updateConnectionBanner);
  window.addEventListener('offline', updateConnectionBanner);
  window.addEventListener('resize', updateOrientationOverlay);
  window.addEventListener('orientationchange', updateOrientationOverlay);
  machine.bus.on('change', updateOrientationOverlay);

  attachKeyboardShortcuts();
}

// ---------------------------------------------------------------------------
// Service worker registration (offline support — §6)
// ---------------------------------------------------------------------------
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
attachEventListeners();
updateConnectionBanner();
registerServiceWorker();
boot();
