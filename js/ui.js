// ============================================================================
// ui.js — Pure(ish) DOM rendering helpers. No app/quiz state lives here;
// callers pass in the data to render. Screen switching is centralized in
// showScreen() so exactly one <section class="screen"> is visible at a time.
// ============================================================================

import { qs, qsa, pct } from './utils.js';
import { PANEL_COLORS, TIMER_BAR_COLORS } from './config.js';
import { QuestionStatus } from './state.js';

const SCREEN_IDS = [
  'screen-loading', 'screen-home', 'screen-menu', 'screen-settings',
  'screen-question', 'screen-results', 'screen-review', 'screen-error', 'screen-exit',
];

/** Shows exactly one screen by DOM id, hides all others. */
export function showScreen(id) {
  for (const sid of SCREEN_IDS) {
    const node = document.getElementById(sid);
    if (!node) continue;
    node.classList.toggle('is-hidden', sid !== id);
  }
}

export function renderHome(affirmationText) {
  qs('#affirmationText').textContent = affirmationText || '';
}

export function renderMenu({ kumiteEnabled, kataEnabled, statusMessage }) {
  qs('#btnStartKumite').disabled = !kumiteEnabled;
  qs('#btnStartKata').disabled = !kataEnabled;
  qs('#datasetStatus').textContent = statusMessage || '';
}

export function applyPanelColor(colorKey) {
  const hex = PANEL_COLORS[colorKey] || PANEL_COLORS.white;
  document.documentElement.style.setProperty('--question-panel-bg', hex);
  const panel = qs('#questionPanel');
  if (panel) panel.style.background = hex;
  const reviewPanel = qs('#reviewPanel');
  if (reviewPanel) reviewPanel.style.background = hex;
}

export function renderQuestion({ index, total, text }) {
  qs('#progressIndicator').textContent = `Ερώτηση ${index + 1} / ${total}`;
  qs('#questionText').textContent = text;
}

/** Updates the timer bar width + color band per spec §25. */
export function renderTimerBar(remainingMs, totalMs, isPaused) {
  const remainPct = totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;
  const elapsedPct = 100 - remainPct;
  const fill = qs('#timerBarFill');
  if (!fill) return;
  fill.style.width = `${elapsedPct}%`;

  let color;
  if (isPaused) color = TIMER_BAR_COLORS.paused;
  else if (remainPct <= 10) color = TIMER_BAR_COLORS.critical;
  else if (remainPct <= 25) color = TIMER_BAR_COLORS.warning;
  else color = TIMER_BAR_COLORS.normal;
  fill.style.backgroundColor = color;

  const track = qs('.timer-bar-track');
  if (track) track.setAttribute('aria-valuenow', String(Math.round(elapsedPct)));
}

export function setPauseButtonLabel(isPaused) {
  const btn = qs('#btnPause');
  if (btn) btn.textContent = isPaused ? 'RESUME' : 'PAUSE';
}

export function renderResults({ total, correct, wrong, unanswered, scorePercent }) {
  qs('#resTotal').textContent = String(total);
  qs('#resCorrect').textContent = String(correct);
  qs('#resWrong').textContent = String(wrong);
  qs('#resUnanswered').textContent = String(unanswered);
  qs('#resPercent').textContent = `${scorePercent.toFixed(1)}%`;
}

export function setReviewButtonEnabled(enabled) {
  const btn = qs('#btnReview');
  btn.disabled = !enabled;
  btn.title = enabled ? '' : 'Δεν υπάρχουν λανθασμένες ή αναπάντητες ερωτήσεις.';
}

export function renderReviewItem(item, index, total) {
  qs('#reviewProgress').textContent = `Ανασκόπηση ${index + 1} / ${total}`;
  qs('#reviewQuestionText').textContent = `#${item.number}: ${item.question}`;
  qs('#reviewUserAnswer').textContent = item.userAnswer === null
    ? 'NO ANSWER'
    : (item.userAnswer ? 'TRUE' : 'FALSE');
  qs('#reviewCorrectAnswer').textContent = item.correctAnswer ? 'TRUE' : 'FALSE';
}

export function renderError(message) {
  qs('#errorMessage').textContent = message;
  showScreen('screen-error');
}

export function showConnectionBanner(isOnline) {
  const banner = qs('#connectionBanner');
  if (!banner) return;
  if (isOnline) {
    banner.classList.add('is-hidden');
  } else {
    banner.textContent = 'Είστε εκτός σύνδεσης — η εφαρμογή συνεχίζει να λειτουργεί με τα δεδομένα που έχουν ήδη φορτωθεί.';
    banner.classList.remove('is-hidden');
  }
}

export function setOrientationOverlayActive(active) {
  qs('#orientationOverlay').classList.toggle('is-active', active);
}

export function showConfirmDialog(message) {
  return new Promise((resolve) => {
    const dialog = qs('#confirmDialog');
    qs('#confirmDialogText').textContent = message;
    dialog.classList.remove('is-hidden');

    const cleanup = (result) => {
      dialog.classList.add('is-hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const okBtn = qs('#confirmOk');
    const cancelBtn = qs('#confirmCancel');
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}
