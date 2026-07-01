const storageKey = "zubora-cashflow-v1";
const syncUrlKey = "zubora-cashflow-sync-url-v1";

const expenseCategories = ["固定費", "外食", "ドリンク", "コンビニ", "買い物", "ガソリン"];
const incomeCategories = ["給与", "特別収入"];
let selectedCategory = expenseCategories[0];
let entries = loadEntries();

const entryForm = document.querySelector("#entryForm");
const amountInput = document.querySelector("#amountInput");
const dateInput = document.querySelector("#dateInput");
const memoInput = document.querySelector("#memoInput");
const categoryChips = document.querySelector("#categoryChips");
const netAmount = document.querySelector("#netAmount");
const incomeAmount = document.querySelector("#incomeAmount");
const expenseAmount = document.querySelector("#expenseAmount");
const megAmount = document.querySelector("#megAmount");
const categoryBars = document.querySelector("#categoryBars");
const entryList = document.querySelector("#entryList");
const monthLabel = document.querySelector("#monthLabel");
const clearButton = document.querySelector("#clearButton");
const exportButton = document.querySelector("#exportButton");
const syncButton = document.querySelector("#syncButton");
const syncStatus = document.querySelector("#syncStatus");
const syncUrlInput = document.querySelector("#syncUrlInput");
const saveSyncUrlButton = document.querySelector("#saveSyncUrlButton");

dateInput.valueAsDate = new Date();
syncUrlInput.value = localStorage.getItem(syncUrlKey) || "";

renderChips();
render();
renderSyncStatus();

entryForm.addEventListener("change", (event) => {
  if (event.target.name !== "type") return;
  selectedCategory = categoriesForType(event.target.value)[0];
  renderChips();
});

entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(String(amountInput.value).replace(/[^\d]/g, ""));
  const type = new FormData(entryForm).get("type");

  if (!amount || amount < 1) {
    amountInput.focus();
    return;
  }

  entries.unshift({
    id: createId(),
    type,
    amount,
    category: selectedCategory,
    date: dateInput.value || toDateInputValue(new Date()),
    memo: memoInput.value.trim(),
    createdAt: new Date().toISOString(),
  });

  saveEntries();
  amountInput.value = "";
  memoInput.value = "";
  amountInput.focus();
  render();
  renderSyncStatus();
});

clearButton.addEventListener("click", () => {
  if (!entries.length) return;
  const ok = confirm("全部消します。CSVを書き出してからのほうが安心です。");
  if (!ok) return;
  entries = [];
  saveEntries();
  render();
  renderSyncStatus();
});

exportButton.addEventListener("click", () => {
  const rows = [
    ["date", "type", "category", "amount", "memo"],
    ...entries.map((entry) => [entry.date, typeLabel(entry.type), entry.category, entry.amount, entry.memo]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cashflow-${toDateInputValue(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

saveSyncUrlButton.addEventListener("click", () => {
  const url = syncUrlInput.value.trim();
  if (!url) {
    localStorage.removeItem(syncUrlKey);
  } else {
    localStorage.setItem(syncUrlKey, url);
  }
  renderSyncStatus();
});

syncButton.addEventListener("click", async () => {
  const url = localStorage.getItem(syncUrlKey);
  if (!url) {
    syncStatus.textContent = "同期先URLを設定してください";
    syncUrlInput.focus();
    return;
  }

  if (!entries.length) {
    syncStatus.textContent = "送る記録がありません";
    return;
  }

  syncButton.disabled = true;
  syncStatus.textContent = "同期中...";

  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
        source: "zubora-cashflow",
        sentAt: new Date().toISOString(),
        entries: entries.map((entry) => ({
          ...entry,
          typeLabel: typeLabel(entry.type),
        })),
      }),
    });

    const syncedAt = new Date().toISOString();
    entries = entries.map((entry) => ({ ...entry, syncedAt }));
    saveEntries();
    syncStatus.textContent = "同期しました";
  } catch {
    syncStatus.textContent = "同期できませんでした";
  } finally {
    syncButton.disabled = false;
    renderList();
  }
});

function renderChips() {
  categoryChips.innerHTML = "";
  const type = new FormData(entryForm).get("type");
  categoriesForType(type).forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${category === selectedCategory ? " active" : ""}`;
    button.textContent = category;
    button.addEventListener("click", () => {
      selectedCategory = category;
      renderChips();
    });
    categoryChips.append(button);
  });
}

function render() {
  const now = new Date();
  const monthKey = toDateInputValue(now).slice(0, 7);
  const monthEntries = entries.filter((entry) => entry.date.startsWith(monthKey));
  const income = sum(monthEntries.filter((entry) => entry.type === "income"));
  const expense = sum(monthEntries.filter((entry) => entry.type === "expense"));
  const meg = sum(monthEntries.filter((entry) => entry.type === "meg"));

  monthLabel.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  incomeAmount.textContent = yen(income);
  expenseAmount.textContent = yen(expense);
  megAmount.textContent = yen(meg);
  netAmount.textContent = yen(income - expense - meg);

  renderBars(monthEntries);
  renderList();
}

function renderBars(monthEntries) {
  const expenseEntries = monthEntries.filter((entry) => entry.type === "expense");
  const totals = expenseCategories
    .map((category) => ({
      category,
      amount: sum(expenseEntries.filter((entry) => entry.category === category)),
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  categoryBars.innerHTML = "";
  if (!totals.length) {
    categoryBars.innerHTML = '<p class="empty">まだ今月の出金はありません。</p>';
    return;
  }

  const max = totals[0].amount;
  totals.forEach((item) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${item.category}</span>
      <span class="bar-track"><span class="bar-fill" style="width: ${(item.amount / max) * 100}%"></span></span>
      <span class="bar-amount">${yen(item.amount)}</span>
    `;
    categoryBars.append(row);
  });
}

function categoriesForType(type) {
  return type === "income" ? incomeCategories : expenseCategories;
}

function renderList() {
  entryList.innerHTML = "";
  if (!entries.length) {
    entryList.innerHTML = '<li class="empty">最初の1件を入れるだけで始まります。</li>';
    return;
  }

  entries.slice(0, 20).forEach((entry) => {
    const item = document.createElement("li");
    item.className = "entry";
    item.innerHTML = `
      <div>
        <div class="entry-title">${entry.category}</div>
        <div class="entry-meta">${entry.date}${entry.memo ? ` / ${escapeHtml(entry.memo)}` : ""}${entry.syncedAt ? " / 同期済み" : ""}</div>
      </div>
      <div class="entry-amount ${entry.type}">
        ${entry.type === "income" ? "+" : "-"}${yen(entry.amount)}
      </div>
    `;
    entryList.append(item);
  });
}

function renderSyncStatus() {
  const url = localStorage.getItem(syncUrlKey);
  const unsynced = entries.filter((entry) => !entry.syncedAt).length;

  if (!url) {
    syncStatus.textContent = "未設定";
  } else if (!entries.length) {
    syncStatus.textContent = "同期先は設定済み";
  } else if (unsynced > 0) {
    syncStatus.textContent = `${unsynced}件が未同期`;
  } else {
    syncStatus.textContent = "すべて同期済み";
  }
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(storageKey, JSON.stringify(entries));
}

function sum(items) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function yen(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function typeLabel(type) {
  const labels = {
    income: "収入",
    expense: "支出",
    meg: "めぐさんへ(渡した)",
  };
  return labels[type] || type;
}

function toDateInputValue(date) {
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}
