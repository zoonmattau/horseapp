const betsBody = document.querySelector("#betsTable tbody");
const betsTable = document.getElementById("betsTable");
const betsLoading = document.getElementById("betsLoading");
const analyticsPanel = document.getElementById("analyticsPanel");
const toggleAnalyticsBtn = document.getElementById("toggleAnalytics");
const rangeFilter = document.getElementById("rangeFilter");
const betsTrackFilter = document.getElementById("betsTrackFilter");
const betsBookFilter = document.getElementById("betsBookFilter");
const betsResultFilter = document.getElementById("betsResultFilter");
const betsMinEdgeFilter = document.getElementById("betsMinEdgeFilter");
const betsMinOddsFilter = document.getElementById("betsMinOddsFilter");
const betsMaxOddsFilter = document.getElementById("betsMaxOddsFilter");
const betsMinBackNumberFilter = document.getElementById("betsMinBackNumberFilter");
const betsMaxBackNumberFilter = document.getElementById("betsMaxBackNumberFilter");
const betsMinBarrierFilter = document.getElementById("betsMinBarrierFilter");
const betsMaxBarrierFilter = document.getElementById("betsMaxBarrierFilter");
const betsMinDistanceFilter = document.getElementById("betsMinDistanceFilter");
const betsMaxDistanceFilter = document.getElementById("betsMaxDistanceFilter");
const betsSearchFilter = document.getElementById("betsSearchFilter");
const clearBetsFiltersBtn = document.getElementById("clearBetsFilters");
const betsFilterSummary = document.getElementById("betsFilterSummary");
const betsFilterPills = document.getElementById("betsFilterPills");
const betsTotals = document.getElementById("betsTotals");
const metricsBody = document.querySelector("#metricsTable tbody");
const marketAnalyticsMeta = document.getElementById("marketAnalyticsMeta");
const marketKpiGrid = document.getElementById("marketKpiGrid");
const marketBookmakerGraph = document.getElementById("marketBookmakerGraph");
const marketTrackGraph = document.getElementById("marketTrackGraph");
const bookmakerGraph = document.getElementById("bookmakerGraph");
const trackGraph = document.getElementById("trackGraph");
const edgeGraph = document.getElementById("edgeGraph");
const recentGraph = document.getElementById("recentGraph");
const editBetModal = document.getElementById("editBetModal");
const editBetModalMeta = document.getElementById("editBetModalMeta");
const editBetOdds = document.getElementById("editBetOdds");
const editBetStake = document.getElementById("editBetStake");
const editBetSave = document.getElementById("editBetSave");
const editBetCancel = document.getElementById("editBetCancel");
const toastContainer = document.getElementById("toastContainer");
const analyticsTabs = document.getElementById("analyticsTabs");

let currentBets = [];
let currentFilteredBets = [];
let marketAnalytics = null;
let pendingEditBet = null;
const settlePendingBtn = document.getElementById("settlePending");
let betsFilterTimer = null;

function showToast(message, type = "info") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toast-out 300ms ease forwards";
    toast.addEventListener("animationend", () => toast.remove());
  }, 3000);
}

function applyThemeFromPreference() {
  const pref = (localStorage.getItem("horse_theme_pref") || "system").toLowerCase();
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (pref === "light" || pref === "dark") {
    document.documentElement.setAttribute("data-theme", pref);
  } else {
    document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
  }
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function saveFilter(page, field, value) {
  localStorage.setItem(`horse_filter_${page}_${field}`, value);
}

function loadFilter(page, field, fallback) {
  return localStorage.getItem(`horse_filter_${page}_${field}`) ?? fallback;
}

function formatOdds(decimalOdds) {
  const fmt = (localStorage.getItem("horse_odds_format") || "decimal").toLowerCase();
  if (fmt === "american") {
    if (decimalOdds >= 2.0) return `+${Math.round((decimalOdds - 1) * 100)}`;
    if (decimalOdds > 1.0) return `-${Math.round(100 / (decimalOdds - 1))}`;
    return "+0";
  }
  return `$${decimalOdds.toFixed(2)}`;
}

function edgeClass(value) {
  if (value > 0) return "edge-positive";
  if (value < 0) return "edge-negative";
  return "edge-neutral";
}

function debounceApplyFilters() {
  clearTimeout(betsFilterTimer);
  betsFilterTimer = setTimeout(() => applyFiltersAndRender(), 180);
}

/* --- Tab switching --- */
if (analyticsTabs) {
  analyticsTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    const tab = btn.dataset.tab;
    analyticsTabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll("#analyticsPanel .tab-content").forEach((tc) => {
      tc.classList.toggle("active", tc.id === `tab-${tab}`);
    });
  });
}

function renderBetsFilterMeta() {
  const pills = [];
  if ((rangeFilter?.value || "all") !== "all") pills.push(`Range: ${rangeFilter.value}`);
  if ((betsTrackFilter?.value || "all") !== "all") pills.push(`Track: ${betsTrackFilter.value}`);
  if ((betsBookFilter?.value || "all") !== "all") pills.push(`Book: ${betsBookFilter.value}`);
  if ((betsResultFilter?.value || "all") !== "all") pills.push(`Result: ${betsResultFilter.value}`);
  if (betsMinEdgeFilter?.value?.trim()) pills.push(`Edge >= ${betsMinEdgeFilter.value.trim()}%`);
  if (betsMinOddsFilter?.value?.trim()) pills.push(`Odds >= ${betsMinOddsFilter.value.trim()}`);
  if (betsMaxOddsFilter?.value?.trim()) pills.push(`Odds <= ${betsMaxOddsFilter.value.trim()}`);
  if (betsMinBackNumberFilter?.value?.trim()) pills.push(`Back >= ${betsMinBackNumberFilter.value.trim()}`);
  if (betsMaxBackNumberFilter?.value?.trim()) pills.push(`Back <= ${betsMaxBackNumberFilter.value.trim()}`);
  if (betsMinBarrierFilter?.value?.trim()) pills.push(`Barrier >= ${betsMinBarrierFilter.value.trim()}`);
  if (betsMaxBarrierFilter?.value?.trim()) pills.push(`Barrier <= ${betsMaxBarrierFilter.value.trim()}`);
  if (betsMinDistanceFilter?.value?.trim()) pills.push(`Distance >= ${betsMinDistanceFilter.value.trim()}m`);
  if (betsMaxDistanceFilter?.value?.trim()) pills.push(`Distance <= ${betsMaxDistanceFilter.value.trim()}m`);
  if (betsSearchFilter?.value?.trim()) pills.push(`Search: "${betsSearchFilter.value.trim()}"`);

  if (betsFilterSummary) {
    betsFilterSummary.textContent = pills.length ? `${pills.length} active filter${pills.length > 1 ? "s" : ""}` : "No active filters";
  }
  if (betsFilterPills) {
    betsFilterPills.innerHTML = pills.map((p) => `<span class="filter-pill">${p}</span>`).join("");
  }
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function profitLossForBet(bet) {
  const stake = impliedStake(bet);
  const odds = Number(bet.odds_at_tip || 0);
  if (bet.result === "won") return stake * (odds - 1);
  if (bet.result === "lost") return -stake;
  return 0;
}

function formatProfitLoss(value, withUnit = true) {
  const sign = value > 0 ? "+" : "";
  const suffix = withUnit ? "u" : "";
  return `${sign}${value.toFixed(2)}${suffix}`;
}

function filterBetsByRange(bets, range) {
  if (range === "all") return [...bets];
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - 6);
  const monthStart = new Date(todayStart);
  monthStart.setDate(todayStart.getDate() - 29);

  return bets.filter((b) => {
    const t = new Date(b.tracked_at);
    if (range === "today") return t >= todayStart && t < tomorrowStart;
    if (range === "yesterday") return t >= yesterdayStart && t < todayStart;
    if (range === "week") return t >= weekStart && t < tomorrowStart;
    if (range === "month") return t >= monthStart && t < tomorrowStart;
    return true;
  });
}

function filterBetsAdvanced(bets) {
  const track = (betsTrackFilter?.value || "all").toLowerCase();
  const book = (betsBookFilter?.value || "all").toLowerCase();
  const result = betsResultFilter?.value || "all";
  const minEdgeRaw = betsMinEdgeFilter?.value?.trim() || "";
  const minOddsRaw = betsMinOddsFilter?.value?.trim() || "";
  const maxOddsRaw = betsMaxOddsFilter?.value?.trim() || "";
  const minBackRaw = betsMinBackNumberFilter?.value?.trim() || "";
  const maxBackRaw = betsMaxBackNumberFilter?.value?.trim() || "";
  const minBarrierRaw = betsMinBarrierFilter?.value?.trim() || "";
  const maxBarrierRaw = betsMaxBarrierFilter?.value?.trim() || "";
  const minDistanceRaw = betsMinDistanceFilter?.value?.trim() || "";
  const maxDistanceRaw = betsMaxDistanceFilter?.value?.trim() || "";
  const q = (betsSearchFilter?.value || "").trim().toLowerCase();

  const minEdge = minEdgeRaw === "" ? null : Number(minEdgeRaw);
  const minOdds = minOddsRaw === "" ? null : Number(minOddsRaw);
  const maxOdds = maxOddsRaw === "" ? null : Number(maxOddsRaw);
  const minBack = minBackRaw === "" ? null : Number(minBackRaw);
  const maxBack = maxBackRaw === "" ? null : Number(maxBackRaw);
  const minBarrier = minBarrierRaw === "" ? null : Number(minBarrierRaw);
  const maxBarrier = maxBarrierRaw === "" ? null : Number(maxBarrierRaw);
  const minDistance = minDistanceRaw === "" ? null : Number(minDistanceRaw);
  const maxDistance = maxDistanceRaw === "" ? null : Number(maxDistanceRaw);

  return bets.filter((b) => {
    if (track !== "all" && String(b.track || "").toLowerCase() !== track) return false;
    if (book !== "all" && String(b.bookmaker || "").toLowerCase() !== book) return false;
    if (result === "settled" && (b.result !== "won" && b.result !== "lost")) return false;
    if (result !== "all" && result !== "settled" && b.result !== result) return false;
    const edge = Number(b.edge_pct || 0);
    const odds = Number(b.odds_at_tip || 0);
    const backNumber = Number(b.back_number || 0);
    const barrier = Number(b.barrier || 0);
    const distance = Number(b.distance_m || 0);
    if (minEdge !== null && edge < minEdge) return false;
    if (minOdds !== null && odds < minOdds) return false;
    if (maxOdds !== null && odds > maxOdds) return false;
    if (minBack !== null && backNumber < minBack) return false;
    if (maxBack !== null && backNumber > maxBack) return false;
    if (minBarrier !== null && barrier < minBarrier) return false;
    if (maxBarrier !== null && barrier > maxBarrier) return false;
    if (minDistance !== null && distance < minDistance) return false;
    if (maxDistance !== null && distance > maxDistance) return false;
    if (q) {
      const hay = `${b.horse_name || ""} ${b.track || ""} ${b.bookmaker || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function populateBetFilterSelects(bets) {
  if (!betsTrackFilter || !betsBookFilter) return;
  const uniqueTracks = Array.from(new Set(bets.map((b) => String(b.track || "").trim()).filter(Boolean))).sort();
  const uniqueBooks = Array.from(new Set(bets.map((b) => String(b.bookmaker || "").trim()).filter(Boolean))).sort();
  const selectedTrack = betsTrackFilter.value || "all";
  const selectedBook = betsBookFilter.value || "all";

  betsTrackFilter.innerHTML = '<option value="all">All Tracks</option>';
  uniqueTracks.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    betsTrackFilter.appendChild(opt);
  });

  betsBookFilter.innerHTML = '<option value="all">All Books</option>';
  uniqueBooks.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    betsBookFilter.appendChild(opt);
  });

  if ([...betsTrackFilter.options].some((o) => o.value === selectedTrack)) betsTrackFilter.value = selectedTrack;
  if ([...betsBookFilter.options].some((o) => o.value === selectedBook)) betsBookFilter.value = selectedBook;
}

function impliedStake(b) {
  const v = Number(b.stake);
  return v > 0 ? v : 1.0;
}

function settledBets(bets) {
  return bets.filter((b) => b.result === "won" || b.result === "lost");
}

function winPctFrom(settled) {
  if (!settled.length) return 0;
  const won = settled.filter((b) => b.result === "won").length;
  return (won / settled.length) * 100;
}

function aggregatePnl(bets) {
  let stake = 0;
  let returns = 0;
  for (const b of bets) {
    if (b.result !== "won" && b.result !== "lost") continue;
    const s = impliedStake(b);
    stake += s;
    if (b.result === "won") returns += s * Number(b.odds_at_tip || 0);
  }
  const profit = returns - stake;
  const roi = stake > 0 ? (profit / stake) * 100 : 0;
  return { stake, returns, profit, roi };
}

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function streaks(settled) {
  let bestWin = 0;
  let bestLoss = 0;
  let currWin = 0;
  let currLoss = 0;
  for (const b of settled) {
    if (b.result === "won") {
      currWin += 1;
      currLoss = 0;
    } else {
      currLoss += 1;
      currWin = 0;
    }
    bestWin = Math.max(bestWin, currWin);
    bestLoss = Math.max(bestLoss, currLoss);
  }
  return { bestWin, bestLoss };
}

function renderMetricsTable(bets) {
  const settled = settledBets(bets);
  const won = settled.filter((b) => b.result === "won").length;
  const lost = settled.filter((b) => b.result === "lost").length;
  const pending = bets.filter((b) => b.result === "pending").length;
  const pnl = aggregatePnl(bets);
  const strike = winPctFrom(settled);
  const avgEdge = avg(bets.map((b) => Number(b.edge_pct || 0)));
  const avgOdds = avg(bets.map((b) => Number(b.odds_at_tip || 0)));
  const topEdge = bets.length ? Math.max(...bets.map((b) => Number(b.edge_pct || 0))) : 0;
  const s = streaks(settled);
  const recent20 = bets.slice(0, 20);
  const recentPnl = aggregatePnl(recent20);
  const recentStrike = winPctFrom(settledBets(recent20));

  const rows = [
    ["Total Bets", bets.length],
    ["Settled", settled.length],
    ["Won", won],
    ["Lost", lost],
    ["Pending", pending],
    ["Strike Rate", `${strike.toFixed(1)}%`],
    ["Total Staked", `${pnl.stake.toFixed(2)}u`],
    ["Total Return", `${pnl.returns.toFixed(2)}u`],
    ["Profit", `${pnl.profit.toFixed(2)}u`, edgeClass(pnl.profit)],
    ["ROI", `${pnl.roi.toFixed(1)}%`, edgeClass(pnl.roi)],
    ["Average Edge", `${avgEdge.toFixed(2)}%`, edgeClass(avgEdge)],
    ["Average Odds", avgOdds.toFixed(2)],
    ["Top Edge", `${topEdge.toFixed(2)}%`],
    ["Best Win Streak", s.bestWin],
    ["Worst Loss Streak", s.bestLoss],
    ["Recent 20 Strike", `${recentStrike.toFixed(1)}%`],
    ["Recent 20 Profit", `${recentPnl.profit.toFixed(2)}u`, edgeClass(recentPnl.profit)],
  ];

  metricsBody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${row[0]}</strong></td>
      <td class="${row[2] || ""}">${row[1]}</td>
    `;
    metricsBody.appendChild(tr);
  }
}

function renderBarGraph(container, rows, valueLabel) {
  container.innerHTML = "";
  if (!rows.length) {
    container.textContent = "No data.";
    return;
  }
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "graph-row";
    const width = Math.max((Math.abs(row.value) / maxAbs) * 100, 2);
    const cls = row.value > 0 ? "graph-bar-positive" : row.value < 0 ? "graph-bar-negative" : "graph-bar-neutral";
    item.innerHTML = `
      <div class="graph-label">${row.label}</div>
      <div class="graph-track">
        <div class="graph-bar ${cls}" style="width:${width}%"></div>
      </div>
      <div class="graph-value ${edgeClass(row.value)}">${valueLabel(row.value, row)}</div>
    `;
    container.appendChild(item);
  }
}

function renderMarketAnalytics(payload) {
  marketAnalytics = payload || null;
  if (!marketAnalytics || !marketAnalytics.summary) {
    if (marketAnalyticsMeta) {
      marketAnalyticsMeta.textContent = marketAnalytics?.fallback_message || "No market analytics yet.";
    }
    if (marketKpiGrid) marketKpiGrid.innerHTML = "";
    renderBarGraph(marketBookmakerGraph, [], () => "");
    renderBarGraph(marketTrackGraph, [], () => "");
    return;
  }

  const s = marketAnalytics.summary;
  if (marketAnalyticsMeta) {
    const settledMsg = marketAnalytics.auto_settlement?.settled
      ? `Auto-settled ${marketAnalytics.auto_settlement.settled} pending bets.`
      : "Auto-settlement up to date.";
    marketAnalyticsMeta.textContent = `${settledMsg} Based on all settled bets.`;
  }

  if (marketKpiGrid) {
    const items = [
      ["ROI", `${Number(s.roi_pct || 0).toFixed(2)}%`, edgeClass(Number(s.roi_pct || 0))],
      ["Profit", `${Number(s.profit_units || 0).toFixed(2)}u`, edgeClass(Number(s.profit_units || 0))],
      ["Yield", `${Number(s.roi_pct || 0).toFixed(2)}%`, edgeClass(Number(s.roi_pct || 0))],
      ["Win Rate", `${Number(s.win_rate_pct || 0).toFixed(2)}%`, edgeClass(Number(s.win_rate_pct || 0) - 50)],
      ["CLV", `${Number(s.avg_clv_pct || 0).toFixed(2)}%`, edgeClass(Number(s.avg_clv_pct || 0))],
      ["Max Drawdown", `${Number(s.max_drawdown_units || 0).toFixed(2)}u`, "edge-negative"],
      ["Best Win Streak", `${s.best_win_streak || 0}`, "edge-positive"],
      ["Current Streak", `${s.current_streak || 0} ${s.current_streak_type || "none"}`, s.current_streak_type === "won" ? "edge-positive" : s.current_streak_type === "lost" ? "edge-negative" : "edge-neutral"],
    ];
    marketKpiGrid.innerHTML = items
      .map(([label, value, cls]) => `
        <article class="market-kpi">
          <span class="market-kpi-label">${label}</span>
          <strong class="market-kpi-value ${cls}">${value}</strong>
        </article>
      `)
      .join("");
  }

  const bookRows = (marketAnalytics.by_bookmaker || []).map((r) => ({
    label: r.bookmaker,
    value: Number(r.profit_units || 0),
    bets: Number(r.bets || 0),
  }));
  const trackRows = (marketAnalytics.by_track || []).map((r) => ({
    label: r.track,
    value: Number(r.profit_units || 0),
    bets: Number(r.bets || 0),
  }));
  renderBarGraph(marketBookmakerGraph, bookRows, (v, row) => `${v.toFixed(2)}u (${row.bets})`);
  renderBarGraph(marketTrackGraph, trackRows, (v, row) => `${v.toFixed(2)}u (${row.bets})`);
}

function renderOutcomeGraph(bets) {
  recentGraph.innerHTML = "";
  const recent = bets.slice(0, 30).reverse();
  if (!recent.length) {
    recentGraph.textContent = "No bets yet.";
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "spark-wrap";
  for (const b of recent) {
    const col = document.createElement("div");
    col.className = `spark-col ${b.result === "won" ? "spark-win" : b.result === "lost" ? "spark-loss" : "spark-pending"}`;
    col.title = `${b.track} R${b.race_number} ${b.horse_name} - ${b.result}`;
    wrap.appendChild(col);
  }
  recentGraph.appendChild(wrap);
}

function renderGraphs(bets) {
  const byBook = new Map();
  const byTrack = new Map();
  for (const b of bets) {
    if (!byBook.has(b.bookmaker)) byBook.set(b.bookmaker, []);
    if (!byTrack.has(b.track)) byTrack.set(b.track, []);
    byBook.get(b.bookmaker).push(b);
    byTrack.get(b.track).push(b);
  }

  const bookRows = Array.from(byBook.entries()).map(([label, arr]) => ({
    label,
    value: aggregatePnl(arr).profit,
    bets: arr.length,
  })).sort((a, b) => b.value - a.value);

  const trackRows = Array.from(byTrack.entries()).map(([label, arr]) => ({
    label,
    value: aggregatePnl(arr).profit,
    bets: arr.length,
  })).sort((a, b) => b.value - a.value);

  const edgeBuckets = [
    { label: "< -5%", value: 0 },
    { label: "-5% to 0%", value: 0 },
    { label: "0% to 5%", value: 0 },
    { label: "5% to 10%", value: 0 },
    { label: "> 10%", value: 0 },
  ];
  for (const b of bets) {
    const e = Number(b.edge_pct || 0);
    if (e < -5) edgeBuckets[0].value += 1;
    else if (e < 0) edgeBuckets[1].value += 1;
    else if (e < 5) edgeBuckets[2].value += 1;
    else if (e < 10) edgeBuckets[3].value += 1;
    else edgeBuckets[4].value += 1;
  }

  renderBarGraph(bookmakerGraph, bookRows, (v, row) => `${v.toFixed(2)}u (${row.bets})`);
  renderBarGraph(trackGraph, trackRows, (v, row) => `${v.toFixed(2)}u (${row.bets})`);
  renderBarGraph(edgeGraph, edgeBuckets, (v) => `${Math.round(v)} bets`);
  renderOutcomeGraph(bets);
}

async function setResult(betId, result) {
  await jsonFetch(`/api/user/bets/${betId}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result }),
  });
  showToast(`Bet marked as ${result}`, "success");
  await loadBets();
}

async function updateBetDetails(betId, oddsAtTip, stake) {
  await jsonFetch(`/api/tips/tracked/${betId}/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ odds_at_tip: oddsAtTip, stake }),
  });
  showToast("Bet updated", "success");
  await loadBets();
}

async function deleteBet(betId) {
  await jsonFetch(`/api/tips/tracked/${betId}`, { method: "DELETE" });
  showToast("Bet deleted", "success");
  await loadBets();
}

function openEditModal(bet) {
  pendingEditBet = bet;
  if (editBetModalMeta) {
    editBetModalMeta.textContent = `${bet.track} R${bet.race_number} - ${bet.horse_name}`;
  }
  if (editBetOdds) editBetOdds.value = Number(bet.odds_at_tip || 0).toFixed(2);
  if (editBetStake) editBetStake.value = Number(bet.stake || 0).toFixed(2);
  editBetModal?.classList.remove("hidden");
}

function closeEditModal() {
  editBetModal?.classList.add("hidden");
  pendingEditBet = null;
}

async function saveEditModal() {
  if (!pendingEditBet) return;
  const odds = Number(editBetOdds?.value || "0");
  const stake = Number(editBetStake?.value || "0");
  if (odds <= 1) {
    showToast("Odds must be greater than 1.0", "error");
    return;
  }
  if (stake < 0) {
    showToast("Stake must be non-negative", "error");
    return;
  }
  await updateBetDetails(pendingEditBet.id, odds, stake);
  closeEditModal();
}

function renderTotals(bets) {
  if (!betsTotals) return;
  const settled = settledBets(bets);
  const totalPnl = settled.reduce((acc, b) => acc + profitLossForBet(b), 0);
  const won = settled.filter((b) => b.result === "won").length;
  const lost = settled.filter((b) => b.result === "lost").length;
  betsTotals.innerHTML = `
    <div>Filtered bets: <strong>${bets.length}</strong></div>
    <div>Settled: <strong>${settled.length}</strong> (W ${won} / L ${lost})</div>
    <div>Total P/L: <strong class="${edgeClass(totalPnl)}">${formatProfitLoss(totalPnl)}</strong></div>
  `;
}

function renderLog(bets) {
  betsBody.innerHTML = "";
  for (const b of bets) {
    const stake = impliedStake(b);
    const pl = profitLossForBet(b);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(b.tracked_at).toLocaleString()}</td>
      <td>${b.track}</td>
      <td>R${b.race_number}</td>
      <td>${b.horse_name}</td>
      <td>${b.bookmaker}</td>
      <td>${formatOdds(Number(b.odds_at_tip))}</td>
      <td>${stake.toFixed(2)}u</td>
      <td class="${edgeClass(Number(b.edge_pct))}">${Number(b.edge_pct).toFixed(2)}%</td>
      <td class="${b.result === "pending" ? "edge-neutral" : edgeClass(pl)}">${b.result === "pending" ? "-" : formatProfitLoss(pl)}</td>
      <td>
        <select data-result="1">
          <option value="pending" ${b.result === "pending" ? "selected" : ""}>pending</option>
          <option value="won" ${b.result === "won" ? "selected" : ""}>won</option>
          <option value="lost" ${b.result === "lost" ? "selected" : ""}>lost</option>
        </select>
      </td>
      <td class="bets-actions-cell">
        <button data-edit="1">Edit</button>
        <button data-delete="1">Delete</button>
      </td>
    `;
    tr.querySelector("select[data-result='1']").addEventListener("change", async (e) => {
      await setResult(b.id, e.target.value);
    });
    tr.querySelector("button[data-edit='1']").addEventListener("click", () => {
      openEditModal(b);
    });
    tr.querySelector("button[data-delete='1']").addEventListener("click", async () => {
      const ok = confirm(`Delete bet for ${b.horse_name}?`);
      if (!ok) return;
      await deleteBet(b.id);
    });
    betsBody.appendChild(tr);
  }
  if (!bets.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="11" class="edge-neutral">No bets for selected range.</td>`;
    betsBody.appendChild(tr);
  }
}

function applyFiltersAndRender() {
  const range = rangeFilter?.value || "all";
  const rangeFiltered = filterBetsByRange(currentBets, range);
  currentFilteredBets = filterBetsAdvanced(rangeFiltered);
  renderBetsFilterMeta();
  renderTotals(currentFilteredBets);
  renderLog(currentFilteredBets);
  renderMetricsTable(currentFilteredBets);
  renderGraphs(currentFilteredBets);
}

async function loadBets() {
  if (betsLoading) betsLoading.hidden = false;
  const betsData = await jsonFetch("/api/user/bets");
  let analyticsData = null;
  try {
    analyticsData = await jsonFetch("/api/user/bets/analytics");
  } catch (_err) {
    analyticsData = {
      summary: null,
      by_track: [],
      by_bookmaker: [],
      auto_settlement: { settled: 0 },
      fallback_message: "Market analytics endpoint unavailable on current server.",
    };
  }
  currentBets = betsData.bets || [];
  if (betsLoading) betsLoading.hidden = true;
  renderMarketAnalytics(analyticsData);
  populateBetFilterSelects(currentBets);
  restoreBetsFilters();
  // Restore track/book after selects are populated
  const savedTrack = loadFilter("bets", "track", "all");
  const savedBook = loadFilter("bets", "book", "all");
  if (betsTrackFilter && [...betsTrackFilter.options].some((o) => o.value === savedTrack)) betsTrackFilter.value = savedTrack;
  if (betsBookFilter && [...betsBookFilter.options].some((o) => o.value === savedBook)) betsBookFilter.value = savedBook;
  applyFiltersAndRender();
}

function clearBetsFilters() {
  if (rangeFilter) rangeFilter.value = "all";
  if (betsTrackFilter) betsTrackFilter.value = "all";
  if (betsBookFilter) betsBookFilter.value = "all";
  if (betsResultFilter) betsResultFilter.value = "all";
  if (betsMinEdgeFilter) betsMinEdgeFilter.value = "";
  if (betsMinOddsFilter) betsMinOddsFilter.value = "";
  if (betsMaxOddsFilter) betsMaxOddsFilter.value = "";
  if (betsMinBackNumberFilter) betsMinBackNumberFilter.value = "";
  if (betsMaxBackNumberFilter) betsMaxBackNumberFilter.value = "";
  if (betsMinBarrierFilter) betsMinBarrierFilter.value = "";
  if (betsMaxBarrierFilter) betsMaxBarrierFilter.value = "";
  if (betsMinDistanceFilter) betsMinDistanceFilter.value = "";
  if (betsMaxDistanceFilter) betsMaxDistanceFilter.value = "";
  if (betsSearchFilter) betsSearchFilter.value = "";
  saveBetsFilters();
  applyFiltersAndRender();
}

settlePendingBtn?.addEventListener("click", async () => {
  try {
    const data = await jsonFetch("/api/user/bets/settle-pending", { method: "POST" });
    const s = data.settlement || {};
    showToast(`Settled ${s.settled || 0} bets: ${s.won || 0} won, ${s.lost || 0} lost`, "success");
    await loadBets();
  } catch (err) {
    console.error(err);
    showToast(`Settlement failed: ${err.message}`, "error");
  }
});

toggleAnalyticsBtn.addEventListener("click", () => {
  const hidden = analyticsPanel.hasAttribute("hidden");
  if (hidden) {
    analyticsPanel.removeAttribute("hidden");
    toggleAnalyticsBtn.textContent = "Hide Analytics";
  } else {
    analyticsPanel.setAttribute("hidden", "");
    toggleAnalyticsBtn.textContent = "Show Analytics";
  }
});

function saveBetsFilters() {
  saveFilter("bets", "range", rangeFilter?.value || "all");
  saveFilter("bets", "track", betsTrackFilter?.value || "all");
  saveFilter("bets", "book", betsBookFilter?.value || "all");
  saveFilter("bets", "result", betsResultFilter?.value || "all");
  saveFilter("bets", "minEdge", betsMinEdgeFilter?.value || "");
  saveFilter("bets", "minOdds", betsMinOddsFilter?.value || "");
  saveFilter("bets", "maxOdds", betsMaxOddsFilter?.value || "");
  saveFilter("bets", "minBack", betsMinBackNumberFilter?.value || "");
  saveFilter("bets", "maxBack", betsMaxBackNumberFilter?.value || "");
  saveFilter("bets", "minBarrier", betsMinBarrierFilter?.value || "");
  saveFilter("bets", "maxBarrier", betsMaxBarrierFilter?.value || "");
  saveFilter("bets", "minDist", betsMinDistanceFilter?.value || "");
  saveFilter("bets", "maxDist", betsMaxDistanceFilter?.value || "");
  saveFilter("bets", "search", betsSearchFilter?.value || "");
}

function restoreBetsFilters() {
  if (rangeFilter) rangeFilter.value = loadFilter("bets", "range", "all");
  if (betsResultFilter) betsResultFilter.value = loadFilter("bets", "result", "all");
  if (betsMinEdgeFilter) betsMinEdgeFilter.value = loadFilter("bets", "minEdge", "");
  if (betsMinOddsFilter) betsMinOddsFilter.value = loadFilter("bets", "minOdds", "");
  if (betsMaxOddsFilter) betsMaxOddsFilter.value = loadFilter("bets", "maxOdds", "");
  if (betsMinBackNumberFilter) betsMinBackNumberFilter.value = loadFilter("bets", "minBack", "");
  if (betsMaxBackNumberFilter) betsMaxBackNumberFilter.value = loadFilter("bets", "maxBack", "");
  if (betsMinBarrierFilter) betsMinBarrierFilter.value = loadFilter("bets", "minBarrier", "");
  if (betsMaxBarrierFilter) betsMaxBarrierFilter.value = loadFilter("bets", "maxBarrier", "");
  if (betsMinDistanceFilter) betsMinDistanceFilter.value = loadFilter("bets", "minDist", "");
  if (betsMaxDistanceFilter) betsMaxDistanceFilter.value = loadFilter("bets", "maxDist", "");
  if (betsSearchFilter) betsSearchFilter.value = loadFilter("bets", "search", "");
}

rangeFilter?.addEventListener("change", () => { saveBetsFilters(); applyFiltersAndRender(); });
[betsTrackFilter, betsBookFilter, betsResultFilter].forEach((el) => el?.addEventListener("change", () => { saveBetsFilters(); applyFiltersAndRender(); }));
[
  betsMinEdgeFilter,
  betsMinOddsFilter,
  betsMaxOddsFilter,
  betsMinBackNumberFilter,
  betsMaxBackNumberFilter,
  betsMinBarrierFilter,
  betsMaxBarrierFilter,
  betsMinDistanceFilter,
  betsMaxDistanceFilter,
  betsSearchFilter,
].forEach((el) => el?.addEventListener("input", () => { saveBetsFilters(); debounceApplyFilters(); }));
clearBetsFiltersBtn?.addEventListener("click", clearBetsFilters);
editBetSave?.addEventListener("click", saveEditModal);
editBetCancel?.addEventListener("click", closeEditModal);
editBetModal?.addEventListener("click", (e) => {
  if (e.target === editBetModal) closeEditModal();
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.key === "Escape") {
    document.querySelectorAll(".modal:not(.hidden)").forEach((m) => m.classList.add("hidden"));
    return;
  }
  if (e.key === "r" || e.key === "R") {
    loadBets().catch(console.error);
    return;
  }
  if (e.key >= "1" && e.key <= "5") {
    const pages = ["/", "/tips", "/my-bets", "/stats", "/settings"];
    window.location.href = pages[Number(e.key) - 1];
  }
});

applyThemeFromPreference();

loadBets().catch((err) => {
  console.error(err);
  showToast(`Failed to load bets: ${err.message}`, "error");
});
