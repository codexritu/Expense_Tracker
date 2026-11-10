const STORAGE_KEY = "smartExpenseTracker";

const EXPENSE_CATS = {
  Food: "#e8743b", Travel: "#2f5bea", Shopping: "#c2409c", Bills: "#7a5af8",
  Health: "#12a594", Entertainment: "#e5a50a", Education: "#0b7285", Other: "#8693a8"
};
const INCOME_CATS = ["Salary", "Pocket money", "Freelance", "Gift", "Other income"];

let state = load();
let filter = "all";

const $ = (id) => document.getElementById(id);
const money = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.transactions)) return data;
  } catch (e) {}
  return { transactions: [], budget: 0 };
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

/* ---------- Form ---------- */
function fillCategories() {
  const type = document.querySelector('input[name="type"]:checked').value;
  const cats = type === "expense" ? Object.keys(EXPENSE_CATS) : INCOME_CATS;
  $("category").innerHTML = "";
  cats.forEach((c) => {
    const o = document.createElement("option");
    o.value = o.textContent = c;
    $("category").appendChild(o);
  });
}

document.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener("change", fillCategories));

$("txForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("title").value.trim();
  const amount = parseFloat($("amount").value);
  const date = $("date").value;
  const type = document.querySelector('input[name="type"]:checked').value;
  const err = $("formError");

  if (!title) return (err.textContent = "Enter a description.");
  if (!(amount > 0)) return (err.textContent = "Enter an amount greater than 0.");
  if (!date) return (err.textContent = "Pick a date.");
  err.textContent = "";

  state.transactions.unshift({
    id: Date.now() + Math.random(),
    type, title, amount, date, category: $("category").value
  });
  save();
  $("title").value = "";
  $("amount").value = "";
  render();
});

$("budgetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.budget = Math.max(0, parseFloat($("budgetInput").value) || 0);
  save();
  render();
});

$("filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  filter = btn.dataset.filter;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
  renderList();
});

$("clearAll").addEventListener("click", () => {
  if (state.transactions.length && confirm("Delete all transactions? This cannot be undone.")) {
    state.transactions = [];
    save();
    render();
  }
});

/* ---------- Render ---------- */
function totals() {
  let income = 0, spent = 0;
  state.transactions.forEach((t) => (t.type === "income" ? (income += t.amount) : (spent += t.amount)));
  return { income, spent, balance: income - spent };
}

function renderSummary() {
  const { income, spent, balance } = totals();
  $("balance").textContent = money(balance);
  $("income").textContent = money(income);
  $("spent").textContent = money(spent);
  $("budgetInput").value = state.budget || "";

  // Budget uses expenses from the current month
  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const monthSpent = state.transactions
    .filter((t) => t.type === "expense" && t.date.startsWith(ym))
    .reduce((s, t) => s + t.amount, 0);

  const bar = $("bar"), fill = $("barFill"), msg = $("budgetMsg");
  bar.classList.remove("warn", "over");
  if (!state.budget) {
    fill.style.width = "0%";
    msg.textContent = "Set a monthly budget to track this month's spending.";
    return;
  }
  const pct = (monthSpent / state.budget) * 100;
  fill.style.width = Math.min(pct, 100) + "%";
  bar.setAttribute("aria-valuenow", Math.round(pct));
  if (pct >= 100) {
    bar.classList.add("over");
    msg.textContent = `Over budget by ${money(monthSpent - state.budget)} this month.`;
  } else {
    if (pct >= 80) bar.classList.add("warn");
    msg.textContent = `${money(monthSpent)} of ${money(state.budget)} spent this month. ${money(state.budget - monthSpent)} left.`;
  }
}

function renderList() {
  const list = $("list");
  list.innerHTML = "";
  const items = state.transactions
    .filter((t) => filter === "all" || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  $("empty").style.display = items.length ? "none" : "block";
  $("empty").textContent = state.transactions.length
    ? "Nothing matches this filter."
    : "No transactions yet. Add your first one on the left.";
  $("clearAll").style.display = state.transactions.length ? "inline-block" : "none";

  items.forEach((t) => {
    const li = document.createElement("li");
    li.className = "item";

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = t.type === "income" ? "#12805a" : EXPENSE_CATS[t.category] || "#8693a8";

    const info = document.createElement("div");
    info.className = "info";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = t.title;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${t.category} • ${new Date(t.date + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
    info.append(name, meta);

    const amt = document.createElement("span");
    amt.className = "amt " + t.type;
    amt.textContent = (t.type === "income" ? "+" : "-") + money(t.amount);

    const del = document.createElement("button");
    del.className = "del";
    del.setAttribute("aria-label", "Delete " + t.title);
    del.textContent = "×";
    del.addEventListener("click", () => {
      state.transactions = state.transactions.filter((x) => x.id !== t.id);
      save();
      render();
    });

    li.append(dot, info, amt, del);
    list.appendChild(li);
  });
}

function renderChart() {
  const canvas = $("chart");
  const dpr = window.devicePixelRatio || 1;
  const size = 240;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const byCat = {};
  state.transactions.filter((t) => t.type === "expense").forEach((t) => {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  $("chartEmpty").style.display = total ? "none" : "block";
  canvas.style.display = total ? "block" : "none";
  const legend = $("legend");
  legend.innerHTML = "";
  if (!total) return;

  const cx = size / 2, cy = size / 2, outer = 110, inner = 66;
  let start = -Math.PI / 2;
  entries.forEach(([cat, val]) => {
    const angle = (val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, start, start + angle);
    ctx.arc(cx, cy, inner, start + angle, start, true);
    ctx.closePath();
    ctx.fillStyle = EXPENSE_CATS[cat] || "#8693a8";
    ctx.fill();
    start += angle;

    const li = document.createElement("li");
    const sw = document.createElement("i");
    sw.style.background = EXPENSE_CATS[cat] || "#8693a8";
    const n = document.createElement("span");
    n.textContent = cat;
    const v = document.createElement("span");
    v.textContent = `${money(val)} (${Math.round((val / total) * 100)}%)`;
    li.append(sw, n, v);
    legend.appendChild(li);
  });

  ctx.fillStyle = "#16243b";
  ctx.textAlign = "center";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText(money(total), cx, cy + 4);
  ctx.fillStyle = "#5d6b82";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("spent", cx, cy + 24);
}

function render() {
  renderSummary();
  renderList();
  renderChart();
}

/* ---------- Init ---------- */
$("date").value = new Date().toISOString().slice(0, 10);
fillCategories();
render();