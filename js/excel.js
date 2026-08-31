// ============================================================
// excel.js — loading & validating question/affirmation datasets
//
// All file paths are centralized here (spec section 4) so they
// can be changed in one place. Loading uses fetch() (not
// FileReader) so it works under a real web server (spec section 5).
// ============================================================
import { cellToString, isPositiveIntegerString, normalizeBoolAnswer, devLog } from "./utils.js";

export const DATA_PATHS = Object.freeze({
  KUMITE: "data/qkumite.xlsx",
  KATA: "data/qkata.xlsx",
  AFFIRMATIONS: "data/mini-affirmations-mermaid.xlsx",
});

export const DEFAULT_AFFIRMATION = "Καλή επιτυχία στην προσπάθειά σου Αγάπη μου!";

/**
 * @typedef {Object} LoadResult
 * @property {boolean} valid
 * @property {Array} items - validated rows (questions or affirmation texts)
 * @property {string} [errorReason] - human-readable reason when invalid
 */

/**
 * Fetch and parse an .xlsx file into an array of raw rows (array-of-arrays),
 * skipping nothing — validation happens in the caller.
 * Throws on network/parsing failure so callers can distinguish
 * "file missing" from "file invalid".
 */
async function fetchWorkbookRows(url) {
  let response;
  try {
    response = await fetch(url, { cache: "no-cache" });
  } catch (networkError) {
    const err = new Error("NETWORK_ERROR");
    err.cause = networkError;
    throw err;
  }
  if (!response.ok) {
    const err = new Error("FILE_NOT_FOUND");
    err.status = response.status;
    throw err;
  }
  const buffer = await response.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    throw new Error("EMPTY_FILE");
  }
  let workbook;
  try {
    // eslint-disable-next-line no-undef
    workbook = XLSX.read(buffer, { type: "array", codepage: 65001 });
  } catch (parseError) {
    const err = new Error("PARSE_ERROR");
    err.cause = parseError;
    throw err;
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("NO_SHEETS");
  const sheet = workbook.Sheets[sheetName];
  // header:1 => array-of-arrays, raw values, keeps UTF-8 text intact
  // eslint-disable-next-line no-undef
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  return rows;
}

/**
 * Load & validate a TRUE/FALSE question dataset (KUMITE or KATA).
 * Implements spec sections 7, 9, 10, 11:
 *  - column A: positive integer, unique, no gaps, exact 1..N sequence
 *  - column B: non-empty trimmed text
 *  - column C: TRUE/FALSE (normalized, case-insensitive, trimmed)
 *  - invalid rows are dropped, THEN numbering is re-validated
 *  - if the remaining sequence isn't exactly 1..N, the whole dataset is invalid
 * @returns {Promise<LoadResult>}
 */
export async function loadQuestionDataset(url) {
  let rows;
  try {
    rows = await fetchWorkbookRows(url);
  } catch (e) {
    return { valid: false, items: [], errorReason: mapLoadErrorToMessage(e) };
  }

  if (!rows || rows.length <= 1) {
    return { valid: false, items: [], errorReason: "Το αρχείο δεν περιέχει ερωτήσεις." };
  }

  const dataRows = rows.slice(1); // drop header row
  const candidates = [];

  for (const row of dataRows) {
    const numRaw = cellToString(row[0]);
    const textRaw = cellToString(row[1]);
    const answerRaw = row[2];

    // A fully empty line is ignored silently (section 10).
    if (numRaw === "" && textRaw === "" && cellToString(answerRaw) === "") continue;

    if (!isPositiveIntegerString(numRaw)) continue; // invalid number -> drop row
    if (textRaw === "") continue; // invalid/empty text -> drop row

    const answer = normalizeBoolAnswer(answerRaw);
    if (answer === null) continue; // invalid TRUE/FALSE -> drop row

    candidates.push({ number: Number(numRaw), text: textRaw, answer });
  }

  if (candidates.length === 0) {
    return { valid: false, items: [], errorReason: "Δεν βρέθηκαν έγκυρες ερωτήσεις στο αρχείο." };
  }

  // Re-validate numbering AFTER filtering (section 10): must be unique and
  // form exactly 1..N once sorted. Duplicates and gaps invalidate the dataset.
  const sorted = candidates.slice().sort((a, b) => a.number - b.number);
  const seen = new Set();
  for (const item of sorted) {
    if (seen.has(item.number)) {
      return { valid: false, items: [], errorReason: "Βρέθηκαν διπλότυποι αριθμοί ερωτήσεων." };
    }
    seen.add(item.number);
  }
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].number !== i + 1) {
      return {
        valid: false,
        items: [],
        errorReason: "Η αρίθμηση των ερωτήσεων δεν σχηματίζει ακριβώς τη σειρά 1...N.",
      };
    }
  }

  return { valid: true, items: sorted, errorReason: null };
}

/**
 * Load & validate the mini-affirmations dataset (spec section 7.1).
 * Only requires column B to hold non-empty text.
 * @returns {Promise<LoadResult>}
 */
export async function loadAffirmationsDataset(url) {
  let rows;
  try {
    rows = await fetchWorkbookRows(url);
  } catch (e) {
    devLog("Affirmations load failed, falling back to default message", e.message);
    return { valid: false, items: [], errorReason: mapLoadErrorToMessage(e) };
  }

  if (!rows || rows.length <= 1) {
    return { valid: false, items: [], errorReason: "empty" };
  }

  const dataRows = rows.slice(1);
  const texts = [];
  for (const row of dataRows) {
    const text = cellToString(row[1]);
    if (text !== "") texts.push(text);
  }

  if (texts.length === 0) {
    return { valid: false, items: [], errorReason: "empty" };
  }
  return { valid: true, items: texts, errorReason: null };
}

function mapLoadErrorToMessage(e) {
  switch (e && e.message) {
    case "FILE_NOT_FOUND":
      return "Το αρχείο δεδομένων δεν βρέθηκε.";
    case "NETWORK_ERROR":
      return "Αποτυχία φόρτωσης λόγω σφάλματος δικτύου (πιθανό πρόβλημα CORS ή σύνδεσης).";
    case "EMPTY_FILE":
      return "Το αρχείο είναι κενό.";
    case "PARSE_ERROR":
      return "Το αρχείο είναι κατεστραμμένο ή μη αναγνώσιμο.";
    case "NO_SHEETS":
      return "Το αρχείο δεν περιέχει φύλλα εργασίας.";
    default:
      return "Άγνωστο σφάλμα κατά τη φόρτωση του αρχείου.";
  }
}
