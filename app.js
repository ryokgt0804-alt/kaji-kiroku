"use strict";

// 家事記録 Web版 v15
// 修正内容：ブラウザ印刷ではなく直接PDF生成へ変更、URL/日時/ページ番号を出さない、PDF内の表を拡大

const STORAGE_PREFIX = "kaji-kiroku-web-v1";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const BATH_MINUTES = [15, 30, 45, 60, 75, 90, 105, 120];
const EXTRA_MINUTES = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];

let bathTapIgnoreUntil = 0;
let outsideTableTouchY = null;
let lastTouchEndTime = 0;

const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  period: new Date().getDate() <= 15 ? "first" : "second",
  records: [],
  summaryShown: false,
  summaryExpanded: true
};

const el = {
  yearSelect: document.getElementById("yearSelect"),
  monthSelect: document.getElementById("monthSelect"),
  firstHalfButton: document.getElementById("firstHalfButton"),
  secondHalfButton: document.getElementById("secondHalfButton"),
  periodTitle: document.getElementById("periodTitle"),
  recordBody: document.getElementById("recordBody"),
  summaryButton: document.getElementById("summaryButton"),
  pdfButton: document.getElementById("pdfButton"),
  summaryPanel: document.getElementById("summaryPanel"),
  summaryHeader: document.getElementById("summaryHeader"),
  summaryContent: document.getElementById("summaryContent"),
  summaryArrow: document.getElementById("summaryArrow"),
  collapsedSummary: document.getElementById("collapsedSummary"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalDoneButton: document.getElementById("modalDoneButton"),
  printArea: document.getElementById("printArea"),
  exportDataButton: document.getElementById("exportDataButton"),
  importDataInput: document.getElementById("importDataInput")
};

function comma(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function yen(value) {
  return `${comma(value)}円`;
}

function yenMark(value) {
  return `¥${comma(value)}`;
}

function storageKeyFor(year, month, period) {
  return `${STORAGE_PREFIX}-${year}-${month}-${period}`;
}

function periodForDay(day) {
  return day <= 15 ? "first" : "second";
}

function storageKey() {
  return storageKeyFor(state.year, state.month, state.period);
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function visibleDays() {
  if (state.period === "first") {
    return Array.from({ length: 15 }, (_, index) => index + 1);
  }

  const lastDay = daysInMonth(state.year, state.month);
  return Array.from({ length: lastDay - 15 }, (_, index) => index + 16);
}

function weekday(year, month, day) {
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
}

function emptyRecord(day) {
  return {
    year: state.year,
    month: state.month,
    day,
    bathMinutes: null,
    riceCooked: false,
    trashCollected: false,
    vacuumed: false,
    shoppingMemo: "",
    shoppingAmount: null,
    extraMemo: "",
    extraMinutes: null
  };
}

function loadRecords() {
  const days = visibleDays();
  let saved = [];

  try {
    const raw = localStorage.getItem(storageKey());
    saved = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(saved)) saved = [];
  } catch {
    saved = [];
  }

  const byDay = new Map(saved.map((record) => [Number(record.day), record]));
  state.records = days.map((day) => ({
    ...emptyRecord(day),
    ...(byDay.get(day) || {}),
    year: state.year,
    month: state.month,
    day
  }));
}

function saveRecords() {
  localStorage.setItem(storageKey(), JSON.stringify(state.records));
}

function recordsFromStorageForDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const period = periodForDay(day);
  const raw = localStorage.getItem(storageKeyFor(year, month, period));

  if (!raw) return [];

  try {
    const records = JSON.parse(raw);
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function storedRecordForDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // 表示中の期間にある日付は、最新のstate.recordsを優先する
  if (year === state.year && month === state.month) {
    const currentRecord = state.records.find((record) => Number(record.day) === day);
    if (currentRecord) return currentRecord;
  }

  // 表示中ではない前半/後半、前月、翌月、年またぎの日付はlocalStorageから読む
  const storedRecords = recordsFromStorageForDate(date);
  return storedRecords.find((record) => Number(record.day) === day) || null;
}

function bathMinutesForDate(date) {
  const record = storedRecordForDate(date);
  return Number(record?.bathMinutes) || 0;
}

function mondayOfSameWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = result.getDay();
  const offset = (dayOfWeek + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

function bathBonusActiveForDate(year, month, day) {
  const target = new Date(year, month - 1, day);
  const dayOfWeek = target.getDay();

  if (dayOfWeek !== 0 && dayOfWeek !== 6) {
    return false;
  }

  const monday = mondayOfSameWeek(target);

  // 月曜〜金曜をDate加算で確認するため、
  // 前半/後半またぎ・月またぎ・年またぎでも同じ週として判定できる
  for (let i = 0; i < 5; i++) {
    const weekdayDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);

    if (bathMinutesForDate(weekdayDate) < 15) {
      return false;
    }
  }

  return true;
}

function bathBonusMinutesForRecord(record) {
  return bathBonusActiveForDate(record.year, record.month, record.day) ? 15 : 0;
}

function bathBonusCountForVisibleRecords() {
  return state.records.filter((record) => bathBonusMinutesForRecord(record) > 0).length;
}

function bathDisplayTextForRecord(record) {
  return minutesText(record.bathMinutes);
}

function bathPrintHTML(record) {
  const hasBonus = bathBonusMinutesForRecord(record) > 0;
  const manualText = bathDisplayTextForRecord(record);

  if (!hasBonus) {
    return manualText;
  }

  return `<div class="print-bath-split"><span>☆</span><span>${manualText}</span></div>`;
}

function calculateSummary() {
  const bathManualMinutes = state.records.reduce((sum, r) => sum + (Number(r.bathMinutes) || 0), 0);
  const bathBonusCount = bathBonusCountForVisibleRecords();
  const bathBonusMinutes = bathBonusCount * 15;
  const bathMinutes = bathManualMinutes + bathBonusMinutes;
  const bathAmount = Math.floor(bathMinutes / 15) * 300;

  const riceDays = state.records.filter((r) => r.riceCooked).length;
  const riceAmount = riceDays * 300;

  const trashCount = state.records.filter((r) => r.trashCollected).length;
  const trashAmount = trashCount * 200;

  const vacuumCount = state.records.filter((r) => r.vacuumed).length;
  const vacuumAmount = vacuumCount * 1000;

  const shoppingTotal = state.records.reduce((sum, r) => sum + (Number(r.shoppingAmount) || 0), 0);
  const shoppingReward = state.records.reduce((sum, r) => {
    const amount = Number(r.shoppingAmount) || 0;
    return amount > 0 ? sum + Math.ceil(amount / 500) * 50 : sum;
  }, 0);

  const extraMinutes = state.records.reduce((sum, r) => sum + (Number(r.extraMinutes) || 0), 0);
  const extraAmount = Math.floor(extraMinutes / 15) * 300;

  const totalAmount = bathAmount + riceAmount + trashAmount + vacuumAmount + shoppingReward + extraAmount;

  return {
    bathManualMinutes,
    bathBonusCount,
    bathBonusMinutes,
    bathMinutes,
    bathAmount,
    riceDays,
    riceAmount,
    trashCount,
    trashAmount,
    vacuumCount,
    vacuumAmount,
    shoppingTotal,
    shoppingReward,
    extraMinutes,
    extraAmount,
    totalAmount
  };
}

function periodTitleText() {
  const days = visibleDays();
  return `${state.year} ${state.month}/${days[0]} 〜 ${state.month}/${days[days.length - 1]}`;
}

function minutesText(value) {
  return value ? `${value}分` : "";
}

function circleText(value) {
  return value ? "○" : "";
}

function cycleBathMinutes(record) {
  if (Date.now() < bathTapIgnoreUntil) {
    return;
  }

  const current = Number(record.bathMinutes) || 0;

  if (!current) {
    record.bathMinutes = 15;
  } else if (current >= 120) {
    record.bathMinutes = null;
  } else {
    record.bathMinutes = current + 15;
  }

  afterChange();
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function renderSelectors() {
  el.yearSelect.innerHTML = "";
  const currentYear = new Date().getFullYear();

  for (let year = currentYear - 2; year <= currentYear + 10; year++) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = `${year}年`;
    option.selected = year === state.year;
    el.yearSelect.appendChild(option);
  }

  el.monthSelect.innerHTML = "";
  for (let month = 1; month <= 12; month++) {
    const option = document.createElement("option");
    option.value = String(month);
    option.textContent = `${month}月`;
    option.selected = month === state.month;
    el.monthSelect.appendChild(option);
  }
}

function renderPeriodButtons() {
  el.firstHalfButton.classList.toggle("active", state.period === "first");
  el.secondHalfButton.classList.toggle("active", state.period === "second");
}

function renderTable() {
  el.periodTitle.textContent = periodTitleText();
  el.recordBody.innerHTML = "";

  for (const record of state.records) {
    const tr = document.createElement("tr");

    tr.appendChild(normalCell(String(record.day)));
    tr.appendChild(normalCell(weekday(record.year, record.month, record.day)));

    tr.appendChild(bathCell(record));
    tr.appendChild(editableCell(circleText(record.riceCooked), () => {
      record.riceCooked = !record.riceCooked;
      afterChange();
    }, "circle"));

    tr.appendChild(editableCell(circleText(record.trashCollected), () => {
      record.trashCollected = !record.trashCollected;
      afterChange();
    }, "circle"));

    tr.appendChild(editableCell(circleText(record.vacuumed), () => {
      record.vacuumed = !record.vacuumed;
      afterChange();
    }, "circle"));

    tr.appendChild(twoLineCell(record.shoppingMemo, record.shoppingAmount ? yenMark(record.shoppingAmount) : "", () => openEditor(record.day, "shopping")));
    tr.appendChild(twoLineCell(record.extraMemo, minutesText(record.extraMinutes), () => openEditor(record.day, "extra")));

    el.recordBody.appendChild(tr);
  }
}

function normalCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function editableCell(text, action, className = "") {
  const td = document.createElement("td");
  td.className = `editable ${className}`.trim();
  td.textContent = text;
  td.addEventListener("click", action);
  return td;
}

function bathCell(record) {
  const td = document.createElement("td");
  const hasBonus = bathBonusMinutesForRecord(record) > 0;
  const manualText = bathDisplayTextForRecord(record);
  td.className = `editable bath-cell ${hasBonus ? "has-bath-bonus" : ""}`.trim();

  if (hasBonus) {
    const wrap = document.createElement("div");
    wrap.className = "bath-cell-wrap";

    const star = document.createElement("span");
    star.className = "bath-bonus-star";
    star.textContent = "☆";

    const manual = document.createElement("span");
    manual.className = "bath-manual-time";
    manual.textContent = manualText;

    wrap.append(star, manual);
    td.appendChild(wrap);
  } else {
    td.textContent = manualText;
  }

  let timer = null;
  let longPressed = false;
  let moved = false;
  let startX = 0;
  let startY = 0;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  td.addEventListener("pointerdown", (event) => {
    longPressed = false;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;

    if (record.bathMinutes) {
      timer = setTimeout(() => {
        longPressed = true;
        bathTapIgnoreUntil = Date.now() + 900;
        record.bathMinutes = null;
        if (navigator.vibrate) {
          navigator.vibrate(20);
        }
        afterChange();
      }, 800);
    }
  });

  td.addEventListener("pointermove", (event) => {
    const dx = Math.abs(event.clientX - startX);
    const dy = Math.abs(event.clientY - startY);

    if (dx > 10 || dy > 10) {
      moved = true;
      clearTimer();
    }
  });

  td.addEventListener("pointerup", (event) => {
    clearTimer();

    if (longPressed) {
      event.preventDefault();
      bathTapIgnoreUntil = Date.now() + 900;
      return;
    }

    if (!moved) {
      cycleBathMinutes(record);
    }
  });

  td.addEventListener("pointercancel", clearTimer);
  td.addEventListener("pointerleave", clearTimer);
  td.addEventListener("click", (event) => {
    if (Date.now() < bathTapIgnoreUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  td.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  return td;
}

function twoLineCell(memo, bottom, action) {
  const td = document.createElement("td");
  td.className = "editable";

  const wrap = document.createElement("div");
  wrap.className = "two-line-cell";

  const top = document.createElement("div");
  top.className = "cell-memo";
  top.textContent = memo || "";

  const sub = document.createElement("div");
  sub.className = "cell-sub";
  sub.textContent = bottom || "";

  wrap.append(top, sub);
  td.appendChild(wrap);
  td.addEventListener("click", action);
  return td;
}

function updateTableBottomSpace() {
  const table = document.querySelector(".record-table");

  if (!table) return;

  if (!state.summaryShown) {
    document.documentElement.style.setProperty("--table-bottom-space", "0px");
    return;
  }

  const panelHeight = el.summaryPanel ? el.summaryPanel.offsetHeight : 0;
  const targetGap = 6;
  const extraSpace = Math.max(0, panelHeight + targetGap);

  document.documentElement.style.setProperty("--table-bottom-space", `${extraSpace}px`);
}

function renderSummary() {
  if (!state.summaryShown) {
    el.summaryPanel.classList.add("hidden");
    el.summaryPanel.classList.remove("expanded", "collapsed");
    updateTableBottomSpace();
    return;
  }

  el.summaryPanel.classList.remove("hidden");
  el.summaryPanel.classList.toggle("expanded", state.summaryExpanded);
  el.summaryPanel.classList.toggle("collapsed", !state.summaryExpanded);
  const s = calculateSummary();

  el.summaryContent.classList.toggle("hidden", !state.summaryExpanded);
  el.summaryArrow.textContent = state.summaryExpanded ? "⌃" : "⌄";
  el.collapsedSummary.textContent = state.summaryExpanded ? "" : `おつかい使用 ${yenMark(s.shoppingTotal)}　合計 ${yenMark(s.totalAmount)}`;

  setText("bathUnit", `${s.bathMinutes}分`);
  setText("bathAmount", yenMark(s.bathAmount));
  setText("riceUnit", `${s.riceDays}日`);
  setText("riceAmount", yenMark(s.riceAmount));
  setText("trashUnit", `${s.trashCount}回`);
  setText("trashAmount", yenMark(s.trashAmount));
  setText("vacuumUnit", `${s.vacuumCount}回`);
  setText("vacuumAmount", yenMark(s.vacuumAmount));
  setText("shoppingUse", `使用合計 ${yenMark(s.shoppingTotal)}`);
  setText("shoppingReward", `報酬 ${yenMark(s.shoppingReward)}`);
  setText("extraUnit", `${s.extraMinutes}分`);
  setText("extraAmount", yenMark(s.extraAmount));
  setText("shoppingUseBottom", `おつかい使用 ${yen(s.shoppingTotal)}`);
  setText("totalBottom", `合計 ${yen(s.totalAmount)}`);

  requestAnimationFrame(updateTableBottomSpace);
}

function renderAll() {
  renderSelectors();
  renderPeriodButtons();
  renderTable();
  renderSummary();
}

function afterChange() {
  saveRecords();
  renderTable();
  renderSummary();
}

function changePeriod(period) {
  state.period = period;
  state.summaryShown = false;
  state.summaryExpanded = true;
  loadRecords();
  renderAll();
}

function openEditor(day, type) {
  const record = state.records.find((r) => r.day === day);
  if (!record) return;

  el.modalBody.innerHTML = "";
  el.modalTitle.textContent = type === "shopping" ? "おつかい" : "+α";

  if (type === "shopping") {
    el.modalBody.appendChild(textInput("メモ", record.shoppingMemo, (value) => {
      record.shoppingMemo = value;
      afterChange();
    }));

    const label = document.createElement("label");
    label.textContent = "金額";

    const row = document.createElement("div");
    row.className = "money-input-row";

    const mark = document.createElement("span");
    mark.textContent = "¥";

    const input = document.createElement("input");
    input.type = "tel";
    input.inputMode = "numeric";
    input.placeholder = "金額";
    input.value = record.shoppingAmount ? String(record.shoppingAmount) : "";
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "");
      record.shoppingAmount = input.value ? Number(input.value) : null;
      afterChange();
    });

    row.append(mark, input);
    label.appendChild(row);
    el.modalBody.appendChild(label);
    el.modalBody.appendChild(keyboardButton());

    el.modalBody.appendChild(resetButton("空欄に戻す", () => {
      record.shoppingMemo = "";
      record.shoppingAmount = null;
      afterChange();
      closeEditor();
    }));
  }

  if (type === "extra") {
    el.modalBody.appendChild(textInput("メモ", record.extraMemo, (value) => {
      record.extraMemo = value;
      afterChange();
    }));

    el.modalBody.appendChild(keyboardButton());

    const selectBlock = minuteSelect("+α", record.extraMinutes, EXTRA_MINUTES, (value) => {
      closeKeyboard();
      record.extraMinutes = value;
      afterChange();
    });

    const select = selectBlock.querySelector("select");
    select.addEventListener("pointerdown", closeKeyboard);
    select.addEventListener("focus", closeKeyboard);
    select.addEventListener("touchstart", closeKeyboard, { passive: true });

    el.modalBody.appendChild(selectBlock);

    el.modalBody.appendChild(resetButton("空欄に戻す", () => {
      record.extraMemo = "";
      record.extraMinutes = null;
      afterChange();
      closeEditor();
    }));
  }

  el.modalBackdrop.classList.remove("hidden");
}

function textInput(labelText, value, onInput) {
  const label = document.createElement("label");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = labelText;
  input.value = value || "";
  input.addEventListener("input", () => onInput(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      input.blur();
    }
  });

  label.appendChild(input);
  return label;
}

function minuteSelect(labelText, current, options, onChange) {
  const label = document.createElement("label");
  label.textContent = labelText;

  const select = document.createElement("select");

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "未入力";
  empty.selected = !current;
  select.appendChild(empty);

  for (const minute of options) {
    const option = document.createElement("option");
    option.value = String(minute);
    option.textContent = `${minute}分`;
    option.selected = Number(current) === minute;
    select.appendChild(option);
  }

  select.addEventListener("change", () => {
    onChange(select.value ? Number(select.value) : null);
  });

  label.appendChild(select);
  return label;
}

function keyboardButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "keyboard-button";
  button.textContent = "キーボードを閉じる";
  button.addEventListener("click", closeKeyboard);
  return button;
}

function resetButton(text, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "reset-button";
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}

function closeKeyboard() {
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
}

function closeEditor() {
  closeKeyboard();
  el.modalBackdrop.classList.add("hidden");
}

function escapeHTML(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPrintArea() {
  const s = calculateSummary();

  const rows = state.records.map((r) => `
    <tr>
      <td>${r.day}</td>
      <td>${weekday(r.year, r.month, r.day)}</td>
      <td>${bathPrintHTML(r)}</td>
      <td>${circleText(r.riceCooked)}</td>
      <td>${circleText(r.trashCollected)}</td>
      <td>${circleText(r.vacuumed)}</td>
      <td><div class="print-two"><span>${escapeHTML(r.shoppingMemo)}</span><span>${r.shoppingAmount ? yenMark(r.shoppingAmount) : ""}</span></div></td>
      <td><div class="print-two"><span>${escapeHTML(r.extraMemo)}</span><span>${minutesText(r.extraMinutes)}</span></div></td>
    </tr>
  `).join("");

  el.printArea.innerHTML = `
    <div class="print-page">
      <div class="print-title">${periodTitleText()}</div>

      <table class="print-table">
        <colgroup>
          <col style="width:7%">
          <col style="width:5%">
          <col style="width:16%">
          <col style="width:16%">
          <col style="width:16%">
          <col style="width:16%">
          <col style="width:13%">
          <col style="width:11%">
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th></th>
            <th>風呂掃除<br>(基本平日)</th>
            <th>炊飯</th>
            <th>ゴミ集め</th>
            <th>掃除機<br>(基本 月・金)</th>
            <th>おつかい</th>
            <th>+α</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <table class="print-subtotal">
        <colgroup>
          <col style="width:12%">
          <col style="width:16%">
          <col style="width:16%">
          <col style="width:16%">
          <col style="width:16%">
          <col style="width:13%">
          <col style="width:11%">
        </colgroup>
        <tr>
          <th>小計</th>
          <td><div class="print-two"><span>${s.bathMinutes}分</span><span>${yen(s.bathAmount)}</span></div></td>
          <td><div class="print-two"><span>${s.riceDays}日</span><span>${yen(s.riceAmount)}</span></div></td>
          <td><div class="print-two"><span>${s.trashCount}回</span><span>${yen(s.trashAmount)}</span></div></td>
          <td><div class="print-two"><span>${s.vacuumCount}回</span><span>${yen(s.vacuumAmount)}</span></div></td>
          <td><div class="print-two"><span></span><span>${yen(s.shoppingReward)}</span></div></td>
          <td><div class="print-two"><span>${s.extraMinutes}分</span><span>${yen(s.extraAmount)}</span></div></td>
        </tr>
      </table>

      <div class="print-total-row">
        <div></div>
        <div class="print-total-box"><span>合計</span><strong>${yen(s.totalAmount)}</strong></div>
        <div class="print-shopping-box"><span>おつかい使用</span><strong>${yen(s.shoppingTotal)}</strong></div>
        <div></div>
      </div>

      <table class="print-unit">
        <colgroup>
          <col style="width:12%">
          <col style="width:16%">
          <col style="width:16%">
          <col style="width:16%">
          <col style="width:16%">
          <col style="width:13%">
          <col style="width:11%">
        </colgroup>
        <tr>
          <th>単価</th>
          <td>15分 300円</td>
          <td>1日 300円</td>
          <td>1回 200円</td>
          <td>1回 1000円</td>
          <td>500円毎に50円<br>(切り上げ)</td>
          <td>15分 300円</td>
        </tr>
      </table>
    </div>
  `;
}

function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      data[key] = localStorage.getItem(key);
    }
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `家事記録データ_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || "{}"));
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(STORAGE_PREFIX) && typeof value === "string") {
          localStorage.setItem(key, value);
        }
      }

      loadRecords();
      renderAll();
      alert("データを読み込みました。");
    } catch {
      alert("データの読み込みに失敗しました。");
    }
  };

  reader.readAsText(file);
}

function isInsideTableScroll(target) {
  return Boolean(target && target.closest && target.closest(".table-scroll"));
}

function isInsideModal(target) {
  return Boolean(target && target.closest && target.closest(".modal-backdrop"));
}

function isInsideSummaryPanel(target) {
  return Boolean(target && target.closest && target.closest(".summary-panel"));
}

function tableScrollElement() {
  return document.querySelector(".table-scroll");
}

function isPeriodPinned() {
  const rect = el.periodTitle.getBoundingClientRect();
  return rect.top <= 1;
}

function syncTableScrollByDelta(delta) {
  const table = tableScrollElement();
  if (!table || !Number.isFinite(delta)) return;

  const next = table.scrollTop + delta;
  table.scrollTop = Math.max(0, Math.min(next, table.scrollHeight - table.clientHeight));
}

function shouldSyncTableFromOutside(delta) {
  const table = tableScrollElement();
  if (!table || !Number.isFinite(delta)) return false;

  const maxScrollTop = table.scrollHeight - table.clientHeight;
  if (maxScrollTop <= 0) return false;

  // 下方向への移動は、期間表示が画面上限に固定されてから表をスクロールする
  if (delta > 0) {
    return isPeriodPinned() && table.scrollTop < maxScrollTop;
  }

  // 上方向へ戻すときは、表が上端へ戻るまでは表側を優先して戻す
  if (delta < 0) {
    return table.scrollTop > 0;
  }

  return false;
}

function preventDoubleTapZoom() {
  document.addEventListener("touchend", (event) => {
    const now = Date.now();

    if (now - lastTouchEndTime <= 320) {
      event.preventDefault();
    }

    lastTouchEndTime = now;
  }, { passive: false });
}

function setupOutsideTableScrollSync() {
  document.addEventListener("touchstart", (event) => {
    if (
      isInsideModal(event.target) ||
      isInsideTableScroll(event.target) ||
      isInsideSummaryPanel(event.target)
    ) {
      outsideTableTouchY = null;
      return;
    }

    outsideTableTouchY = event.touches[0]?.clientY ?? null;
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    if (outsideTableTouchY === null) return;

    if (
      isInsideModal(event.target) ||
      isInsideTableScroll(event.target) ||
      isInsideSummaryPanel(event.target)
    ) {
      outsideTableTouchY = null;
      return;
    }

    const currentY = event.touches[0]?.clientY;
    if (typeof currentY !== "number") return;

    const delta = outsideTableTouchY - currentY;

    if (shouldSyncTableFromOutside(delta)) {
      syncTableScrollByDelta(delta);
      event.preventDefault();
    }

    outsideTableTouchY = currentY;
  }, { passive: false });

  document.addEventListener("touchend", () => {
    outsideTableTouchY = null;
  }, { passive: true });

  document.addEventListener("wheel", (event) => {
    if (
      isInsideModal(event.target) ||
      isInsideTableScroll(event.target) ||
      isInsideSummaryPanel(event.target)
    ) {
      return;
    }

    if (shouldSyncTableFromOutside(event.deltaY)) {
      syncTableScrollByDelta(event.deltaY);
      event.preventDefault();
    }
  }, { passive: false });
}


function drawCenteredText(ctx, text, x, y, width, height, options = {}) {
  const fontSize = options.fontSize || 20;
  const bold = options.bold ? "700 " : "";
  const color = options.color || "#000";
  const lineHeight = options.lineHeight || Math.round(fontSize * 1.25);
  const lines = String(text || "").split("\n");

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${bold}${fontSize}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const totalHeight = lineHeight * lines.length;
  const startY = y + height / 2 - totalHeight / 2 + lineHeight / 2;

  lines.forEach((line, index) => {
    ctx.fillText(line, x + width / 2, startY + index * lineHeight);
  });

  ctx.restore();
}

function drawRightText(ctx, text, x, y, width, height, options = {}) {
  const fontSize = options.fontSize || 20;
  const bold = options.bold ? "700 " : "";
  const color = options.color || "#000";
  const padding = options.padding || 10;

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${bold}${fontSize}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text || ""), x + width - padding, y + height / 2);
  ctx.restore();
}

function drawRect(ctx, x, y, w, h, options = {}) {
  ctx.save();

  if (options.fill) {
    ctx.fillStyle = options.fill;
    ctx.fillRect(x, y, w, h);
  }

  ctx.strokeStyle = options.stroke || "#000";
  ctx.lineWidth = options.lineWidth || 2;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawLine(ctx, x1, y1, x2, y2, options = {}) {
  ctx.save();
  ctx.strokeStyle = options.stroke || "#000";
  ctx.lineWidth = options.lineWidth || 2;

  if (options.dash) {
    ctx.setLineDash(options.dash);
  }

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawTableGrid(ctx, x, y, colWidths, rowHeights, options = {}) {
  const stroke = options.stroke || "#333";
  const lineWidth = options.lineWidth || 2;

  let currentX = x;
  const totalH = rowHeights.reduce((sum, value) => sum + value, 0);

  drawLine(ctx, x, y, x + colWidths.reduce((sum, value) => sum + value, 0), y, { stroke, lineWidth });

  for (const width of colWidths) {
    drawLine(ctx, currentX, y, currentX, y + totalH, { stroke, lineWidth });
    currentX += width;
  }

  drawLine(ctx, currentX, y, currentX, y + totalH, { stroke, lineWidth });

  let currentY = y;
  const totalW = colWidths.reduce((sum, value) => sum + value, 0);

  for (const height of rowHeights) {
    drawLine(ctx, x, currentY, x + totalW, currentY, { stroke, lineWidth });
    currentY += height;
  }

  drawLine(ctx, x, currentY, x + totalW, currentY, { stroke, lineWidth });
}

function textEncoderBytes(text) {
  return new TextEncoder().encode(text);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function createPdfFromJpeg(jpegBytes, imageWidth, imageHeight) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const parts = [];
  const offsets = [0];
  let offset = 0;

  const addText = (text) => {
    const bytes = textEncoderBytes(text);
    parts.push(bytes);
    offset += bytes.length;
  };

  const addBytes = (bytes) => {
    parts.push(bytes);
    offset += bytes.length;
  };

  const startObject = (number) => {
    offsets[number] = offset;
    addText(`${number} 0 obj\n`);
  };

  addText("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  startObject(1);
  addText("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObject(2);
  addText("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  startObject(3);
  addText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);

  startObject(4);
  addText(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  addBytes(jpegBytes);
  addText("\nendstream\nendobj\n");

  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = textEncoderBytes(content);

  startObject(5);
  addText(`<< /Length ${contentBytes.length} >>\nstream\n`);
  addBytes(contentBytes);
  addText("endstream\nendobj\n");

  const xrefOffset = offset;
  addText("xref\n0 6\n");
  addText("0000000000 65535 f \n");

  for (let i = 1; i <= 5; i++) {
    addText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }

  addText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob([concatBytes(parts)], { type: "application/pdf" });
}

function drawHouseworkPdfCanvas() {
  const canvas = document.createElement("canvas");
  const width = 1240;
  const height = 1754;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  const summary = calculateSummary();

  // ページ全体の余白を小さめにして、表を従来より大きく配置
  const pageMarginX = 58;
  const titleY = 74;
  const tableX = pageMarginX;
  const tableY = 135;
  const tableW = width - pageMarginX * 2;
  const headerH = 56;
  const rowH = state.records.length > 15 ? 56 : 59;
  const rowHeights = [headerH, ...state.records.map(() => rowH)];
  const mainColRatio = [7, 5, 16, 16, 16, 16, 13, 11];
  const ratioSum = mainColRatio.reduce((sum, value) => sum + value, 0);
  const colWidths = mainColRatio.map((value) => tableW * value / ratioSum);

  drawCenteredText(ctx, periodTitleText(), 0, titleY, width, 50, { fontSize: 36, bold: true });

  // メイン表ヘッダー
  const headerLabels = ["", "", "風呂掃除\n(基本平日)", "炊飯", "ゴミ集め", "掃除機\n(基本 月・金)", "おつかい", "+α"];
  let x = tableX;

  for (let i = 0; i < colWidths.length; i++) {
    drawRect(ctx, x, tableY, colWidths[i], headerH, { fill: "#c9eef6", stroke: "#000", lineWidth: 2 });
    drawCenteredText(ctx, headerLabels[i], x, tableY, colWidths[i], headerH, {
      fontSize: i === 2 || i === 5 ? 15 : 17,
      bold: true,
      lineHeight: 18
    });
    x += colWidths[i];
  }

  // メイン表グリッド
  drawTableGrid(ctx, tableX, tableY, colWidths, rowHeights, { stroke: "#000", lineWidth: 2 });

  // おつかい/+αの点線
  const shoppingX = tableX + colWidths.slice(0, 6).reduce((sum, value) => sum + value, 0);
  const extraX = shoppingX + colWidths[6];

  for (let i = 0; i < state.records.length; i++) {
    const y = tableY + headerH + i * rowH;
    drawLine(ctx, shoppingX, y + rowH / 2, shoppingX + colWidths[6], y + rowH / 2, {
      stroke: "#aaa",
      lineWidth: 1,
      dash: [5, 5]
    });
    drawLine(ctx, extraX, y + rowH / 2, extraX + colWidths[7], y + rowH / 2, {
      stroke: "#aaa",
      lineWidth: 1,
      dash: [5, 5]
    });
  }

  // メイン表データ
  for (let rIndex = 0; rIndex < state.records.length; rIndex++) {
    const record = state.records[rIndex];
    const y = tableY + headerH + rIndex * rowH;
    let cx = tableX;

    drawCenteredText(ctx, record.day, cx, y, colWidths[0], rowH, { fontSize: 18 });
    cx += colWidths[0];

    drawCenteredText(ctx, weekday(record.year, record.month, record.day), cx, y, colWidths[1], rowH, { fontSize: 19 });
    cx += colWidths[1];

    const hasBonus = bathBonusMinutesForRecord(record) > 0;
    const manualBath = minutesText(record.bathMinutes);

    if (hasBonus) {
      drawCenteredText(ctx, "☆", cx, y, colWidths[2] / 2, rowH, { fontSize: 23, bold: true });
      drawCenteredText(ctx, manualBath, cx + colWidths[2] / 2, y, colWidths[2] / 2, rowH, { fontSize: 18 });
    } else {
      drawCenteredText(ctx, manualBath, cx, y, colWidths[2], rowH, { fontSize: 18 });
    }

    cx += colWidths[2];

    drawCenteredText(ctx, circleText(record.riceCooked), cx, y, colWidths[3], rowH, { fontSize: 26 });
    cx += colWidths[3];

    drawCenteredText(ctx, circleText(record.trashCollected), cx, y, colWidths[4], rowH, { fontSize: 26 });
    cx += colWidths[4];

    drawCenteredText(ctx, circleText(record.vacuumed), cx, y, colWidths[5], rowH, { fontSize: 26 });
    cx += colWidths[5];

    drawCenteredText(ctx, record.shoppingMemo || "", cx + 4, y + 2, colWidths[6] - 8, rowH / 2 - 2, { fontSize: 13 });
    drawCenteredText(ctx, record.shoppingAmount ? yenMark(record.shoppingAmount) : "", cx + 4, y + rowH / 2, colWidths[6] - 8, rowH / 2, { fontSize: 14 });
    cx += colWidths[6];

    drawCenteredText(ctx, record.extraMemo || "", cx + 4, y + 2, colWidths[7] - 8, rowH / 2 - 2, { fontSize: 13 });
    drawCenteredText(ctx, minutesText(record.extraMinutes), cx + 4, y + rowH / 2, colWidths[7] - 8, rowH / 2, { fontSize: 14 });
  }

  const tableBottom = tableY + headerH + state.records.length * rowH;
  const subtotalY = tableBottom + 34;
  const subtotalH = 68;
  const subRatios = [12, 16, 16, 16, 16, 13, 11];
  const subRatioSum = subRatios.reduce((sum, value) => sum + value, 0);
  const subWidths = subRatios.map((value) => tableW * value / subRatioSum);
  const subTexts = [
    ["小計"],
    [`${summary.bathMinutes}分`, yen(summary.bathAmount)],
    [`${summary.riceDays}日`, yen(summary.riceAmount)],
    [`${summary.trashCount}回`, yen(summary.trashAmount)],
    [`${summary.vacuumCount}回`, yen(summary.vacuumAmount)],
    ["", yen(summary.shoppingReward)],
    [`${summary.extraMinutes}分`, yen(summary.extraAmount)]
  ];

  x = tableX;
  for (let i = 0; i < subWidths.length; i++) {
    drawRect(ctx, x, subtotalY, subWidths[i], subtotalH, {
      fill: i === 0 ? "#fffbd0" : "#fff",
      stroke: "#000",
      lineWidth: 2
    });

    if (i === 0) {
      drawCenteredText(ctx, subTexts[i][0], x, subtotalY, subWidths[i], subtotalH, { fontSize: 19, bold: true });
    } else {
      drawLine(ctx, x, subtotalY + subtotalH / 2, x + subWidths[i], subtotalY + subtotalH / 2, {
        stroke: "#aaa",
        lineWidth: 1,
        dash: [5, 5]
      });
      drawRightText(ctx, subTexts[i][0], x, subtotalY, subWidths[i], subtotalH / 2, { fontSize: 15, padding: 8 });
      drawRightText(ctx, subTexts[i][1], x, subtotalY + subtotalH / 2, subWidths[i], subtotalH / 2, { fontSize: 15, padding: 8 });
    }

    x += subWidths[i];
  }

  const totalY = subtotalY + subtotalH + 48;
  const totalW = 310;
  const totalH = 74;
  const shoppingBoxW = 170;
  const shoppingBoxH = 74;
  const gap = 62;
  const totalGroupW = totalW + gap + shoppingBoxW;
  const totalX = (width - totalGroupW) / 2;
  const shoppingBoxX = totalX + totalW + gap;

  drawRect(ctx, totalX, totalY, totalW, totalH, { stroke: "#000", lineWidth: 2 });
  drawRect(ctx, totalX, totalY, 120, totalH, { fill: "#ffe9ca", stroke: "#000", lineWidth: 2 });
  drawCenteredText(ctx, "合計", totalX, totalY, 120, totalH, { fontSize: 28, bold: true });
  drawRightText(ctx, yen(summary.totalAmount), totalX + 120, totalY, totalW - 120, totalH, { fontSize: 29, bold: true, padding: 16 });

  drawRect(ctx, shoppingBoxX, totalY, shoppingBoxW, shoppingBoxH, { stroke: "#000", lineWidth: 2 });
  drawLine(ctx, shoppingBoxX, totalY + shoppingBoxH / 2, shoppingBoxX + shoppingBoxW, totalY + shoppingBoxH / 2, {
    stroke: "#aaa",
    lineWidth: 1,
    dash: [5, 5]
  });
  drawCenteredText(ctx, "おつかい使用", shoppingBoxX, totalY, shoppingBoxW, shoppingBoxH / 2, { fontSize: 13, bold: true });
  drawRightText(ctx, yen(summary.shoppingTotal), shoppingBoxX, totalY + shoppingBoxH / 2, shoppingBoxW, shoppingBoxH / 2, { fontSize: 16, bold: true, padding: 10 });

  const unitY = totalY + totalH + 64;
  const unitH = 66;
  const unitTexts = ["単価", "15分 300円", "1日 300円", "1回 200円", "1回 1000円", "500円毎に50円\n(切り上げ)", "15分 300円"];

  x = tableX;
  for (let i = 0; i < subWidths.length; i++) {
    drawRect(ctx, x, unitY, subWidths[i], unitH, {
      fill: i === 0 ? "#dff5d8" : "#fff",
      stroke: "#000",
      lineWidth: 2
    });
    drawCenteredText(ctx, unitTexts[i], x, unitY, subWidths[i], unitH, {
      fontSize: i === 5 ? 14 : 16,
      bold: i === 0,
      lineHeight: 18
    });
    x += subWidths[i];
  }

  return canvas;
}

function downloadPdfDirectly() {
  saveRecords();

  const canvas = drawHouseworkPdfCanvas();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
  const jpegBytes = base64ToBytes(dataUrl.split(",")[1]);
  const pdfBlob = createPdfFromJpeg(jpegBytes, canvas.width, canvas.height);
  const url = URL.createObjectURL(pdfBlob);

  const a = document.createElement("a");
  const periodLabel = state.period === "first" ? "前半" : "後半";
  a.href = url;
  a.download = `家事記録表 ${state.year} ${state.month}月${periodLabel}.pdf`;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function setupEvents() {
  el.yearSelect.addEventListener("change", () => {
    state.year = Number(el.yearSelect.value);
    state.summaryShown = false;
    loadRecords();
    renderAll();
  });

  el.monthSelect.addEventListener("change", () => {
    state.month = Number(el.monthSelect.value);
    state.summaryShown = false;
    loadRecords();
    renderAll();
  });

  el.firstHalfButton.addEventListener("click", () => changePeriod("first"));
  el.secondHalfButton.addEventListener("click", () => changePeriod("second"));

  el.summaryButton.addEventListener("click", () => {
    saveRecords();
    if (state.summaryShown) {
      state.summaryExpanded = !state.summaryExpanded;
    } else {
      state.summaryShown = true;
      state.summaryExpanded = true;
    }

    renderSummary();
  });

  el.summaryHeader.addEventListener("click", () => {
    state.summaryExpanded = !state.summaryExpanded;
    renderSummary();
  });

  let touchStartY = null;
  el.summaryPanel.addEventListener("touchstart", (event) => {
    event.stopPropagation();
    touchStartY = event.touches[0].clientY;
  }, { passive: true });

  el.summaryPanel.addEventListener("touchmove", (event) => {
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });

  el.summaryPanel.addEventListener("touchend", (event) => {
    event.stopPropagation();

    if (touchStartY === null || event.changedTouches.length === 0) return;

    const diffY = event.changedTouches[0].clientY - touchStartY;
    if (diffY > 24) {
      state.summaryExpanded = false;
    } else if (diffY < -24) {
      state.summaryExpanded = true;
    }

    touchStartY = null;
    renderSummary();
  }, { passive: true });

  el.summaryPanel.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });

  el.modalDoneButton.addEventListener("click", closeEditor);
  el.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === el.modalBackdrop) {
      closeEditor();
    }
  });

  el.pdfButton.addEventListener("click", () => {
    downloadPdfDirectly();
  });

  if (el.exportDataButton) {
    el.exportDataButton.addEventListener("click", exportData);
  }

  if (el.importDataInput) {
    el.importDataInput.addEventListener("change", () => importData(el.importDataInput.files[0]));
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

preventDoubleTapZoom();
setupEvents();
loadRecords();
renderAll();
window.addEventListener("resize", () => requestAnimationFrame(updateTableBottomSpace));
window.addEventListener("orientationchange", () => setTimeout(updateTableBottomSpace, 300));
registerServiceWorker();
