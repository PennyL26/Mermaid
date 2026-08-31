// ============================================================
// storage.js — localStorage-backed settings persistence
// All defaults are centralized here (spec section 20).
// ============================================================
import { clampInt, devLog } from "./utils.js";

const STORAGE_KEY = "penny_app_settings_v1";

export const DEFAULT_SETTINGS = Object.freeze({
  questionTime: 15, // seconds
  selectionMode: "specific_random", // 'specific_random' | 'all_ordered' | 'all_random'
  questionCount: 20,
  panelColor: "white", // 'white' | 'pink' | 'yellow' | 'beige'
  timerBarColor: "#4CAF50",
});

export const QUESTION_TIME_MIN = 6;
export const QUESTION_TIME_MAX = 60;

const VALID_MODES = ["specific_random", "all_ordered", "all_random"];
const VALID_COLORS = ["white", "pink", "yellow", "beige"];

/**
 * Load settings from localStorage, validating every field.
 * Any corrupt/missing/out-of-range field silently falls back to default,
 * per spec section 20 ("Αν το localStorage περιέχει corrupt ή μη έγκυρες τιμές...").
 */
export function loadSettings() {
  let raw = null;
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (text) raw = JSON.parse(text);
  } catch (e) {
    devLog("Corrupt settings JSON, using defaults", e);
    raw = null;
  }
  if (!raw || typeof raw !== "object") raw = {};

  const questionTime = clampInt(
    raw.questionTime,
    QUESTION_TIME_MIN,
    QUESTION_TIME_MAX,
    DEFAULT_SETTINGS.questionTime
  );

  const selectionMode = VALID_MODES.includes(raw.selectionMode)
    ? raw.selectionMode
    : DEFAULT_SETTINGS.selectionMode;

  const questionCountRaw = Number(raw.questionCount);
  const questionCount =
    Number.isFinite(questionCountRaw) && Number.isInteger(questionCountRaw) && questionCountRaw > 0
      ? questionCountRaw
      : DEFAULT_SETTINGS.questionCount;

  const panelColor = VALID_COLORS.includes(raw.panelColor)
    ? raw.panelColor
    : DEFAULT_SETTINGS.panelColor;

  const timerBarColor =
    typeof raw.timerBarColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.timerBarColor)
      ? raw.timerBarColor
      : DEFAULT_SETTINGS.timerBarColor;

  return { questionTime, selectionMode, questionCount, panelColor, timerBarColor };
}

/** Persist settings to localStorage. Fails silently (best-effort). */
export function saveSettings(settings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    devLog("Failed to save settings", e);
    return false;
  }
}
