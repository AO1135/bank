// ==================== データ管理 ====================
const DEFAULT_SOURCES = ["PayPay", "銀行", "現金", "クレジットカード"];

function getSources() {
  const s = localStorage.getItem("kakeibo_sources");
  return s ? JSON.parse(s) : [...DEFAULT_SOURCES];
}

function saveSources(sources) {
  localStorage.setItem("kakeibo_sources", JSON.stringify(sources));
}

function getTransactions() {
  const t = localStorage.getItem("kakeibo_transactions");
  return t ? JSON.parse(t) : [];
}

function saveTransactions(txs) {
  localStorage.setItem("kakeibo_transactions", JSON.stringify(txs));
}

function formatMoney(n) {
  return Number(n).toLocaleString("ja-JP") + "円";
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr || "";
  return (d.getMonth() + 1) + "/" + d.getDate();
}

// ==================== 月管理 ====================
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

function getMonthKey() {
  return currentYear + "-" + String(currentMonth).padStart(2, "0");
}

function updateMonthLabel() {
  document.getElementById("current-month-label").textContent =
    currentYear + "年" + currentMonth + "月";
}

document.getElementById("prev-month").addEventListener("click", () => {
  currentMonth--;
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  updateMonthLabel();
  renderHome();
  renderHistory();
});

document.getElementById("next-month").addEventListener("click", () => {
  currentMonth++;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  updateMonthLabel();
  renderHome();
  renderHistory();
});

// ==================== ナビゲーション ====================
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("page-" + btn.dataset.page).classList.add("active");

    if (btn.dataset.page === "home") renderHome();
    if (btn.dataset.page === "history") renderHistory();
    if (btn.dataset.page === "settings") renderSettings();
    // ★ 累積残高ページの描画
    if (btn.dataset.page === "total-balance") renderTotalBalancePage();

    if (["expense", "income", "transfer"].includes(btn.dataset.page)) {
      populateSourceSelect();
    }
  });
});

// ==================== トースト ====================
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

// ==================== セレクト更新 ====================
function populateSourceSelect() {
  const sources = getSources();
  const expSel = document.getElementById("expense-source");
  const incSel = document.getElementById("income-destination");
  const tfFrom = document.getElementById("transfer-from");
  const tfTo   = document.getElementById("transfer-to");

  [expSel, incSel, tfFrom, tfTo].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = "";
    sources.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    });
  });
}

// ==================== ホーム画面 ====================
function renderHome() {
  const allTxs = getTransactions();
  const txs = allTxs.filter(tx => tx.monthKey === getMonthKey());

  // 合計の計算（振替は含めない）
  const totalIncome = txs
    .filter(t => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = txs
    .filter(t => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
  const balance = totalIncome - totalExpense;

  document.getElementById("total-income").textContent = "+" + formatMoney(totalIncome);
  document.getElementById("total-expense").textContent = "-" + formatMoney(totalExpense);
  const balEl = document.getElementById("total-balance");
  balEl.textContent = (balance >= 0 ? "+" : "") + formatMoney(balance);
  balEl.className = "card-amount" + (balance < 0 ? " negative" : "");

  // 出金元別内訳（出金のみ）
  const breakdown = {};
  txs
    .filter(t => t.type === "expense")
    .forEach(t => {
      breakdown[t.source] = (breakdown[t.source] || 0) + Number(t.amount);
    });

  const bdEl = document.getElementById("source-breakdown");
  bdEl.innerHTML = "";
  if (Object.keys(breakdown).length === 0) {
    bdEl.innerHTML = '<div class="empty-msg">出金記録がありません</div>';
  } else {
    Object.entries(breakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, amt]) => {
        bdEl.innerHTML += `
          <div class="breakdown-item">
            <span class="breakdown-name">${name}</span>
            <span class="breakdown-amount">-${formatMoney(amt)}</span>
          </div>`;
      });
  }

  // 口座・財布ごとの残高（今月分の 入金 − 出金 ± 振替）
  const sources = getSources();
  const balanceBySource = {};

  // 全口座を 0 で初期化
  sources.forEach(name => {
    balanceBySource[name] = 0;
  });

  txs.forEach(tx => {
    if (tx.type === "income") {
      const key = tx.source; // 入金先
      if (!(key in balanceBySource)) balanceBySource[key] = 0;
      balanceBySource[key] += Number(tx.amount);
    } else if (tx.type === "expense") {
      const key = tx.source; // 出金元
      if (!(key in balanceBySource)) balanceBySource[key] = 0;
      balanceBySource[key] -= Number(tx.amount);
    } else if (tx.type === "transfer") {
      const fromKey = tx.from;
      const toKey   = tx.to;
      if (!(fromKey in balanceBySource)) balanceBySource[fromKey] = 0;
      if (!(toKey   in balanceBySource)) balanceBySource[toKey]   = 0;
      balanceBySource[fromKey] -= Number(tx.amount);
      balanceBySource[toKey]   += Number(tx.amount);
    }
  });

  const sbEl = document.getElementById("source-balance-list");
  sbEl.innerHTML = "";
  const entries = Object.entries(balanceBySource);

  if (entries.length === 0) {
    sbEl.innerHTML = '<div class="empty-msg">残高を計算できるデータがありません</div>';
  } else {
    entries
      .sort((a, b) => a[0].localeCompare(b[0])) // 名前順
      .forEach(([name, amt]) => {
        const sign = amt > 0 ? "+" : amt < 0 ? "-" : "";
        const formatted = Math.abs(amt).toLocaleString("ja-JP") + "円";
        const color = amt < 0 ? "#b05050" : "#4a7c59";
        sbEl.innerHTML += `
          <div class="breakdown-item">
            <span class="breakdown-name">${name}</span>
            <span class="breakdown-amount" style="color:${color}">
              ${sign}${formatted}
            </span>
          </div>`;
      });
  }

  // 最近の取引（最新5件） — 入金/出金/振替すべて対象
  const recent = [...txs]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  const rtEl = document.getElementById("recent-transactions");
  rtEl.innerHTML = "";
  if (recent.length === 0) {
    rtEl.innerHTML = '<div class="empty-msg">取引記録がありません</div>';
  } else {
    recent.forEach(tx => {
      let label = "";
      let amountLabel = "";
      let amountClass = "";
      let placeText = "";
      let metaText = "";

      if (tx.type === "income") {
        label = "入金";
        amountLabel = "+" + formatMoney(tx.amount);
        amountClass = "income";
        placeText = tx.place || tx.source;
        metaText = "入金先: " + tx.source;
      } else if (tx.type === "expense") {
        label = "出金";
        amountLabel = "-" + formatMoney(tx.amount);
        amountClass = "expense";
        placeText = tx.place || tx.source;
        metaText = "出金元: " + tx.source;
      } else if (tx.type === "transfer") {
        label = "振替";
        amountLabel = formatMoney(tx.amount);
        amountClass = "";
        placeText = tx.from + " → " + tx.to;
        metaText = "振替";
      }

      if (tx.memo) metaText += " / " + tx.memo;

      rtEl.innerHTML += `
        <div class="transaction-item">
          <div class="transaction-left">
            <div class="t-place">${placeText}</div>
            <div class="t-meta">${label} / ${metaText}</div>
          </div>
          <div class="transaction-right">
            <div class="t-amount ${amountClass}">${amountLabel}</div>
            <div class="t-date">${formatDate(tx.date)}</div>
          </div>
        </div>`;
    });
  }
}

// ==================== 累積残高ページ ====================
// 口座・財布ごとの「全期間」の残高＋総合計を表示する
function renderTotalBalancePage() {
  const sources = getSources();
  const allTxs = getTransactions(); // 全期間

  const balanceBySource = {};

  // 全口座を 0 で初期化
  sources.forEach(name => {
    balanceBySource[name] = 0;
  });

  // 全期間の取引を反映
  allTxs.forEach(tx => {
    if (tx.type === "income") {
      const key = tx.source; // 入金先
      if (!(key in balanceBySource)) balanceBySource[key] = 0;
      balanceBySource[key] += Number(tx.amount);
    } else if (tx.type === "expense") {
      const key = tx.source; // 出金元
      if (!(key in balanceBySource)) balanceBySource[key] = 0;
      balanceBySource[key] -= Number(tx.amount);
    } else if (tx.type === "transfer") {
      const fromKey = tx.from;
      const toKey   = tx.to;
      if (!(fromKey in balanceBySource)) balanceBySource[fromKey] = 0;
      if (!(toKey   in balanceBySource)) balanceBySource[toKey]   = 0;
      balanceBySource[fromKey] -= Number(tx.amount);
      balanceBySource[toKey]   += Number(tx.amount);
    }
  });

  const el = document.getElementById("total-balance-list");
  el.innerHTML = "";

  const entries = Object.entries(balanceBySource);

  if (entries.length === 0) {
    el.innerHTML = '<div class="empty-msg">残高を計算できるデータがありません</div>';
    return;
  }

  // まず各口座の残高を表示
  entries
    .sort((a, b) => a[0].localeCompare(b[0])) // 名前順
    .forEach(([name, amt]) => {
      const sign = amt > 0 ? "+" : amt < 0 ? "-" : "";
      const formatted = Math.abs(amt).toLocaleString("ja-JP") + "円";
      const color = amt < 0 ? "#b05050" : "#4a7c59";

      el.innerHTML += `
        <div class="breakdown-item">
          <span class="breakdown-name">${name}</span>
          <span class="breakdown-amount" style="color:${color}">
            ${sign}${formatted}
          </span>
        </div>`;
    });

  // ★ すべての口座・財布の合計金額（総残高）を計算して一番下に表示
  const grandTotal = entries.reduce((sum, [, amt]) => sum + Number(amt), 0);
  const grandSign = grandTotal > 0 ? "+" : grandTotal < 0 ? "-" : "";
  const grandFormatted = Math.abs(grandTotal).toLocaleString("ja-JP") + "円";
  const grandColor = grandTotal < 0 ? "#b05050" : "#3a5a8a";

  el.innerHTML += `
    <div class="breakdown-item" style="margin-top:12px; border-top:1px solid #ebebeb; padding-top:14px;">
      <span class="breakdown-name" style="font-weight:700;">すべての合計</span>
      <span class="breakdown-amount" style="color:${grandColor}; font-weight:700;">
        ${grandSign}${grandFormatted}
      </span>
    </div>`;
}

// ==================== 日付の初期値 ====================
function todayStr() {
  const d = new Date();
  return (
    d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

document.getElementById("expense-date").value = todayStr();
document.getElementById("income-date").value = todayStr();
document.getElementById("transfer-date").value = todayStr();

// ==================== 出金保存 ====================
document.getElementById("save-expense").addEventListener("click", () => {
  const source = document.getElementById("expense-source").value;
  const amount = document.getElementById("expense-amount").value;
  const place = document.getElementById("expense-place").value.trim();
  const memo = document.getElementById("expense-memo").value.trim();
  const date = document.getElementById("expense-date").value;

  if (!source) { showToast("出金元を選択してください"); return; }
  if (!amount || Number(amount) <= 0) { showToast("金額を入力してください"); return; }
  if (!place) { showToast("使用場所を入力してください"); return; }
  if (!date) { showToast("日付を選択してください"); return; }

  const d = new Date(date);
  const monthKey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");

  const txs = getTransactions();
  txs.push({
    id: Date.now(),
    type: "expense",
    source,
    amount: Number(amount),
    place,
    memo,
    date,
    monthKey
  });
  saveTransactions(txs);

  document.getElementById("expense-amount").value = "";
  document.getElementById("expense-place").value = "";
  document.getElementById("expense-memo").value = "";
  document.getElementById("expense-date").value = todayStr();

  showToast("出金を記録しました！");
  renderHome();
});

// ==================== 入金保存 ====================
document.getElementById("save-income").addEventListener("click", () => {
  const destination = document.getElementById("income-destination").value; // どの口座に入ったか
  const amount = document.getElementById("income-amount").value;
  const source = document.getElementById("income-source").value.trim();   // 収入元（バイト名など）
  const memo = document.getElementById("income-memo").value.trim();
  const date = document.getElementById("income-date").value;

  if (!destination) { showToast("入金先を選択してください"); return; }
  if (!amount || Number(amount) <= 0) { showToast("金額を入力してください"); return; }
  if (!source) { showToast("入金元を入力してください"); return; }
  if (!date) { showToast("日付を選択してください"); return; }

  const d = new Date(date);
  const monthKey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");

  const txs = getTransactions();
  txs.push({
    id: Date.now(),
    type: "income",
    source: destination, // ← 残高の口座名として扱う
    place: source,       // ← 収入元の名前（表示用）
    amount: Number(amount),
    memo,
    date,
    monthKey
  });
  saveTransactions(txs);

  document.getElementById("income-amount").value = "";
  document.getElementById("income-source").value = "";
  document.getElementById("income-memo").value = "";
  document.getElementById("income-date").value = todayStr();

  showToast("入金を記録しました！");
  renderHome();
});

// ==================== 振替保存 ====================
document.getElementById("save-transfer").addEventListener("click", () => {
  const from = document.getElementById("transfer-from").value;
  const to   = document.getElementById("transfer-to").value;
  const amount = document.getElementById("transfer-amount").value;
  const memo = document.getElementById("transfer-memo").value.trim();
  const date = document.getElementById("transfer-date").value;

  if (!from) { showToast("移動元を選択してください"); return; }
  if (!to)   { showToast("移動先を選択してください"); return; }
  if (from === to) { showToast("移動元と移動先が同じです"); return; }
  if (!amount || Number(amount) <= 0) { showToast("金額を入力してください"); return; }
  if (!date) { showToast("日付を選択してください"); return; }

  const d = new Date(date);
  const monthKey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");

  const txs = getTransactions();
  txs.push({
    id: Date.now(),
    type: "transfer",
    from,
    to,
    amount: Number(amount),
    memo,
    date,
    monthKey
  });
  saveTransactions(txs);

  document.getElementById("transfer-amount").value = "";
  document.getElementById("transfer-memo").value = "";
  document.getElementById("transfer-date").value = todayStr();

  showToast("振替を記録しました！");
  renderHome();
});

// ==================== 履歴 ====================
let historyFilter = "all";

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    historyFilter = btn.dataset.filter;
    renderHistory();
  });
});

function renderHistory() {
  let txs = getTransactions().filter(tx => tx.monthKey === getMonthKey());
  if (historyFilter !== "all") txs = txs.filter(t => t.type === historyFilter);
  txs = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date));

  const el = document.getElementById("history-list");
  el.innerHTML = "";
  if (txs.length === 0) {
    el.innerHTML = '<div class="empty-msg">記録がありません</div>';
    return;
  }

  txs.forEach(tx => {
    const div = document.createElement("div");
    div.className = "history-item";
    let title = "";
    let meta = "";
    let amount = "";
    let amountClass = "";

    if (tx.type === "income") {
      title = tx.place || tx.source;
      meta = "入金先: " + tx.source + (tx.memo ? " / " + tx.memo : "");
      amount = "+" + formatMoney(tx.amount);
      amountClass = "income";
    } else if (tx.type === "expense") {
      title = tx.place || tx.source;
      meta = "出金元: " + tx.source + (tx.memo ? " / " + tx.memo : "");
      amount = "-" + formatMoney(tx.amount);
      amountClass = "expense";
    } else if (tx.type === "transfer") {
      title = tx.from + " → " + tx.to;
      meta = "振替" + (tx.memo ? " / " + tx.memo : "");
      amount = formatMoney(tx.amount);
      amountClass = "";
    }

    div.innerHTML = `
      <div class="history-left">
        <div class="h-place">${title}</div>
        <div class="h-meta">${meta}</div>
      </div>
      <div class="history-right">
        <div class="h-amount ${amountClass}">${amount}</div>
        <div class="h-date">${formatDate(tx.date)}</div>
      </div>
      <button class="btn-delete-tx" data-id="${tx.id}">✕</button>`;
    el.appendChild(div);
  });

  document.querySelectorAll(".btn-delete-tx").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!confirm("この記録を削除しますか？")) return;
      let txs = getTransactions();
      txs = txs.filter(t => t.id !== Number(btn.dataset.id));
      saveTransactions(txs);
      renderHistory();
      renderHome();
      showToast("削除しました");
    });
  });
}

// ==================== 設定 ====================
function renderSettings() {
  const sources = getSources();
  const el = document.getElementById("source-list");
  el.innerHTML = "";
  sources.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "source-item";
    div.innerHTML = `
      <span>${s}</span>
      <button class="btn-remove" data-index="${i}">✕</button>`;
    el.appendChild(div);
  });

  document.querySelectorAll(".btn-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const sources = getSources();
      sources.splice(Number(btn.dataset.index), 1);
      saveSources(sources);
      renderSettings();
      populateSourceSelect();
      showToast("削除しました");
    });
  });
}

document.getElementById("add-source").addEventListener("click", () => {
  const name = document.getElementById("new-source-name").value.trim();
  if (!name) { showToast("名前を入力してください"); return; }
  const sources = getSources();
  if (sources.includes(name)) { showToast("すでに登録されています"); return; }
  sources.push(name);
  saveSources(sources);
  document.getElementById("new-source-name").value = "";
  renderSettings();
  populateSourceSelect();
  showToast(name + " を追加しました！");
});

document.getElementById("clear-month-data").addEventListener("click", () => {
  if (!confirm(currentYear + "年" + currentMonth + "月のデータを削除しますか？")) return;
  let txs = getTransactions().filter(t => t.monthKey !== getMonthKey());
  saveTransactions(txs);
  renderHome();
  renderHistory();
  showToast("今月のデータを削除しました");
});

document.getElementById("clear-all-data").addEventListener("click", () => {
  if (!confirm("全データを削除しますか？この操作は取り消せません。")) return;
  localStorage.removeItem("kakeibo_transactions");
  localStorage.removeItem("kakeibo_sources");
  renderHome();
  renderHistory();
  renderSettings();
  populateSourceSelect();
  showToast("全データを削除しました");
});

// ==================== 初期化 ====================
updateMonthLabel();
populateSourceSelect();
renderHome();
