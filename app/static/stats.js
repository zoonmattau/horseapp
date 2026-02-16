const trackFilter = document.getElementById("trackFilter");
const surfaceFilter = document.getElementById("surfaceFilter");
const roiModeFilter = document.getElementById("roiModeFilter");
const minRunsFilter = document.getElementById("minRunsFilter");
const minBackNumberFilter = document.getElementById("minBackNumberFilter");
const maxBackNumberFilter = document.getElementById("maxBackNumberFilter");
const minBarrierFilter = document.getElementById("minBarrierFilter");
const maxBarrierFilter = document.getElementById("maxBarrierFilter");
const minDistanceFilter = document.getElementById("minDistanceFilter");
const maxDistanceFilter = document.getElementById("maxDistanceFilter");
const minRoiFilter = document.getElementById("minRoiFilter");
const maxRoiFilter = document.getElementById("maxRoiFilter");
const nameSearchFilter = document.getElementById("nameSearchFilter");
const topNFilter = document.getElementById("topNFilter");
const clearStatsFiltersBtn = document.getElementById("clearStatsFilters");
const statsFilterSummary = document.getElementById("statsFilterSummary");
const statsFilterPills = document.getElementById("statsFilterPills");

const refreshStatsBtn = document.getElementById("refreshStats");
const summaryCards = document.getElementById("statsSummaryCards");
const trackRoiChart = document.getElementById("trackRoiChart");
const barrierRoiChart = document.getElementById("barrierRoiChart");
const jockeyWinChart = document.getElementById("jockeyWinChart");
const jockeyLossChart = document.getElementById("jockeyLossChart");
const trainerWinChart = document.getElementById("trainerWinChart");
const trainerLossChart = document.getElementById("trainerLossChart");

const trackSummaryBody = document.querySelector("#trackSummaryTable tbody");
const barrierBiasBody = document.querySelector("#barrierBiasTable tbody");
const jockeyBody = document.querySelector("#jockeyTable tbody");
const trainerBody = document.querySelector("#trainerTable tbody");
const leaderJockeyBody = document.querySelector("#leaderJockeyTable tbody");
const leaderTrainerBody = document.querySelector("#leaderTrainerTable tbody");

let rawStatsData = null;
let backendRefreshTimer = null;

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

function num(v) {
  return Number(v || 0);
}

function pct(v) {
  return `${num(v).toFixed(2)}%`;
}

function valClass(v) {
  const n = num(v);
  if (n > 0) return "edge-positive";
  if (n < 0) return "edge-negative";
  return "edge-neutral";
}

function debounceBackendRefresh() {
  clearTimeout(backendRefreshTimer);
  backendRefreshTimer = setTimeout(() => {
    refreshStats().catch((err) => {
      console.error(err);
      alert(`Failed to load stats: ${err.message}`);
    });
  }, 250);
}

function renderFilterMeta() {
  const pills = [];
  if (trackFilter.value) pills.push(`Track: ${trackFilter.value}`);
  if (surfaceFilter.value !== "all") pills.push(`Surface: ${surfaceFilter.value}`);
  if (roiModeFilter.value !== "all") pills.push(`ROI: ${roiModeFilter.value}`);
  if ((minRunsFilter.value || "0") !== "0") pills.push(`Min runs ${minRunsFilter.value}`);
  if (minBackNumberFilter.value.trim()) pills.push(`Back >= ${minBackNumberFilter.value.trim()}`);
  if (maxBackNumberFilter.value.trim()) pills.push(`Back <= ${maxBackNumberFilter.value.trim()}`);
  if (minBarrierFilter.value.trim()) pills.push(`Barrier >= ${minBarrierFilter.value.trim()}`);
  if (maxBarrierFilter.value.trim()) pills.push(`Barrier <= ${maxBarrierFilter.value.trim()}`);
  if (minDistanceFilter.value.trim()) pills.push(`Distance >= ${minDistanceFilter.value.trim()}m`);
  if (maxDistanceFilter.value.trim()) pills.push(`Distance <= ${maxDistanceFilter.value.trim()}m`);
  if (minRoiFilter.value.trim()) pills.push(`ROI >= ${minRoiFilter.value.trim()}%`);
  if (maxRoiFilter.value.trim()) pills.push(`ROI <= ${maxRoiFilter.value.trim()}%`);
  if (nameSearchFilter.value.trim()) pills.push(`Name: "${nameSearchFilter.value.trim()}"`);
  if ((topNFilter.value || "8") !== "8") pills.push(`Chart rows: ${topNFilter.value}`);

  if (statsFilterSummary) {
    statsFilterSummary.textContent = pills.length ? `${pills.length} active filter${pills.length > 1 ? "s" : ""}` : "No active filters";
  }
  if (statsFilterPills) {
    statsFilterPills.innerHTML = pills.map((p) => `<span class="filter-pill">${p}</span>`).join("");
  }
}

function renderRows(body, rows, mapFn) {
  body.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = mapFn(r);
    body.appendChild(tr);
  });
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="12" class="edge-neutral">No data for current filters.</td>';
    body.appendChild(tr);
  }
}

function pickBest(rows, key) {
  if (!rows.length) return null;
  return rows.reduce((best, r) => (num(r[key]) > num(best[key]) ? r : best), rows[0]);
}

function pickWorst(rows, key) {
  if (!rows.length) return null;
  return rows.reduce((worst, r) => (num(r[key]) < num(worst[key]) ? r : worst), rows[0]);
}

function card(label, value, tone) {
  return `<article class="summary-card ${tone}"><span>${label}</span><strong>${value}</strong></article>`;
}

function applyCommonRoiFilters(rows) {
  const mode = roiModeFilter.value;
  const minRuns = Math.max(0, parseInt(minRunsFilter.value || "0", 10));
  const minRoiRaw = minRoiFilter.value.trim();
  const maxRoiRaw = maxRoiFilter.value.trim();
  const minRoi = minRoiRaw === "" ? null : Number(minRoiRaw);
  const maxRoi = maxRoiRaw === "" ? null : Number(maxRoiRaw);

  return rows.filter((r) => {
    const runs = num(r.runs);
    const roi = num(r.roi_pct);
    if (runs < minRuns) return false;
    if (mode === "winning" && roi <= 0) return false;
    if (mode === "losing" && roi >= 0) return false;
    if (minRoi !== null && roi < minRoi) return false;
    if (maxRoi !== null && roi > maxRoi) return false;
    return true;
  });
}

function applySurfaceFilter(trackRows) {
  const surface = surfaceFilter.value;
  if (surface === "all") return trackRows;
  if (surface === "good") return trackRows.filter((r) => num(r.good_rate_pct) >= num(r.soft_rate_pct));
  return trackRows.filter((r) => num(r.soft_rate_pct) > num(r.good_rate_pct));
}

function applyNameFilter(rows, key) {
  const q = nameSearchFilter.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => String(r[key] || "").toLowerCase().includes(q));
}

function filteredStats(data) {
  const tracks = applyCommonRoiFilters(applySurfaceFilter([...(data.track_summary || [])]));
  const barriers = applyCommonRoiFilters([...(data.barrier_bias || [])]);
  const jockeys = applyNameFilter(applyCommonRoiFilters([...(data.jockey_stats || [])]), "jockey");
  const trainers = applyNameFilter(applyCommonRoiFilters([...(data.trainer_stats || [])]), "trainer");

  return {
    ...data,
    track_summary: tracks,
    barrier_bias: barriers,
    jockey_stats: jockeys,
    trainer_stats: trainers,
    leaderboards: {
      jockeys: [...jockeys]
        .sort((a, b) => num(b.wins) - num(a.wins) || num(b.strike_rate_pct) - num(a.strike_rate_pct))
        .slice(0, 10)
        .map((r) => ({ name: r.jockey, wins: r.wins, runs: r.runs, strike_rate_pct: r.strike_rate_pct })),
      trainers: [...trainers]
        .sort((a, b) => num(b.wins) - num(a.wins) || num(b.strike_rate_pct) - num(a.strike_rate_pct))
        .slice(0, 10)
        .map((r) => ({ name: r.trainer, wins: r.wins, runs: r.runs, strike_rate_pct: r.strike_rate_pct })),
    },
  };
}

function renderSummaryCards(data) {
  const tracks = data.track_summary || [];
  const barriers = data.barrier_bias || [];
  const jockeys = data.jockey_stats || [];
  const trainers = data.trainer_stats || [];

  const bestTrack = pickBest(tracks, "roi_pct");
  const worstTrack = pickWorst(tracks, "roi_pct");
  const bestBarrier = pickBest(barriers, "roi_pct");
  const worstBarrier = pickWorst(barriers, "roi_pct");
  const bestJockey = pickBest(jockeys, "roi_pct");
  const worstTrainer = pickWorst(trainers, "roi_pct");

  summaryCards.innerHTML = [
    card("Best Track", bestTrack ? `${bestTrack.track} (${pct(bestTrack.roi_pct)})` : "n/a", "win"),
    card("Worst Track", worstTrack ? `${worstTrack.track} (${pct(worstTrack.roi_pct)})` : "n/a", "loss"),
    card("Best Barrier", bestBarrier ? `${bestBarrier.barrier_bucket} (${pct(bestBarrier.roi_pct)})` : "n/a", "win"),
    card("Worst Barrier", worstBarrier ? `${worstBarrier.barrier_bucket} (${pct(worstBarrier.roi_pct)})` : "n/a", "loss"),
    card("Best Jockey ROI", bestJockey ? `${bestJockey.jockey} (${pct(bestJockey.roi_pct)})` : "n/a", "win"),
    card("Worst Trainer ROI", worstTrainer ? `${worstTrainer.trainer} (${pct(worstTrainer.roi_pct)})` : "n/a", "loss"),
  ].join("");
}

function renderBarChart(root, rows, { labelKey, valueKey, valueSuffix = "%" }) {
  root.innerHTML = "";
  if (!rows.length) {
    root.innerHTML = '<p class="muted">No data.</p>';
    return;
  }

  const maxAbs = Math.max(...rows.map((r) => Math.abs(num(r[valueKey]))), 1);

  rows.forEach((row) => {
    const value = num(row[valueKey]);
    const direction = value >= 0 ? "positive" : "negative";
    const width = `${(Math.abs(value) / maxAbs) * 100}%`;

    const item = document.createElement("div");
    item.className = "bar-item";
    item.innerHTML = `
      <span class="bar-label">${row[labelKey]}</span>
      <div class="bar-track">
        <div class="bar-fill ${direction}" style="width:${width}"></div>
      </div>
      <span class="bar-value ${valClass(value)}">${value.toFixed(2)}${valueSuffix}</span>
    `;
    root.appendChild(item);
  });
}

function renderCharts(data) {
  const topN = Math.max(1, Number(topNFilter.value || 8));
  const tracksByRoi = [...(data.track_summary || [])].sort((a, b) => num(b.roi_pct) - num(a.roi_pct));
  const barriersByRoi = [...(data.barrier_bias || [])]
    .sort((a, b) => num(b.roi_pct) - num(a.roi_pct))
    .map((r) => ({ ...r, label: `${r.track}: ${r.barrier_bucket}` }));

  const jockeysByRoi = [...(data.jockey_stats || [])].sort((a, b) => num(b.roi_pct) - num(a.roi_pct));
  const trainersByRoi = [...(data.trainer_stats || [])].sort((a, b) => num(b.roi_pct) - num(a.roi_pct));

  renderBarChart(trackRoiChart, tracksByRoi.slice(0, topN), { labelKey: "track", valueKey: "roi_pct" });
  renderBarChart(barrierRoiChart, barriersByRoi.slice(0, topN), { labelKey: "label", valueKey: "roi_pct" });
  renderBarChart(jockeyWinChart, jockeysByRoi.slice(0, topN), { labelKey: "jockey", valueKey: "roi_pct" });
  renderBarChart(jockeyLossChart, jockeysByRoi.slice(-topN).reverse(), { labelKey: "jockey", valueKey: "roi_pct" });
  renderBarChart(trainerWinChart, trainersByRoi.slice(0, topN), { labelKey: "trainer", valueKey: "roi_pct" });
  renderBarChart(trainerLossChart, trainersByRoi.slice(-topN).reverse(), { labelKey: "trainer", valueKey: "roi_pct" });
}

function renderAll(data) {
  renderSummaryCards(data);
  renderCharts(data);

  renderRows(trackSummaryBody, data.track_summary || [], (r) => `
    <td>${r.track}</td>
    <td>${r.races}</td>
    <td>${r.runs}</td>
    <td>${r.wins}</td>
    <td>${pct(r.strike_rate_pct)}</td>
    <td class="${valClass(r.profit_units)}">${num(r.profit_units).toFixed(2)}</td>
    <td class="${valClass(r.roi_pct)}">${pct(r.roi_pct)}</td>
    <td>${num(r.avg_starters).toFixed(2)}</td>
    <td>$${num(r.avg_prize_pool).toLocaleString()}</td>
    <td>${pct(r.good_rate_pct)}</td>
    <td>${pct(r.soft_rate_pct)}</td>
  `);

  renderRows(barrierBiasBody, data.barrier_bias || [], (r) => `
    <td>${r.track}</td>
    <td>${r.barrier_bucket}</td>
    <td>${r.runs}</td>
    <td>${r.wins}</td>
    <td>${pct(r.strike_rate_pct)}</td>
    <td class="${valClass(r.profit_units)}">${num(r.profit_units).toFixed(2)}</td>
    <td class="${valClass(r.roi_pct)}">${pct(r.roi_pct)}</td>
    <td>${num(r.avg_finish_pos).toFixed(2)}</td>
  `);

  renderRows(jockeyBody, data.jockey_stats || [], (r) => `
    <td>${r.jockey}</td>
    <td>${r.runs}</td>
    <td>${r.wins}</td>
    <td>${pct(r.strike_rate_pct)}</td>
    <td>${pct(r.top3_rate_pct)}</td>
    <td class="${valClass(r.profit_units)}">${num(r.profit_units).toFixed(2)}</td>
    <td class="${valClass(r.roi_pct)}">${pct(r.roi_pct)}</td>
    <td>${r.short_fav_runs}</td>
    <td>${pct(r.short_fav_sr_pct)}</td>
    <td class="${valClass(r.short_fav_roi_pct)}">${pct(r.short_fav_roi_pct)}</td>
    <td>${num(r.avg_finish_pos).toFixed(2)}</td>
  `);

  renderRows(trainerBody, data.trainer_stats || [], (r) => `
    <td>${r.trainer}</td>
    <td>${r.runs}</td>
    <td>${r.wins}</td>
    <td>${pct(r.strike_rate_pct)}</td>
    <td>${pct(r.top3_rate_pct)}</td>
    <td class="${valClass(r.profit_units)}">${num(r.profit_units).toFixed(2)}</td>
    <td class="${valClass(r.roi_pct)}">${pct(r.roi_pct)}</td>
    <td>${r.short_fav_runs}</td>
    <td>${pct(r.short_fav_sr_pct)}</td>
    <td class="${valClass(r.short_fav_roi_pct)}">${pct(r.short_fav_roi_pct)}</td>
    <td>${num(r.avg_finish_pos).toFixed(2)}</td>
  `);

  renderRows(leaderJockeyBody, data.leaderboards?.jockeys || [], (r) => `
    <td>${r.name}</td>
    <td>${r.wins}</td>
    <td>${r.runs}</td>
    <td>${pct(r.strike_rate_pct)}</td>
  `);

  renderRows(leaderTrainerBody, data.leaderboards?.trainers || [], (r) => `
    <td>${r.name}</td>
    <td>${r.wins}</td>
    <td>${r.runs}</td>
    <td>${pct(r.strike_rate_pct)}</td>
  `);
}

function applyUiFiltersAndRender() {
  if (!rawStatsData) return;
  renderFilterMeta();
  renderAll(filteredStats(rawStatsData));
}

async function loadFilters() {
  const data = await jsonFetch("/api/stats/filters");
  trackFilter.innerHTML = `<option value="">All Tracks</option>`;
  (data.tracks || []).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    trackFilter.appendChild(opt);
  });
}

async function fetchStatsData() {
  const params = new URLSearchParams();
  const track = trackFilter.value;
  if (track) params.set("track", track);
  if (minBackNumberFilter.value.trim() !== "") params.set("min_back_number", minBackNumberFilter.value.trim());
  if (maxBackNumberFilter.value.trim() !== "") params.set("max_back_number", maxBackNumberFilter.value.trim());
  if (minBarrierFilter.value.trim() !== "") params.set("min_barrier", minBarrierFilter.value.trim());
  if (maxBarrierFilter.value.trim() !== "") params.set("max_barrier", maxBarrierFilter.value.trim());
  if (minDistanceFilter.value.trim() !== "") params.set("min_distance", minDistanceFilter.value.trim());
  if (maxDistanceFilter.value.trim() !== "") params.set("max_distance", maxDistanceFilter.value.trim());
  const query = params.toString() ? `?${params.toString()}` : "";
  rawStatsData = await jsonFetch(`/api/stats/dashboard${query}`);
}

function clearStatsFilters() {
  surfaceFilter.value = "all";
  roiModeFilter.value = "all";
  minRunsFilter.value = "0";
  minBackNumberFilter.value = "";
  maxBackNumberFilter.value = "";
  minBarrierFilter.value = "";
  maxBarrierFilter.value = "";
  minDistanceFilter.value = "";
  maxDistanceFilter.value = "";
  minRoiFilter.value = "";
  maxRoiFilter.value = "";
  nameSearchFilter.value = "";
  topNFilter.value = "8";
  refreshStats().catch((err) => {
    console.error(err);
    alert(`Failed to load stats: ${err.message}`);
  });
}

async function refreshStats() {
  await fetchStatsData();
  applyUiFiltersAndRender();
}

refreshStatsBtn.addEventListener("click", refreshStats);
trackFilter.addEventListener("change", refreshStats);
[minBackNumberFilter, maxBackNumberFilter, minBarrierFilter, maxBarrierFilter, minDistanceFilter, maxDistanceFilter]
  .forEach((el) => {
    el.addEventListener("input", debounceBackendRefresh);
    el.addEventListener("change", refreshStats);
  });

[surfaceFilter, roiModeFilter, minRunsFilter, minRoiFilter, maxRoiFilter, nameSearchFilter, topNFilter]
  .forEach((el) => {
    el.addEventListener("input", applyUiFiltersAndRender);
    el.addEventListener("change", applyUiFiltersAndRender);
  });

clearStatsFiltersBtn?.addEventListener("click", clearStatsFilters);

async function init() {
  applyThemeFromPreference();
  await loadFilters();
  await refreshStats();
}

init().catch((err) => {
  console.error(err);
  alert(`Failed to load stats: ${err.message}`);
});
