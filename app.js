"use strict";

const 保存キー接頭辞 = "kaji-kiroku-web-v1";
const 曜日一覧 = ["日", "月", "火", "水", "木", "金", "土"];
const 風呂掃除分一覧 = [15, 30, 45, 60, 75, 90, 105, 120];
const 追加分一覧 = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];

const 状態 = {
  年: new Date().getFullYear(),
  月: new Date().getMonth() + 1,
  期間: new Date().getDate() <= 15 ? "前半" : "後半",
  記録一覧: [],
  集計表示済み: false,
  集計展開中: true
};

const 要素 = {
  年選択: document.getElementById("yearSelect"),
  月選択: document.getElementById("monthSelect"),
  前半ボタン: document.getElementById("firstHalfButton"),
  後半ボタン: document.getElementById("secondHalfButton"),
  期間タイトル: document.getElementById("periodTitle"),
  表本体: document.getElementById("recordBody"),
  集計ボタン: document.getElementById("summaryButton"),
  PDFボタン: document.getElementById("pdfButton"),
  集計パネル: document.getElementById("summaryPanel"),
  集計ヘッダー: document.getElementById("summaryHeader"),
  集計内容: document.getElementById("summaryContent"),
  集計矢印: document.getElementById("summaryArrow"),
  閉じた集計表示: document.getElementById("collapsedSummary"),
  モーダル背景: document.getElementById("modalBackdrop"),
  モーダル題名: document.getElementById("modalTitle"),
  モーダル本文: document.getElementById("modalBody"),
  モーダル完了: document.getElementById("modalDoneButton"),
  印刷領域: document.getElementById("printArea"),
  データ書き出し: document.getElementById("exportDataButton"),
  データ読み込み: document.getElementById("importDataInput")
};

function カンマ(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function 円(value) {
  return `${カンマ(value)}円`;
}

function 円マーク(value) {
  return `¥${カンマ(value)}`;
}

function 保存キー() {
  return `${保存キー接頭辞}-${状態.年}-${状態.月}-${状態.期間}`;
}

function 月末日(年, 月) {
  return new Date(年, 月, 0).getDate();
}

function 表示日一覧() {
  if (状態.期間 === "前半") {
    return Array.from({ length: 15 }, (_, index) => index + 1);
  }

  const 最終日 = 月末日(状態.年, 状態.月);
  return Array.from({ length: 最終日 - 15 }, (_, index) => index + 16);
}

function 曜日(年, 月, 日) {
  return 曜日一覧[new Date(年, 月 - 1, 日).getDay()];
}

function 空記録(日) {
  return {
    年: 状態.年,
    月: 状態.月,
    日,
    風呂掃除分: null,
    炊飯: false,
    ゴミ集め: false,
    掃除機: false,
    おつかいメモ: "",
    おつかい金額: null,
    追加メモ: "",
    追加分: null
  };
}

function 読み込み() {
  const 日一覧 = 表示日一覧();
  let 保存済み = [];

  try {
    const raw = localStorage.getItem(保存キー());
    保存済み = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(保存済み)) {
      保存済み = [];
    }
  } catch {
    保存済み = [];
  }

  const 日別 = new Map(保存済み.map((記録) => [Number(記録.日), 記録]));
  状態.記録一覧 = 日一覧.map((日) => ({
    ...空記録(日),
    ...(日別.get(日) || {}),
    年: 状態.年,
    月: 状態.月,
    日
  }));
}

function 保存() {
  localStorage.setItem(保存キー(), JSON.stringify(状態.記録一覧));
}

function 集計() {
  const 風呂掃除分 = 状態.記録一覧.reduce((sum, r) => sum + (Number(r.風呂掃除分) || 0), 0);
  const 風呂掃除金額 = Math.floor(風呂掃除分 / 15) * 300;

  const 炊飯日 = 状態.記録一覧.filter((r) => r.炊飯).length;
  const 炊飯金額 = 炊飯日 * 300;

  const ゴミ集め回 = 状態.記録一覧.filter((r) => r.ゴミ集め).length;
  const ゴミ集め金額 = ゴミ集め回 * 200;

  const 掃除機回 = 状態.記録一覧.filter((r) => r.掃除機).length;
  const 掃除機金額 = 掃除機回 * 1000;

  const おつかい使用 = 状態.記録一覧.reduce((sum, r) => sum + (Number(r.おつかい金額) || 0), 0);
  const おつかい報酬 = 状態.記録一覧.reduce((sum, r) => {
    const 金額 = Number(r.おつかい金額) || 0;
    return 金額 > 0 ? sum + Math.ceil(金額 / 500) * 50 : sum;
  }, 0);

  const 追加分 = 状態.記録一覧.reduce((sum, r) => sum + (Number(r.追加分) || 0), 0);
  const 追加金額 = Math.floor(追加分 / 15) * 300;

  const 合計 = 風呂掃除金額 + 炊飯金額 + ゴミ集め金額 + 掃除機金額 + おつかい報酬 + 追加金額;

  return {
    風呂掃除分,
    風呂掃除金額,
    炊飯日,
    炊飯金額,
    ゴミ集め回,
    ゴミ集め金額,
    掃除機回,
    掃除機金額,
    おつかい使用,
    おつかい報酬,
    追加分,
    追加金額,
    合計
  };
}

function 期間タイトル() {
  const 日一覧 = 表示日一覧();
  return `${状態.年} ${状態.月}/${日一覧[0]} 〜 ${状態.月}/${日一覧[日一覧.length - 1]}`;
}

function 分表示(value) {
  return value ? `${value}分` : "";
}

function 丸表示(value) {
  return value ? "○" : "";
}

function 要素に文字(id, text) {
  document.getElementById(id).textContent = text;
}

function 選択肢描画() {
  要素.年選択.innerHTML = "";
  const 現在年 = new Date().getFullYear();

  for (let 年 = 現在年 - 2; 年 <= 現在年 + 10; 年++) {
    const option = document.createElement("option");
    option.value = String(年);
    option.textContent = `${年}年`;
    option.selected = 年 === 状態.年;
    要素.年選択.appendChild(option);
  }

  要素.月選択.innerHTML = "";
  for (let 月 = 1; 月 <= 12; 月++) {
    const option = document.createElement("option");
    option.value = String(月);
    option.textContent = `${月}月`;
    option.selected = 月 === 状態.月;
    要素.月選択.appendChild(option);
  }
}

function 期間ボタン描画() {
  要素.前半ボタン.classList.toggle("active", 状態.期間 === "前半");
  要素.後半ボタン.classList.toggle("active", 状態.期間 === "後半");
}

function 表描画() {
  要素.期間タイトル.textContent = 期間タイトル();
  要素.表本体.innerHTML = "";

  for (const 記録 of 状態.記録一覧) {
    const tr = document.createElement("tr");

    tr.appendChild(通常セル(String(記録.日)));
    tr.appendChild(通常セル(曜日(記録.年, 記録.月, 記録.日)));

    tr.appendChild(入力セル(分表示(記録.風呂掃除分), () => 編集画面を開く(記録.日, "風呂掃除")));
    tr.appendChild(入力セル(丸表示(記録.炊飯), () => {
      記録.炊飯 = !記録.炊飯;
      変更後処理();
    }, "circle"));

    tr.appendChild(入力セル(丸表示(記録.ゴミ集め), () => {
      記録.ゴミ集め = !記録.ゴミ集め;
      変更後処理();
    }, "circle"));

    tr.appendChild(入力セル(丸表示(記録.掃除機), () => {
      記録.掃除機 = !記録.掃除機;
      変更後処理();
    }, "circle"));

    tr.appendChild(二段セル(記録.おつかいメモ, 記録.おつかい金額 ? 円マーク(記録.おつかい金額) : "", () => 編集画面を開く(記録.日, "おつかい")));
    tr.appendChild(二段セル(記録.追加メモ, 分表示(記録.追加分), () => 編集画面を開く(記録.日, "追加")));

    要素.表本体.appendChild(tr);
  }
}

function 通常セル(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function 入力セル(text, action, className = "") {
  const td = document.createElement("td");
  td.className = `editable ${className}`.trim();
  td.textContent = text;
  td.addEventListener("click", action);
  return td;
}

function 二段セル(memo, bottom, action) {
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

function 集計描画() {
  if (!状態.集計表示済み) {
    要素.集計パネル.classList.add("hidden");
    return;
  }

  要素.集計パネル.classList.remove("hidden");
  const s = 集計();

  要素.集計内容.classList.toggle("hidden", !状態.集計展開中);
  要素.集計矢印.textContent = 状態.集計展開中 ? "⌃" : "⌄";

  要素.閉じた集計表示.textContent = 状態.集計展開中 ? "" : `おつかい使用 ${円マーク(s.おつかい使用)}　合計 ${円マーク(s.合計)}`;

  要素に文字("bathUnit", `${s.風呂掃除分}分`);
  要素に文字("bathAmount", 円マーク(s.風呂掃除金額));
  要素に文字("riceUnit", `${s.炊飯日}日`);
  要素に文字("riceAmount", 円マーク(s.炊飯金額));
  要素に文字("trashUnit", `${s.ゴミ集め回}回`);
  要素に文字("trashAmount", 円マーク(s.ゴミ集め金額));
  要素に文字("vacuumUnit", `${s.掃除機回}回`);
  要素に文字("vacuumAmount", 円マーク(s.掃除機金額));
  要素に文字("shoppingUse", `使用合計 ${円マーク(s.おつかい使用)}`);
  要素に文字("shoppingReward", `報酬 ${円マーク(s.おつかい報酬)}`);
  要素に文字("extraUnit", `${s.追加分}分`);
  要素に文字("extraAmount", 円マーク(s.追加金額));
  要素に文字("shoppingUseBottom", `おつかい使用 ${円(s.おつかい使用)}`);
  要素に文字("totalBottom", `合計 ${円(s.合計)}`);
}

function 全描画() {
  選択肢描画();
  期間ボタン描画();
  表描画();
  集計描画();
}

function 変更後処理() {
  保存();
  表描画();
  集計描画();
}

function 期間変更(期間) {
  状態.期間 = 期間;
  状態.集計表示済み = false;
  状態.集計展開中 = true;
  読み込み();
  全描画();
}

function 編集画面を開く(日, 種類) {
  const 記録 = 状態.記録一覧.find((r) => r.日 === 日);
  if (!記録) return;

  要素.モーダル本文.innerHTML = "";
  要素.モーダル題名.textContent = 種類 === "追加" ? "+α" : 種類;

  if (種類 === "風呂掃除") {
    要素.モーダル本文.appendChild(分選択("風呂掃除", 記録.風呂掃除分, 風呂掃除分一覧, (value) => {
      記録.風呂掃除分 = value;
      変更後処理();
    }));

    要素.モーダル本文.appendChild(戻すボタン("未入力に戻す", () => {
      記録.風呂掃除分 = null;
      変更後処理();
      編集画面を閉じる();
    }));
  }

  if (種類 === "おつかい") {
    要素.モーダル本文.appendChild(テキスト入力("メモ", 記録.おつかいメモ, (value) => {
      記録.おつかいメモ = value;
      変更後処理();
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
    input.value = 記録.おつかい金額 ? String(記録.おつかい金額) : "";
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "");
      記録.おつかい金額 = input.value ? Number(input.value) : null;
      変更後処理();
    });

    row.append(mark, input);
    label.appendChild(row);
    要素.モーダル本文.appendChild(label);
    要素.モーダル本文.appendChild(キーボードボタン());

    要素.モーダル本文.appendChild(戻すボタン("空欄に戻す", () => {
      記録.おつかいメモ = "";
      記録.おつかい金額 = null;
      変更後処理();
      編集画面を閉じる();
    }));
  }

  if (種類 === "追加") {
    要素.モーダル本文.appendChild(テキスト入力("メモ", 記録.追加メモ, (value) => {
      記録.追加メモ = value;
      変更後処理();
    }));

    要素.モーダル本文.appendChild(キーボードボタン());

    const selectBlock = 分選択("+α", 記録.追加分, 追加分一覧, (value) => {
      キーボードを閉じる();
      記録.追加分 = value;
      変更後処理();
    });

    const select = selectBlock.querySelector("select");
    select.addEventListener("pointerdown", キーボードを閉じる);
    select.addEventListener("focus", キーボードを閉じる);
    select.addEventListener("touchstart", キーボードを閉じる, { passive: true });

    要素.モーダル本文.appendChild(selectBlock);

    要素.モーダル本文.appendChild(戻すボタン("空欄に戻す", () => {
      記録.追加メモ = "";
      記録.追加分 = null;
      変更後処理();
      編集画面を閉じる();
    }));
  }

  要素.モーダル背景.classList.remove("hidden");
}

function テキスト入力(labelText, value, onInput) {
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

function 分選択(labelText, current, options, onChange) {
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

function キーボードボタン() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "keyboard-button";
  button.textContent = "キーボードを閉じる";
  button.addEventListener("click", キーボードを閉じる);
  return button;
}

function 戻すボタン(text, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "reset-button";
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}

function キーボードを閉じる() {
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
}

function 編集画面を閉じる() {
  キーボードを閉じる();
  要素.モーダル背景.classList.add("hidden");
}

function HTMLエスケープ(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function 印刷領域作成() {
  const s = 集計();

  const rows = 状態.記録一覧.map((r) => `
    <tr>
      <td>${r.日}</td>
      <td>${曜日(r.年, r.月, r.日)}</td>
      <td>${分表示(r.風呂掃除分)}</td>
      <td>${丸表示(r.炊飯)}</td>
      <td>${丸表示(r.ゴミ集め)}</td>
      <td>${丸表示(r.掃除機)}</td>
      <td><div class="print-two"><span>${HTMLエスケープ(r.おつかいメモ)}</span><span>${r.おつかい金額 ? 円マーク(r.おつかい金額) : ""}</span></div></td>
      <td><div class="print-two"><span>${HTMLエスケープ(r.追加メモ)}</span><span>${分表示(r.追加分)}</span></div></td>
    </tr>
  `).join("");

  要素.印刷領域.innerHTML = `
    <div class="print-page">
      <div class="print-title">${期間タイトル()}</div>

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
          <td><div class="print-two"><span>${s.風呂掃除分}分</span><span>${円(s.風呂掃除金額)}</span></div></td>
          <td><div class="print-two"><span>${s.炊飯日}日</span><span>${円(s.炊飯金額)}</span></div></td>
          <td><div class="print-two"><span>${s.ゴミ集め回}回</span><span>${円(s.ゴミ集め金額)}</span></div></td>
          <td><div class="print-two"><span>${s.掃除機回}回</span><span>${円(s.掃除機金額)}</span></div></td>
          <td><div class="print-two"><span></span><span>${円(s.おつかい報酬)}</span></div></td>
          <td><div class="print-two"><span>${s.追加分}分</span><span>${円(s.追加金額)}</span></div></td>
        </tr>
      </table>

      <div class="print-total-row">
        <div></div>
        <div class="print-total-box"><span>合計</span><strong>${円(s.合計)}</strong></div>
        <div class="print-shopping-box"><span>おつかい使用</span><strong>${円(s.おつかい使用)}</strong></div>
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

function データ書き出し() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(保存キー接頭辞)) {
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

function データ読み込み(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || "{}"));
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(保存キー接頭辞) && typeof value === "string") {
          localStorage.setItem(key, value);
        }
      }

      読み込み();
      全描画();
      alert("データを読み込みました。");
    } catch {
      alert("データの読み込みに失敗しました。");
    }
  };

  reader.readAsText(file);
}

function イベント設定() {
  要素.年選択.addEventListener("change", () => {
    状態.年 = Number(要素.年選択.value);
    状態.集計表示済み = false;
    読み込み();
    全描画();
  });

  要素.月選択.addEventListener("change", () => {
    状態.月 = Number(要素.月選択.value);
    状態.集計表示済み = false;
    読み込み();
    全描画();
  });

  要素.前半ボタン.addEventListener("click", () => 期間変更("前半"));
  要素.後半ボタン.addEventListener("click", () => 期間変更("後半"));

  要素.集計ボタン.addEventListener("click", () => {
    保存();
    if (状態.集計表示済み) {
      状態.集計展開中 = !状態.集計展開中;
    } else {
      状態.集計表示済み = true;
      状態.集計展開中 = true;
    }

    集計描画();
  });

  要素.集計ヘッダー.addEventListener("click", () => {
    状態.集計展開中 = !状態.集計展開中;
    集計描画();
  });

  let touchStartY = null;
  要素.集計パネル.addEventListener("touchstart", (event) => {
    touchStartY = event.touches[0].clientY;
  }, { passive: true });

  要素.集計パネル.addEventListener("touchend", (event) => {
    if (touchStartY === null || event.changedTouches.length === 0) return;

    const diffY = event.changedTouches[0].clientY - touchStartY;
    if (diffY > 24) {
      状態.集計展開中 = false;
    } else if (diffY < -24) {
      状態.集計展開中 = true;
    }

    touchStartY = null;
    集計描画();
  }, { passive: true });

  要素.モーダル完了.addEventListener("click", 編集画面を閉じる);
  要素.モーダル背景.addEventListener("click", (event) => {
    if (event.target === 要素.モーダル背景) {
      編集画面を閉じる();
    }
  });

  要素.PDFボタン.addEventListener("click", () => {
    保存();
    印刷領域作成();
    setTimeout(() => window.print(), 100);
  });

  要素.データ書き出し.addEventListener("click", データ書き出し);
  要素.データ読み込み.addEventListener("change", () => データ読み込み(要素.データ読み込み.files[0]));
}

function サービスワーカー登録() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

イベント設定();
読み込み();
全描画();
サービスワーカー登録();
