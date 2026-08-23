// ============================================================================
// storage.js — Persist & retrieve Settings via localStorage.
// If stored data is missing/corrupt/invalid, silently fall back to defaults
// on a PER-FIELD basis (spec §20, Test 17 & 18).
// ============================================================================

import { SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS, TIMER_MIN_SECONDS, TIMER_MAX_SECONDS, PANEL_COLORS } from './config.js';

const VALID_SELECTION_MODES = new Set(['specific_random', 'all_ordered', 'all_random']);
const VALID_PANEL_COLORS = new Set(Object.keys(PANEL_COLORS));

function isValidQuestionTime(v) {
  return Number.isFinite(v) && Number.isInteger(v) && v >= TIMER_MIN_SECONDS && v <= TIMER_MAX_SECONDS;
}
function isValidQuestionCount(v) {
  return Number.isFinite(v) && Number.isInteger(v) && v > 0;
}
function isValidHexColor(v) {
  return typeof v === 'string' && /^#([0-9A-Fa-f]{6})$/.test(v);
}

/**
 * Loads settings from localStorage, validating each field independently.
 * Any missing/corrupt field falls back to its own default — a single bad
 * field never invalidates the whole settings object.
 */
export function loadSettings() {
  let raw = null;
  try {
    const str = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (str) raw = JSON.parse(str);
  } catch (e) {
    console.error('Corrupt settings JSON in localStorage, using defaults.', e);
    raw = null;
  }
  if (!raw || typeof raw !== 'object') raw = {};

  const settings = { ...DEFAULT_SETTINGS };

  if (isValidQuestionTime(raw.questionTimeSeconds)) {
    settings.questionTimeSeconds = raw.questionTimeSeconds;
  }
  if (VALID_SELECTION_MODES.has(raw.selectionMode)) {
    settings.selectionMode = raw.selectionMode;
  }
  if (isValidQuestionCount(raw.questionCount)) {
    settings.questionCount = raw.questionCount;
  }
  if (VALID_PANEL_COLORS.has(raw.panelColor)) {
    settings.panelColor = raw.panelColor;
  }
  if (isValidHexColor(raw.timerBarColor)) {
    settings.timerBarColor = raw.timerBarColor;
  }

  return settings;
}

/** Persist settings object to localStorage. */
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error('Failed to save settings to localStorage.', e);
    return false;
  }
}

export { isValidQuestionTime, isValidQuestionCount };
