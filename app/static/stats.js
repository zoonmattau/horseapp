const trackFilter = document.getElementById("trackFilter");
const refreshStatsBtn = document.getElementById("refreshStats");
const trackSummaryBody = document.querySelector("#trackSummaryTable tbody");
const barrierBiasBody = document.querySelector("#barrierBiasTable tbody");
const jockeyBody = document.querySelector("#jockeyTable tbody");
const trainerBody = document.querySelector("#trainerTable tbody");
const leaderJockeyBody = document.querySelector("#leaderJockeyTable tbody");
const leaderTrainerBody = document.querySelector("#leaderTrainerTable tbody");

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function valClass(v) {
  const n = Number(v || 0);
  if (n > 0) return "edge-positive";
  if (n < 0) return "edge-negative";
  return "edge-neutral";
}

function renderRows(body, rows, mapFn) {
  body.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = mapFn(r);
    body.appendChild(tr);
  });
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

async function loadStats() {
  const track = trackFilter.value;
  const query = track ? `?track=${encodeURIComponent(track)}` : "";
  const data = await jsonFetch(`/api/stats/dashboard${query}`);

  renderRows(trackSummaryBody, data.track_summary || [], (r) => `
    <td>${r.track}</td>
    <td>${r.races}</td>
    <td>${Number(r.avg_starters).toFixed(2)}</td>
    <td>$${Number(r.avg_prize_pool).toLocaleString()}</td>
    <td>${Number(r.good_rate_pct).toFixed(2)}%</td>
    <td>${Number(r.soft_rate_pct).toFixed(2)}%</td>
  `);

  renderRows(barrierBiasBody, data.barrier_bias || [], (r) => `
    <td>${r.track}</td>
    <td>${r.barrier_bucket}</td>
    <td>${r.runs}</td>
    <td>${r.wins}</td>
    <td>${Number(r.strike_rate_pct).toFixed(2)}%</td>
    <td>${Number(r.avg_finish_pos).toFixed(2)}</td>
  `);

  renderRows(jockeyBody, data.jockey_stats || [], (r) => `
    <td>${r.jockey}</td>
    <td>${r.runs}</td>
    <td>${r.wins}</td>
    <td>${Number(r.strike_rate_pct).toFixed(2)}%</td>
    <td>${Number(r.top3_rate_pct).toFixed(2)}%</td>
    <td class="${valClass(r.profit_units)}">${Number(r.profit_units).toFixed(2)}</td>
    <td class="${valClass(r.roi_pct)}">${Number(r.roi_pct).toFixed(2)}%</td>
    <td>${r.short_fav_runs}</td>
    <td>${Number(r.short_fav_sr_pct).toFixed(2)}%</td>
    <td class="${valClass(r.short_fav_roi_pct)}">${Number(r.short_fav_roi_pct).toFixed(2)}%</td>
    <td>${Number(r.avg_finish_pos).toFixed(2)}</td>
  `);

  renderRows(trainerBody, data.trainer_stats || [], (r) => `
    <td>${r.trainer}</td>
    <td>${r.runs}</td>
    <td>${r.wins}</td>
    <td>${Number(r.strike_rate_pct).toFixed(2)}%</td>
    <td>${Number(r.top3_rate_pct).toFixed(2)}%</td>
    <td class="${valClass(r.profit_units)}">${Number(r.profit_units).toFixed(2)}</td>
    <td class="${valClass(r.roi_pct)}">${Number(r.roi_pct).toFixed(2)}%</td>
    <td>${r.short_fav_runs}</td>
    <td>${Number(r.short_fav_sr_pct).toFixed(2)}%</td>
    <td class="${valClass(r.short_fav_roi_pct)}">${Number(r.short_fav_roi_pct).toFixed(2)}%</td>
    <td>${Number(r.avg_finish_pos).toFixed(2)}</td>
  `);

  renderRows(leaderJockeyBody, data.leaderboards?.jockeys || [], (r) => `
    <td>${r.name}</td>
    <td>${r.wins}</td>
    <td>${r.runs}</td>
    <td>${Number(r.strike_rate_pct).toFixed(2)}%</td>
  `);

  renderRows(leaderTrainerBody, data.leaderboards?.trainers || [], (r) => `
    <td>${r.name}</td>
    <td>${r.wins}</td>
    <td>${r.runs}</td>
    <td>${Number(r.strike_rate_pct).toFixed(2)}%</td>
  `);
}

refreshStatsBtn.addEventListener("click", loadStats);
trackFilter.addEventListener("change", loadStats);

async function init() {
  await loadFilters();
  await loadStats();
}

init().catch((err) => {
  console.error(err);
  alert(`Failed to load stats: ${err.message}`);
});
