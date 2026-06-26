const csvInput = document.querySelector("#csvInput");
const analysisIncome = document.querySelector("#analysisIncome");
const analysisExpense = document.querySelector("#analysisExpense");
const analysisMeg = document.querySelector("#analysisMeg");
const analysisNet = document.querySelector("#analysisNet");
const categoryTable = document.querySelector("#categoryTable");
const monthTable = document.querySelector("#monthTable");

csvInput.addEventListener("change", async () => {
  const file = csvInput.files?.[0];
  if (!file) return;

  const text = await file.text();
  const rows = parseCsv(text).slice(1).map(toEntry).filter(Boolean);
  renderAnalysis(rows);
});

function renderAnalysis(entries) {
  const income = sum(entries.filter((entry) => entry.type === "収入"));
  const expense = sum(entries.filter((entry) => entry.type === "支出"));
  const meg = sum(entries.filter((entry) => entry.type === "めぐさんへ(渡した)"));

  analysisIncome.textContent = yen(income);
  analysisExpense.textContent = yen(expense);
  analysisMeg.textContent = yen(meg);
  analysisNet.textContent = yen(income - expense - meg);

  renderTable(
    categoryTable,
    group(entries.filter((entry) => entry.type !== "収入"), "category"),
    "カテゴリ",
  );
  renderTable(monthTable, groupByMonth(entries), "月");
}

function renderTable(tbody, rows, emptyLabel) {
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="2">${emptyLabel}データなし</td></tr>`;
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(row.label)}</td><td>${yen(row.amount)}</td>`;
    tbody.append(tr);
  });
}

function group(entries, key) {
  const map = new Map();
  entries.forEach((entry) => {
    map.set(entry[key], (map.get(entry[key]) || 0) + entry.amount);
  });
  return Array.from(map, ([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
}

function groupByMonth(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const label = entry.date.slice(0, 7);
    const signed = entry.type === "収入" ? entry.amount : -entry.amount;
    map.set(label, (map.get(label) || 0) + signed);
  });
  return Array.from(map, ([label, amount]) => ({ label, amount })).sort((a, b) => b.label.localeCompare(a.label));
}

function toEntry(row) {
  if (row.length < 4) return null;
  return {
    date: row[0],
    type: row[1],
    category: row[2],
    amount: Number(row[3]) || 0,
    memo: row[4] || "",
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.replace(/^\ufeff/, ""));
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.replace(/^\ufeff/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.replace(/^\ufeff/, ""));
    rows.push(row);
  }

  return rows;
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}
