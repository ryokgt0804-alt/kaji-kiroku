"use strict";

// 家事記録 Web版 v4
// 修正内容：ダブルタップ拡大抑制、風呂掃除1.6秒長押しリセット、長押し後の誤入力防止、表外スクロール同期

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

function storageKey() {
  return `${STORAGE_PREFIX}-${state.year}-${state.month}-${state.period}`;
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

function calculateSummary() {
  const bathMinutes = state.records.reduce((sum, r) => sum + (Number(r.bathMinutes) || 0), 0);
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
  td.className = "editable";
  td.textContent = minutesText(record.bathMinutes);

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
      }, 1600);
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

function renderSummary() {
  if (!state.summaryShown) {
    el.summaryPanel.classList.add("hidden");
    el.summaryPanel.classList.remove("expanded", "collapsed");
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
      <td>${minutesText(r.bathMinutes)}</td>
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
    saveRecords();
    buildPrintArea();
    setTimeout(() => window.print(), 100);
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
registerServiceWorker();
