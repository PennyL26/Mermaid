// ============================================================================
// excel.js — Load & validate question/affirmation Excel files.
// Uses the global `XLSX` object provided by vendor/xlsx.full.min.js (SheetJS).
// All validation rules follow spec §7-13 exactly.
// ============================================================================

/**
 * @typedef {Object} QARecord
 * @property {number} number
 * @property {string} question
 * @property {boolean} answer  // true = TRUE, false = FALSE
 */

/**
 * @typedef {Object} LoadResult
 * @property {boolean} ok
 * @property {QARecord[]} records   // present & sorted if ok
 * @property {string} [error]       // user-friendly message if !ok
 */

function normalizeAnswer(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'boolean' && typeof raw !== 'number') return null;
  if (typeof raw === 'boolean') return raw; // some sheets encode TRUE/FALSE as boolean cells
  const s = String(raw).trim().toUpperCase();
  if (s === 'TRUE') return true;
  if (s === 'FALSE') return false;
  return null; // invalid — anything else (YES/NO/1/0/ΝΑΙ/ΟΧΙ) is rejected per §11
}

/**
 * Validates & normalizes raw rows (array of {A,B,C}) into sorted QARecord[].
 * Returns {ok, records, error}.
 */
export function validateQuestionRows(rawRows) {
  // Step 1: filter out rows with invalid number OR empty/invalid question text (§10)
  const candidates = [];
  for (const row of rawRows) {
    const numRaw = row[0];
    const qRaw = row[1];
    const aRaw = row[2];

    const num = Number(numRaw);
    const numValid = Number.isInteger(num) && num > 0;

    const qText = typeof qRaw === 'string' ? qRaw.trim() : (qRaw === undefined || qRaw === null ? '' : String(qRaw).trim());
    const qValid = qText.length > 0;

    if (!numValid || !qValid) continue; // silently dropped, per §10

    const answer = normalizeAnswer(aRaw);
    if (answer === null) continue; // invalid TRUE/FALSE value -> row dropped

    candidates.push({ number: num, question: qText, answer });
  }

  if (candidates.length === 0) {
    return { ok: false, records: [], error: 'Το αρχείο δεν περιέχει έγκυρες ερωτήσεις.' };
  }

  // Step 2: check numbering forms exactly 1..N after filtering (§9, §10)
  const sorted = candidates.slice().sort((a, b) => a.number - b.number);
  const seen = new Set();
  for (const r of sorted) {
    if (seen.has(r.number)) {
      return { ok: false, records: [], error: 'Το αρχείο περιέχει διπλότυπους αριθμούς ερωτήσεων.' };
    }
    seen.add(r.number);
  }
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].number !== i + 1) {
      return {
        ok: false,
        records: [],
        error: 'Η αρίθμηση των ερωτήσεων δεν σχηματίζει ακριβώς την ακολουθία 1...N (υπάρχουν κενά ή λάθος σειρά).',
      };
    }
  }

  return { ok: true, records: sorted };
}

/**
 * Validates rows for the mini-affirmations file: columns A (number), B (text) only.
 */
export function validateAffirmationRows(rawRows) {
  const candidates = [];
  for (const row of rawRows) {
    const numRaw = row[0];
    const textRaw = row[1];
    const num = Number(numRaw);
    const numValid = Number.isInteger(num) && num > 0;
    const text = typeof textRaw === 'string' ? textRaw.trim() : (textRaw === undefined || textRaw === null ? '' : String(textRaw).trim());
    if (!numValid || text.length === 0) continue;
    candidates.push({ number: num, text });
  }
  if (candidates.length === 0) {
    return { ok: false, records: [], error: 'Το αρχείο μηνυμάτων δεν περιέχει έγκυρες εγγραφές.' };
  }
  return { ok: true, records: candidates };
}

/**
 * Fetches and parses an xlsx file at `path` using SheetJS, skipping the header row.
 * Returns raw row arrays (array of arrays), or throws with a descriptive message.
 */
async function fetchAndParseRows(path) {
  let response;
  try {
    response = await fetch(path, { cache: 'no-cache' });
  } catch (networkErr) {
    throw new Error('network');
  }
  if (!response.ok) {
    throw new Error('missing');
  }
  let buffer;
  try {
    buffer = await response.arrayBuffer();
  } catch (e) {
    throw new Error('read');
  }
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('empty');
  }
  let workbook;
  try {
    if (typeof XLSX === 'undefined') {
      throw new Error('library-missing');
    }
    // codepage:false + type 'array' keeps full UTF-8 support for Greek text (§8)
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch (e) {
    if (e && e.message === 'library-missing') throw e;
    throw new Error('corrupt');
  }
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('corrupt');
  const sheet = workbook.Sheets[firstSheetName];
  // header:1 => array-of-arrays, raw values, preserves UTF-8 text as-is
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  if (!allRows || allRows.length === 0) throw new Error('empty');
  // Drop header row (§9 first row is never a question)
  return allRows.slice(1);
}

const ERROR_MESSAGES = {
  network: 'Δεν ήταν δυνατή η φόρτωση του αρχείου (πρόβλημα δικτύου ή CORS). Βεβαιωθείτε ότι η εφαρμογή εκτελείται μέσω web server.',
  missing: 'Το αρχείο δεν βρέθηκε στον φάκελο δεδομένων.',
  read: 'Δεν ήταν δυνατή η ανάγνωση του αρχείου.',
  empty: 'Το αρχείο είναι κενό.',
  corrupt: 'Το αρχείο είναι κατεστραμμένο ή μη αναγνώσιμο.',
  'library-missing': 'Η βιβλιοθήκη ανάγνωσης Excel (SheetJS) δεν είναι διαθέσιμη. Δείτε vendor/README.txt.',
};

/**
 * Loads + validates a question dataset. Never throws — always resolves a LoadResult.
 */
export async function loadQuestionDataset(path) {
  try {
    const rows = await fetchAndParseRows(path);
    return validateQuestionRows(rows);
  } catch (e) {
    const key = e && e.message in ERROR_MESSAGES ? e.message : 'corrupt';
    return { ok: false, records: [], error: ERROR_MESSAGES[key] };
  }
}

/**
 * Loads + validates the affirmations dataset. Never throws.
 */
export async function loadAffirmationsDataset(path) {
  try {
    const rows = await fetchAndParseRows(path);
    return validateAffirmationRows(rows);
  } catch (e) {
    const key = e && e.message in ERROR_MESSAGES ? e.message : 'corrupt';
    return { ok: false, records: [], error: ERROR_MESSAGES[key] };
  }
}
