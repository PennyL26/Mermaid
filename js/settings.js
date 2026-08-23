// ============================================================================
// settings.js — Settings screen controller.
// Responsible only for reading the DOM form <-> settings object <-> storage.
// Does NOT know about quiz/timer internals (separation of concerns).
// ============================================================================

import { loadSettings, saveSettings } from './storage.js';
import { TIMER_MIN_SECONDS, TIMER_MAX_SECONDS, PANEL_COLORS } from './config.js';
import { qs, clamp } from './utils.js';

export class SettingsController {
  constructor() {
    this.current = loadSettings();
  }

  /** Populate the Settings form DOM from the current in-memory settings. */
  renderToForm() {
    qs('#settingQuestionTime').value = this.current.questionTimeSeconds;
    qs(`#mode-${this.current.selectionMode}`).checked = true;
    qs('#settingQuestionCount').value = this.current.questionCount;
    qs(`#panelColor-${this.current.panelColor}`).checked = true;
    this._toggleQuestionCountVisibility();
  }

  _toggleQuestionCountVisibility() {
    const mode = qs('input[name="selectionMode"]:checked')?.value || this.current.selectionMode;
    const wrapper = qs('#questionCountWrapper');
    // Field only shown/enabled for 'specific_random' (§19)
    wrapper.classList.toggle('is-hidden', mode !== 'specific_random');
  }

  /** Wires up live interactions on the Settings form (radio toggle, panel color preview). */
  attachFormListeners() {
    document.querySelectorAll('input[name="selectionMode"]').forEach((radio) => {
      radio.addEventListener('change', () => this._toggleQuestionCountVisibility());
    });
  }

  /**
   * Reads the form, validates, saves. Returns {ok, settings, errors}.
   */
  saveFromForm() {
    const errors = [];

    let questionTimeSeconds = parseInt(qs('#settingQuestionTime').value, 10);
    if (!Number.isFinite(questionTimeSeconds)) {
      errors.push('Ο χρόνος ερώτησης πρέπει να είναι αριθμός.');
      questionTimeSeconds = this.current.questionTimeSeconds;
    } else {
      questionTimeSeconds = clamp(Math.round(questionTimeSeconds), TIMER_MIN_SECONDS, TIMER_MAX_SECONDS);
    }

    const selectionMode = qs('input[name="selectionMode"]:checked')?.value || this.current.selectionMode;

    let questionCount = parseInt(qs('#settingQuestionCount').value, 10);
    if (selectionMode === 'specific_random') {
      if (!Number.isFinite(questionCount) || questionCount <= 0) {
        errors.push('Ο αριθμός ερωτήσεων πρέπει να είναι θετικός ακέραιος.');
        questionCount = this.current.questionCount;
      }
    } else {
      questionCount = this.current.questionCount; // preserved but unused
    }

    const panelColor = qs('input[name="panelColor"]:checked')?.value || this.current.panelColor;
    if (!(panelColor in PANEL_COLORS)) {
      errors.push('Μη έγκυρο χρώμα panel.');
    }

    const next = {
      questionTimeSeconds,
      selectionMode,
      questionCount,
      panelColor: panelColor in PANEL_COLORS ? panelColor : this.current.panelColor,
      timerBarColor: this.current.timerBarColor,
    };

    this.current = next;
    const saved = saveSettings(next);
    return { ok: saved && errors.length === 0, settings: next, errors };
  }

  /** Returns a deep-ish snapshot suitable for freezing into a quiz session (§15, §44). */
  getSnapshot() {
    return { ...this.current };
  }
}
