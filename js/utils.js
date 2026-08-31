// ============================================================
// utils.js — small, dependency-free helper functions
// ============================================================

/**
 * Unbiased Fisher-Yates shuffle. Returns a NEW array; does not
 * mutate the input. Required by spec section 53/18 — a plain
 * `array.sort(() => Math.random() - 0.5)` is explicitly forbidden
 * because it is a biased shuffle.
 * @param {Array} arr
 * @returns {Array}
 */
export function fisherYatesShuffle(arr) {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Pick `n` unique random items from arr using Fisher-Yates. */
export function pickRandomN(arr, n) {
  return fisherYatesShuffle(arr).slice(0, n);
}

/** Trim + collapse a cell value to a string; null/undefined -> "". */
export function cellToString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** True if the string represents a positive integer (no sign, no decimals). */
export function isPositiveIntegerString(str) {
  return /^[0-9]+$/.test(str) && Number(str) > 0;
}

/** Normalize a TRUE/FALSE cell. Returns "TRUE", "FALSE", or null if invalid. */
export function normalizeBoolAnswer(raw) {
  const v = cellToString(raw).toUpperCase();
  if (v === "TRUE") return "TRUE";
  if (v === "FALSE") return "FALSE";
  return null;
}

/** Format seconds as a whole-number clamp within [min, max]. */
export function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

/** Simple environment check: are we running on localhost / 127.0.0.1? */
export function isDevelopmentHost() {
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "";
}

/** Development-only logger; silent in production. */
export function devLog(...args) {
  if (isDevelopmentHost()) {
    // eslint-disable-next-line no-console
    console.log("[penny-app]", ...args);
  }
}

export function devTime(label) {
  if (isDevelopmentHost()) console.time("[penny-app] " + label);
}
export function devTimeEnd(label) {
  if (isDevelopmentHost()) console.timeEnd("[penny-app] " + label);
}

/** Format a Date as YYYYMMDD_HHMMSS for export filenames. */
export function formatTimestampForFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "_" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/** Escape a value for safe inclusion in a CSV cell. */
export function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/** Trigger a browser download of a Blob with the given filename. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke slightly later so the download has time to start in all browsers.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
