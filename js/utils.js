// ============================================================================
// utils.js — Small reusable helpers used across modules.
// ============================================================================

/**
 * Unbiased Fisher-Yates shuffle. Returns a NEW array; does not mutate input.
 * Required by spec §53 — array.sort(random) is explicitly forbidden.
 */
export function fisherYatesShuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Pick N unique random elements from array using unbiased shuffle (§18.A) */
export function pickRandomN(array, n) {
  return fisherYatesShuffle(array).slice(0, n);
}

/** Pick a random element from an array (used for the mini-affirmation) */
export function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/** Query-selector shorthand */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Create an element with optional class list and text content */
export function el(tag, { className, text, attrs } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  }
  return node;
}

/** Clamp a number between min and max */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Format seconds remaining as a friendly progress percentage string, unused directly but handy */
export function pct(part, total) {
  if (total <= 0) return 0;
  return clamp((part / total) * 100, 0, 100);
}

/** Timestamp string for filenames: YYYYMMDD_HHMMSS */
export function timestampForFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Trigger a browser download of a text blob */
export function downloadTextFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob(['\uFEFF' + content], { type: mime }); // BOM for Excel/UTF-8 friendliness
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Escape a value for safe CSV embedding */
export function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Simple event emitter used for decoupled module communication */
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }
  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }
  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }
  emit(event, payload) {
    this._listeners.get(event)?.forEach((h) => h(payload));
  }
}
