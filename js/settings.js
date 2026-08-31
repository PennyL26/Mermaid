// ============================================================
// settings.js — Settings screen: read/write localStorage-backed
// settings. Changes are saved immediately to storage, but the
// spec requires that an in-progress quiz keeps using a SNAPSHOT
// taken at start time (handled by quiz.js/app.js), so editing
// Settings mid-quiz never affects it.
// ============================================================
import { loadSettings, saveSettings, QUESTION_TIME_MIN, QUESTION_TIME_MAX } from "./storage.js";
import { clampInt } from "./utils.js";

export function initSettingsForm(dom) {
  const settings = loadSettings();
  applySettingsToForm(dom, settings);

  const persist = () => {
    const next = readSettingsFromForm(dom);
    saveSettings(next);
    updateQuestionCountVisibility(dom, next.selectionMode);
  };

  dom.settingQuestionTime.addEventListener("change", persist);
  dom.settingQuestionCount.addEventListener("change", persist);
  for (const radio of dom.selectionModeRadios) {
    radio.addEventListener("change", persist);
  }
  for (const radio of dom.panelColorRadios) {
    radio.addEventListener("change", persist);
  }

  return { getCurrentSettings: () => loadSettings() };
}

function applySettingsToForm(dom, settings) {
  dom.settingQuestionTime.min = QUESTION_TIME_MIN;
  dom.settingQuestionTime.max = QUESTION_TIME_MAX;
  dom.settingQuestionTime.value = settings.questionTime;
  dom.settingQuestionCount.value = settings.questionCount;

  for (const radio of dom.selectionModeRadios) {
    radio.checked = radio.value === settings.selectionMode;
  }
  for (const radio of dom.panelColorRadios) {
    radio.checked = radio.value === settings.panelColor;
  }
  updateQuestionCountVisibility(dom, settings.selectionMode);
}

function updateQuestionCountVisibility(dom, mode) {
  dom.questionCountWrap.style.display = mode === "specific_random" ? "block" : "none";
}

function readSettingsFromForm(dom) {
  const current = loadSettings();

  const questionTime = clampInt(
    dom.settingQuestionTime.value,
    QUESTION_TIME_MIN,
    QUESTION_TIME_MAX,
    current.questionTime
  );

  let selectionMode = current.selectionMode;
  for (const radio of dom.selectionModeRadios) {
    if (radio.checked) selectionMode = radio.value;
  }

  let panelColor = current.panelColor;
  for (const radio of dom.panelColorRadios) {
    if (radio.checked) panelColor = radio.value;
  }

  const countRaw = Number(dom.settingQuestionCount.value);
  const questionCount =
    Number.isFinite(countRaw) && Number.isInteger(countRaw) && countRaw > 0
      ? countRaw
      : current.questionCount;

  return {
    questionTime,
    selectionMode,
    questionCount,
    panelColor,
    timerBarColor: current.timerBarColor,
  };
}
