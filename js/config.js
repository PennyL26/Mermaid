// ============================================================================
// config.js — Central configuration: file paths & default settings.
// Per spec §4 and §20, all data paths and default values live in ONE place.
// ============================================================================

export const DATA_PATHS = {
  KUMITE: 'data/qkumite.xlsx',
  KATA: 'data/qkata.xlsx',
  AFFIRMATIONS: 'data/mini-affirmations.xlsx',
};

// localStorage key used to persist settings (§20)
export const SETTINGS_STORAGE_KEY = 'tf_app_settings_v1';

// Default settings — must be explicit and centralized (§20)
export const DEFAULT_SETTINGS = Object.freeze({
  questionTimeSeconds: 15,
  selectionMode: 'specific_random', // 'specific_random' | 'all_ordered' | 'all_random'
  questionCount: 20,
  panelColor: 'white', // 'white' | 'pink' | 'yellow' | 'beige'
  timerBarColor: '#4CAF50',
});

// Panel color options -> actual CSS color values
export const PANEL_COLORS = {
  white: '#FFFFFF',
  pink: '#FFE1EC',
  yellow: '#FFF9C4',
  beige: '#F5EBDD',
};

// Timer duration bounds (§16)
export const TIMER_MIN_SECONDS = 4;
export const TIMER_MAX_SECONDS = 60;

// Timer bar color thresholds (§25)
export const TIMER_BAR_COLORS = {
  normal: '#FFB6C1',   // > 25%
  warning: '#FFC0CB',  // 11-25%
  critical: '#FF69B4', // <= 10%
  paused: '#9E9E9E',
};

// Fade transition duration in ms (§33)
export const TRANSITION_DURATION_MS = 1000;

// Minimum horizontal swipe distance in px to count as NEXT (§31)
export const SWIPE_MIN_DISTANCE_PX = 50;

// Results export recipient (informational only — see README note on §61)
export const EXPORT_EMAIL = 'soulouwarez@gmail.com';

// Development mode detection (localhost) — §62
export const IS_DEV = ['localhost', '127.0.0.1', ''].includes(location.hostname);

export function logDev(...args) {
  if (IS_DEV) console.log('[DEV]', ...args);
}
