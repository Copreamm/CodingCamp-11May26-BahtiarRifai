// ─── Category Config ───────────────────────────────────────
const CATEGORY_CONFIG = {
  Food: { icon: "🍔", color: "#10b981" },
  Transport: { icon: "🚌", color: "#3b82f6" },
  Fun: { icon: "🎉", color: "#f59e0b" },
};
function getCatColor(cat) {
  return CATEGORY_CONFIG[cat]?.color ?? stringToColor(cat);
}
function getCatIcon(cat) {
  return CATEGORY_CONFIG[cat]?.icon ?? "🏷️";
}
// Deterministic color for custom categories
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h},60%,50%)`;
}

// ─── State ─────────────────────────────────────────────────
let transactions = [];
let isDark = false;
let pieChart = null;

// ─── DOM Refs ──────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const itemNameEl = $("itemName");
const amountEl = $("amount");
const categoryEl = $("category");
const customCatEl = $("customCategory");
const addBtn = $("addBtn");
const formError = $("formError");
const txList = $("txList");
const emptyState = $("emptyState");
const totalBalanceEl = $("totalBalance");
const txCountEl = $("txCount");
const spendSummaryEl = $("spendSummary");
const limitWarningEl = $("limitWarning");
const sortSelect = $("sortSelect");
const monthFilter = $("monthFilter");
const monthTotalEl = $("monthTotal");
const monthTopEl = $("monthTop");
const monthCountEl = $("monthCount");
const themeToggle = $("themeToggle");
const chartEmptyEl = $("chartEmpty");
const chartLegendEl = $("chartLegend");

// ─── LocalStorage ──────────────────────────────────────────
function saveData() {
  localStorage.setItem("ebv_transactions", JSON.stringify(transactions));
  localStorage.setItem("ebv_dark", isDark);
}
function loadData() {
  const tx = localStorage.getItem("ebv_transactions");
  if (tx) transactions = JSON.parse(tx);
  isDark = localStorage.getItem("ebv_dark") === "true";
}

// ─── Theme ─────────────────────────────────────────────────
function applyTheme() {
  document.documentElement.setAttribute(
    "data-theme",
    isDark ? "dark" : "light",
  );
  themeToggle.querySelector(".theme-icon").textContent = isDark ? "☀️" : "🌙";
  if (pieChart) {
    pieChart.options.plugins.legend.labels.color = isDark
      ? "#f1f3f9"
      : "#1a1d2e";
    pieChart.update();
  }
}
themeToggle.addEventListener("click", () => {
  isDark = !isDark;
  applyTheme();
  saveData();
});

// ─── Unique ID ─────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Add Transaction ───────────────────────────────────────
addBtn.addEventListener("click", () => {
  const name = itemNameEl.value.trim();
  const raw = parseFloat(amountEl.value);
  const custom = customCatEl.value.trim();
  const cat = custom || categoryEl.value;

  formError.classList.add("hidden");

  if (!name || isNaN(raw) || raw <= 0) {
    formError.classList.remove("hidden");
    itemNameEl.focus();
    return;
  }

  const tx = {
    id: uid(),
    name,
    amount: Math.round(raw * 100) / 100,
    category: cat,
    date: new Date().toISOString(),
  };

  transactions.unshift(tx);

  // Add custom cat to dropdown if new
  if (
    custom &&
    !Array.from(categoryEl.options).some((o) => o.value === custom)
  ) {
    const opt = document.createElement("option");
    opt.value = custom;
    opt.textContent = `🏷️ ${custom}`;
    categoryEl.appendChild(opt);
  }

  // Clear form
  itemNameEl.value = "";
  amountEl.value = "";
  customCatEl.value = "";

  saveData();
  render();
  bumpBalance();
});

// ─── Delete Transaction ────────────────────────────────────
function deleteTransaction(id) {
  transactions = transactions.filter((t) => t.id !== id);
  saveData();
  render();
  bumpBalance();
}

// ─── Sort ──────────────────────────────────────────────────
function getSorted(txArr) {
  const mode = sortSelect.value;
  const arr = [...txArr];
  switch (mode) {
    case "newest":
      return arr; // already newest-first from unshift
    case "oldest":
      return arr.slice().reverse();
    case "highest":
      return arr.sort((a, b) => b.amount - a.amount);
    case "lowest":
      return arr.sort((a, b) => a.amount - b.amount);
    case "category":
      return arr.sort((a, b) => a.category.localeCompare(b.category));
    default:
      return arr;
  }
}
sortSelect.addEventListener("change", render);

// ─── Monthly Filter ────────────────────────────────────────
function populateMonthFilter() {
  const existing = new Set(Array.from(monthFilter.options).map((o) => o.value));
  transactions.forEach((tx) => {
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const lbl = d.toLocaleString("default", { month: "long", year: "numeric" });
    if (!existing.has(key)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = lbl;
      monthFilter.appendChild(opt);
      existing.add(key);
    }
  });
}
function getFilteredByMonth() {
  const val = monthFilter.value;
  if (val === "all") return transactions;
  return transactions.filter((tx) => {
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return key === val;
  });
}
monthFilter.addEventListener("change", render);

// ─── Render All ────────────────────────────────────────────
function render() {
  populateMonthFilter();
  const filtered = getFilteredByMonth();
  renderBalance(filtered);
  renderList(filtered);
  renderChart(filtered);
  renderMonthlySummary(filtered);
}

// ─── Balance ───────────────────────────────────────────────
function renderBalance(txArr) {
  const total = txArr.reduce((s, t) => s + t.amount, 0);
  totalBalanceEl.textContent = formatCurrency(total);
  txCountEl.textContent = `${txArr.length} transaction${txArr.length !== 1 ? "s" : ""}`;
  spendSummaryEl.textContent = `${formatCurrency(total)} spent`;
}

function bumpBalance() {
  totalBalanceEl.classList.remove("bump");
  void totalBalanceEl.offsetWidth;
  totalBalanceEl.classList.add("bump");
}

// ─── Transaction List ──────────────────────────────────────
function renderList(txArr) {
  const total = txArr.reduce((s, t) => s + t.amount, 0);
  const sorted = getSorted(txArr);
  const isEmpty = sorted.length === 0;

  emptyState.style.display = isEmpty ? "block" : "none";

  // Remove old items (keep emptyState)
  Array.from(txList.children).forEach((c) => {
    if (c !== emptyState) c.remove();
  });

  sorted.forEach((tx) => {
    const item = document.createElement("div");
    item.innerHTML = `
      <div class="tx-icon" style="background:${getCatColor(tx.category)}22">
        ${getCatIcon(tx.category)}
      </div>
      <div class="tx-info">
        <div class="tx-name">${escHtml(tx.name)}</div>
        <div class="tx-amount">${formatCurrency(tx.amount)}</div>
        <span class="tx-cat-badge">${escHtml(tx.category)}</span>
      </div>
      <button class="btn-delete" data-id="${tx.id}">Delete</button>
    `;
    txList.appendChild(item);
  });

  // Event delegation for delete buttons
  txList.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteTransaction(btn.dataset.id));
  });
}

// ─── Chart ─────────────────────────────────────────────────
function renderChart(txArr) {
  const catMap = {};
  txArr.forEach((tx) => {
    catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
  });

  const labels = Object.keys(catMap);
  const data = labels.map((k) => catMap[k]);
  const colors = labels.map(getCatColor);

  const hasData = data.length > 0;
  chartEmptyEl.classList.toggle("hidden", hasData);

  if (!hasData) {
    if (pieChart) {
      pieChart.destroy();
      pieChart = null;
    }
    chartLegendEl.innerHTML = "";
    return;
  }

  const ctx = document.getElementById("pieChart").getContext("2d");
  if (pieChart) {
    pieChart.data.labels = labels;
    pieChart.data.datasets[0].data = data;
    pieChart.data.datasets[0].backgroundColor = colors;
    pieChart.update("active");
  } else {
    pieChart = new Chart(ctx, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: isDark ? "#1a1d2e" : "#ffffff",
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`,
            },
          },
        },
        animation: { animateRotate: true, duration: 500 },
      },
    });
  }

  // Custom legend
  chartLegendEl.innerHTML = labels
    .map(
      (lbl, i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${colors[i]}"></div>
      <span>${escHtml(lbl)}</span>
    </div>
  `,
    )
    .join("");
}

// ─── Monthly Summary ───────────────────────────────────────
function renderMonthlySummary(txArr) {
  const total = txArr.reduce((s, t) => s + t.amount, 0);
  monthTotalEl.textContent = formatCurrency(total);
  monthCountEl.textContent = txArr.length;

  if (txArr.length === 0) {
    monthTopEl.textContent = "—";
    return;
  }
  const catMap = {};
  txArr.forEach(
    (tx) => (catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount),
  );
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  monthTopEl.textContent = topCat
    ? `${getCatIcon(topCat[0])} ${topCat[0]}`
    : "—";
}

// ─── Utils ─────────────────────────────────────────────────
function formatCurrency(n) {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Init ──────────────────────────────────────────────────
loadData();
applyTheme();
render();
