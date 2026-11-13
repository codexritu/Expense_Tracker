const STORAGE_KEY = "smartExpenseTracker";

const EXPENSE_CATS = {
  Food: "#e8603c", Travel: "#2a6fdb", Shopping: "#d6478f", Bills: "#7b4fd1",
  Health: "#1aa37a", Entertainment: "#e9a800", Education: "#0f8fa8", Other: "#7a8190"
};
const INCOME_CATS = ["Salary", "Pocket money", "Freelance", "Gift", "Other income"];
// One-tap shortcuts: change these to what you buy most often
const QUICK = [
  { t: "Chai", a: 20, c: "Food" }, { t: "Snacks", a: 50, c: "Food" },
  { t: "Auto", a: 60, c: "Travel" }, { t: "Notebook", a: 60, c: "Education" }
];

let state = load();
let filter = "all", catFilter = null, query = "", month = "all";
let editingId = null, hoverCat = null, slices = [], currentView = null;
const VIEWS = ["home", "dashboard", "transactions", "insights", "about"];

const $ = (id) => document.getElementById(id);
const money = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const monthLabel = (ym) => new Date(ym + "-01T00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const sum = (arr, type) => arr.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
const scoped = () => state.transactions.filter((t) => month === "all" || t.date.startsWith(month));
const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const curType = () => document.querySelector('input[name="type"]:checked').value;

function load() {
  const empty = { transactions: [], budget: 0, goal: { name: "", target: 0 } };
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (d && Array.isArray(d.transactions)) return { transactions: d.transactions, budget: d.budget || 0, goal: d.goal || empty.goal };
  } catch (e) {}
  return empty;
}
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }

/* ---------- Toast with Undo ---------- */
let toastTimer;
function hideToast() { $("toast").hidden = true; }
function toast(msg, undo) {
  $("toastMsg").textContent = msg;
  const b = $("toastUndo");
  b.hidden = !undo;
  b.onclick = () => { undo(); hideToast(); };
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

/* ---------- Form ---------- */
function fillCategories(selected) {
  const type = curType();
  $("titleWrap").hidden = type === "income";
  const cats = type === "expense" ? Object.keys(EXPENSE_CATS) : INCOME_CATS;
  $("category").innerHTML = "";
  cats.forEach((c) => $("category").add(new Option(c, c)));
  if (selected) $("category").value = selected;
}
document.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener("change", () => fillCategories()));

function stopEdit() {
  editingId = null;
  $("formTitle").textContent = "New entry";
  $("submitBtn").textContent = "Add entry";
  $("cancelEdit").hidden = true;
  $("title").value = "";
  $("amount").value = "";
  $("date").value = today();
  $("formError").textContent = "";
}
function startEdit(t) {
  editingId = t.id;
  $(t.type === "income" ? "tIncome" : "tExpense").checked = true;
  fillCategories(t.category);
  $("title").value = t.type === "expense" ? t.title : "";
  $("amount").value = t.amount;
  $("date").value = t.date;
  $("formTitle").textContent = "Edit entry";
  $("submitBtn").textContent = "Save changes";
  $("cancelEdit").hidden = false;
  if (currentView !== "dashboard") { location.hash = "dashboard"; route(); }
  $("txForm").scrollIntoView({ behavior: "smooth", block: "center" });
  $("amount").focus({ preventScroll: true });
}
$("cancelEdit").addEventListener("click", stopEdit);

$("txForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const type = curType();
  const title = type === "income" ? $("category").value : $("title").value.trim();
  const amount = parseFloat($("amount").value);
  const date = $("date").value;
  const err = $("formError");
  if (!title) return (err.textContent = "Enter a description.");
  if (!(amount > 0)) return (err.textContent = "Enter an amount greater than 0.");
  if (!date) return (err.textContent = "Pick a date.");
  err.textContent = "";
  const data = { type, title, amount, date, category: $("category").value };
  if (editingId) {
    const t = state.transactions.find((x) => x.id === editingId);
    if (t) Object.assign(t, data);
    stopEdit();
    toast("Entry updated");
  } else {
    state.transactions.unshift({ id: Date.now() + Math.random(), ...data });
    $("title").value = "";
    $("amount").value = "";
  }
  save();
  render();
});

function quickAdd(q) {
  const t = { id: Date.now() + Math.random(), type: "expense", title: q.t, amount: q.a, date: today(), category: q.c };
  state.transactions.unshift(t);
  save(); render();
  toast(`Added ${q.t} ${money(q.a)}`, () => {
    state.transactions = state.transactions.filter((x) => x.id !== t.id);
    save(); render();
  });
}
function removeTx(t) {
  const i = state.transactions.findIndex((x) => x.id === t.id);
  if (i < 0) return;
  state.transactions.splice(i, 1);
  if (editingId === t.id) stopEdit();
  save(); render();
  toast(`Deleted “${t.title}”`, () => { state.transactions.splice(i, 0, t); save(); render(); });
}

$("budgetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.budget = Math.max(0, parseFloat($("budgetInput").value) || 0);
  save(); render();
});
$("goalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.goal = { name: $("goalName").value.trim(), target: Math.max(0, parseFloat($("goalTarget").value) || 0) };
  save(); render();
});
$("monthSel").addEventListener("change", (e) => { month = e.target.value; render(); });
$("search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); renderList(); });
$("filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  if (btn.id === "catPill") { catFilter = null; renderChart(); return renderList(); }
  filter = btn.dataset.filter;
  document.querySelectorAll("#filters .chip[data-filter]").forEach((c) => c.classList.toggle("active", c === btn));
  renderList();
});
$("clearAll").addEventListener("click", () => {
  if (state.transactions.length && confirm("Delete all transactions? This cannot be undone.")) {
    state.transactions = [];
    catFilter = null;
    save(); render();
  }
});
$("exportCsv").addEventListener("click", () => {
  if (!state.transactions.length) return alert("No transactions to export yet.");
  const rows = [["Date", "Type", "Category", "Description", "Amount"]];
  state.transactions.forEach((t) =>
    rows.push([t.date, t.type, t.category, '"' + t.title.replace(/"/g, '""') + '"', t.amount])
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" }));
  link.download = "expenses.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});

/* ---------- Render ---------- */
function animateNum(el, to) {
  const from = el._v ?? 0;
  el._v = to;
  cancelAnimationFrame(el._r);
  if (from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = money(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min((now - t0) / 450, 1);
    el.textContent = money(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) el._r = requestAnimationFrame(step);
  };
  el._r = requestAnimationFrame(step);
}

function renderMonths() {
  const set = new Set(state.transactions.map((t) => t.date.slice(0, 7)));
  set.add(today().slice(0, 7));
  const opts = ["all", ...[...set].sort().reverse()];
  if (!opts.includes(month)) month = "all";
  const sel = $("monthSel");
  sel.innerHTML = "";
  opts.forEach((v) => sel.add(new Option(v === "all" ? "All time" : monthLabel(v), v)));
  sel.value = month;
}

function renderSummary() {
  const all = state.transactions, sc = scoped();
  animateNum($("balance"), sum(all, "income") - sum(all, "expense"));
  animateNum($("income"), sum(sc, "income"));
  animateNum($("spent"), sum(sc, "expense"));
  $("budgetInput").value = state.budget || "";

  const cur = today().slice(0, 7), bm = month === "all" ? cur : month;
  const when = bm === cur ? "this month" : "in " + monthLabel(bm);
  const ms = sum(all.filter((t) => t.date.startsWith(bm)), "expense");
  const bar = $("bar"), fill = $("barFill"), msg = $("budgetMsg");
  bar.classList.remove("warn", "over");
  if (!state.budget) {
    fill.style.width = "0%";
    msg.textContent = "Set a monthly budget to track this month's spending.";
    return;
  }
  const pct = (ms / state.budget) * 100;
  fill.style.width = Math.min(pct, 100) + "%";
  bar.setAttribute("aria-valuenow", Math.round(pct));
  if (pct >= 100) {
    bar.classList.add("over");
    msg.textContent = `Over budget by ${money(ms - state.budget)} ${when}.`;
  } else {
    if (pct >= 80) bar.classList.add("warn");
    msg.textContent = `${money(ms)} of ${money(state.budget)} spent ${when}. ${money(state.budget - ms)} left.`;
  }
}

function renderInsights() {
  const sc = scoped(), ex = sc.filter((t) => t.type === "expense");
  const inc = sum(sc, "income"), sp = sum(sc, "expense"), out = [];
  if (ex.length) {
    const by = {};
    ex.forEach((t) => (by[t.category] = (by[t.category] || 0) + t.amount));
    const [c, v] = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    out.push(`Most spent on ${c}: ${money(v)} (${Math.round((v / sp) * 100)}% of spending).`);
    const big = ex.reduce((a, b) => (b.amount > a.amount ? b : a));
    out.push(`Biggest expense: ${big.title}, ${money(big.amount)}.`);
  }
  if (inc > 0 && sp > 0) out.push(`You've spent ${Math.round((sp / inc) * 100)}% of your income${sp > inc ? ", which is more than you earned" : ""}.`);
  const cur = today().slice(0, 7);
  if (state.budget && (month === "all" || month === cur)) {
    const d = new Date(), day = d.getDate(), dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const ms = sum(state.transactions.filter((t) => t.date.startsWith(cur)), "expense");
    if (ms >= state.budget) out.push("You've already crossed this month's budget.");
    else if (ms > 0) {
      const avg = ms / day, proj = avg * dim;
      out.push(proj > state.budget
        ? `At this pace you'll cross your budget around day ${Math.ceil(state.budget / avg)}.`
        : `On track: about ${money(proj)} projected against your ${money(state.budget)} budget.`);
    }
  }
  const ul = $("insightList");
  ul.innerHTML = "";
  (out.length ? out.slice(0, 4) : ["Add a few entries and I'll point out patterns here."]).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    ul.appendChild(li);
  });
}

function renderGoal() {
  const g = state.goal, all = state.transactions;
  const saved = Math.max(0, sum(all, "income") - sum(all, "expense"));
  const pct = g.target > 0 ? Math.min((saved / g.target) * 100, 100) : 0;
  $("goalFill").style.width = pct + "%";
  $("goalBar").setAttribute("aria-valuenow", Math.round(pct));
  $("goalMsg").textContent = g.target > 0
    ? (saved >= g.target ? `Goal reached! ${g.name || "Your goal"} is fully funded.` : `${g.name || "Goal"}: ${money(saved)} of ${money(g.target)} (${Math.round(pct)}%). Your remaining balance counts towards it.`)
    : "Set a goal and your remaining balance counts towards it.";
}

function renderList() {
  const list = $("list");
  list.innerHTML = "";
  const items = scoped()
    .filter((t) => (filter === "all" || t.type === filter) && (!catFilter || t.category === catFilter) &&
      (!query || (t.title + " " + t.category).toLowerCase().includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date));

  $("catPill").hidden = !catFilter;
  if (catFilter) $("catPill").textContent = catFilter + " ×";
  $("empty").style.display = items.length ? "none" : "block";
  $("empty").textContent = state.transactions.length ? "Nothing matches these filters." : "No entries yet. Write your first one on the left.";
  $("clearAll").style.display = state.transactions.length ? "inline-block" : "none";

  items.forEach((t) => {
    const li = document.createElement("li");
    li.className = "item";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = t.type === "income" ? "#1a8a4a" : EXPENSE_CATS[t.category] || "#7a8190";
    const info = document.createElement("div");
    info.className = "info";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = t.title;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${t.title === t.category ? "" : t.category + " • "}${new Date(t.date + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
    info.append(name, meta);
    const amt = document.createElement("span");
    amt.className = "amt " + t.type;
    amt.textContent = (t.type === "income" ? "+" : "-") + money(t.amount);
    const edit = document.createElement("button");
    edit.className = "del edit";
    edit.setAttribute("aria-label", "Edit " + t.title);
    edit.textContent = "✎";
    edit.addEventListener("click", () => startEdit(t));
    const del = document.createElement("button");
    del.className = "del";
    del.setAttribute("aria-label", "Delete " + t.title);
    del.textContent = "×";
    del.addEventListener("click", () => removeTx(t));
    li.append(dot, info, amt, edit, del);
    list.appendChild(li);
  });
}

function toggleCat(cat) {
  catFilter = catFilter === cat ? null : cat;
  renderChart();
  renderList();
}

function renderChart(rebuildLegend = true) {
  const canvas = $("chart"), dpr = window.devicePixelRatio || 1, size = 240;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const byCat = {};
  scoped().filter((t) => t.type === "expense").forEach((t) => (byCat[t.category] = (byCat[t.category] || 0) + t.amount));
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  slices = [];
  $("chartEmpty").style.display = total ? "none" : "block";
  canvas.style.display = total ? "block" : "none";
  const legend = $("legend");
  if (rebuildLegend) legend.innerHTML = "";
  if (!total) return;

  const cx = size / 2, cy = size / 2, inner = 66;
  let start = -Math.PI / 2;
  entries.forEach(([cat, val]) => {
    const angle = (val / total) * Math.PI * 2;
    slices.push({ cat, val, start, end: start + angle });
    const outer = cat === hoverCat ? 116 : 110;
    ctx.globalAlpha = catFilter && catFilter !== cat ? 0.3 : 1;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, start, start + angle);
    ctx.arc(cx, cy, inner, start + angle, start, true);
    ctx.closePath();
    ctx.fillStyle = EXPENSE_CATS[cat] || "#7a8190";
    ctx.fill();
    start += angle;

    if (rebuildLegend) {
      const li = document.createElement("li");
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      li.setAttribute("aria-pressed", catFilter === cat);
      if (catFilter === cat) li.classList.add("on");
      const sw = document.createElement("i");
      sw.style.background = EXPENSE_CATS[cat] || "#7a8190";
      const n = document.createElement("span");
      n.textContent = cat;
      const v = document.createElement("span");
      v.textContent = `${money(val)} (${Math.round((val / total) * 100)}%)`;
      li.append(sw, n, v);
      li.addEventListener("click", () => toggleCat(cat));
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCat(cat); } });
      legend.appendChild(li);
    }
  });
  ctx.globalAlpha = 1;

  const h = slices.find((s) => s.cat === (hoverCat || catFilter));
  ctx.textAlign = "center";
  ctx.fillStyle = cssVar("--ink");
  if (h) {
    ctx.font = "600 14px Nunito, system-ui, sans-serif";
    ctx.fillText(h.cat, cx, cy - 6);
    ctx.font = "700 18px Nunito, system-ui, sans-serif";
    ctx.fillText(money(h.val), cx, cy + 16);
  } else {
    ctx.font = "600 20px Nunito, system-ui, sans-serif";
    ctx.fillText(money(total), cx, cy + 4);
    ctx.fillStyle = cssVar("--muted");
    ctx.font = "13px Nunito, system-ui, sans-serif";
    ctx.fillText("spent", cx, cy + 24);
  }
}

$("chart").addEventListener("mousemove", (e) => {
  const r = e.target.getBoundingClientRect();
  const x = e.clientX - r.left - 120, y = e.clientY - r.top - 120, d = Math.hypot(x, y);
  let c = null;
  if (d >= 66 && d <= 118) {
    let a = Math.atan2(y, x);
    if (a < -Math.PI / 2) a += Math.PI * 2;
    const s = slices.find((s) => a >= s.start && a < s.end);
    c = s ? s.cat : null;
  }
  if (c !== hoverCat) { hoverCat = c; e.target.style.cursor = c ? "pointer" : "default"; renderChart(false); }
});
$("chart").addEventListener("mouseleave", () => { if (hoverCat) { hoverCat = null; renderChart(false); } });
$("chart").addEventListener("click", () => { if (hoverCat) toggleCat(hoverCat); });

function renderRecent() {
  const ul = $("recentList");
  ul.innerHTML = "";
  const items = scoped().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  $("recentEmpty").hidden = items.length > 0;
  items.forEach((t) => {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = t.type === "income" ? "#1a8a4a" : EXPENSE_CATS[t.category] || "#7a8190";
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = t.title;
    const amt = document.createElement("span");
    amt.className = "amt " + t.type;
    amt.textContent = (t.type === "income" ? "+" : "-") + money(t.amount);
    li.append(dot, nm, amt);
    ul.appendChild(li);
  });
}

function renderOverview() {
  const by = {};
  state.transactions.forEach((t) => {
    const m = t.date.slice(0, 7);
    (by[m] = by[m] || { i: 0, s: 0 })[t.type === "income" ? "i" : "s"] += t.amount;
  });
  const body = $("ovBody");
  body.innerHTML = "";
  const months = Object.keys(by).sort().reverse();
  $("ovEmpty").hidden = months.length > 0;
  months.forEach((m) => {
    const r = by[m], saved = r.i - r.s, tr = document.createElement("tr");
    const c0 = document.createElement("td"), b = document.createElement("button");
    b.className = "linklike";
    b.textContent = monthLabel(m);
    b.addEventListener("click", () => { month = m; render(); location.hash = "transactions"; });
    c0.appendChild(b);
    const cells = [money(r.i), money(r.s), (saved < 0 ? "-" : "") + money(Math.abs(saved))].map((v, k) => {
      const td = document.createElement("td");
      td.textContent = v;
      if (k === 2) td.className = saved < 0 ? "neg" : "pos";
      return td;
    });
    tr.append(c0, ...cells);
    body.appendChild(tr);
  });
}

/* ---------- Page navigation (hash routing) ---------- */
function route() {
  let v = location.hash.slice(1);
  if (!VIEWS.includes(v)) v = "home";
  document.querySelectorAll(".view").forEach((sec) => (sec.hidden = sec.id !== "view-" + v));
  document.querySelectorAll(".nav a").forEach((a) => {
    const on = a.dataset.view === v;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $("monthbar").hidden = !["dashboard", "transactions", "insights"].includes(v);
  document.title = (v === "home" ? "" : v[0].toUpperCase() + v.slice(1) + " · ") + "Smart Expense Tracker";
  if (v !== currentView) { currentView = v; window.scrollTo(0, 0); }
  if (v === "dashboard") renderChart();
}
window.addEventListener("hashchange", route);

function render() {
  renderMonths();
  renderSummary();
  renderInsights();
  renderGoal();
  renderList();
  renderChart();
  renderRecent();
  renderOverview();
}

/* ---------- Night mode ---------- */
function showTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  $("themeBtn").textContent = dark ? "Day mode" : "Night mode";
  $("themeBtn").setAttribute("aria-pressed", dark);
}
$("themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("smartExpenseTheme", next); } catch (e) {}
  showTheme();
  renderChart();
});

/* ---------- Init ---------- */
QUICK.forEach((q) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = `${q.t} ${money(q.a)}`;
  b.addEventListener("click", () => quickAdd(q));
  $("quick").appendChild(b);
});
$("goalName").value = state.goal.name || "";
$("goalTarget").value = state.goal.target || "";
$("date").value = today();
fillCategories();
showTheme();
render();
route();