const betsBody = document.querySelector("#betsTable tbody");
const analyticsPanel = document.getElementById("analyticsPanel");
const toggleAnalyticsBtn = document.getElementById("toggleAnalytics");
const rangeFilter = document.getElementById("rangeFilter");
const betsTotals = document.getElementById("betsTotals");
const metricsBody = document.querySelector("#metricsTable tbody");
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

let currentBets = [];
let currentFilteredBets = [];
let pendingEditBet = null;

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function edgeClass(value) {
  if (value > 0) return "edge-positive";
  if (value < 0) return "edge-negative";
  return "edge-neutral";
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
  const params = new URLSearchParams({ result });
  await jsonFetch(`/api/user/bets/${betId}/result?${params.toString()}`, { method: "POST" });
  await loadBets();
}

async function updateBetDetails(betId, oddsAtTip, stake) {
  const params = new URLSearchParams({
    odds_at_tip: String(oddsAtTip),
    stake: String(stake),
  });
  await jsonFetch(`/api/tips/tracked/${betId}/update?${params.toString()}`, { method: "POST" });
  await loadBets();
}

async function deleteBet(betId) {
  await jsonFetch(`/api/tips/tracked/${betId}`, { method: "DELETE" });
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
    alert("Odds must be greater than 1.0");
    return;
  }
  if (stake < 0) {
    alert("Stake must be non-negative");
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
      <td>$${Number(b.odds_at_tip).toFixed(2)}</td>
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
  currentFilteredBets = filterBetsByRange(currentBets, range);
  renderTotals(currentFilteredBets);
  renderLog(currentFilteredBets);
  renderMetricsTable(currentFilteredBets);
  renderGraphs(currentFilteredBets);
}

async function loadBets() {
  const data = await jsonFetch("/api/user/bets");
  currentBets = data.bets || [];
  applyFiltersAndRender();
}

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

rangeFilter?.addEventListener("change", applyFiltersAndRender);
editBetSave?.addEventListener("click", saveEditModal);
editBetCancel?.addEventListener("click", closeEditModal);
editBetModal?.addEventListener("click", (e) => {
  if (e.target === editBetModal) closeEditModal();
});

loadBets().catch((err) => {
  console.error(err);
  alert(`Failed to load bets: ${err.message}`);
});
