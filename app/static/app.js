const raceDateInput = document.getElementById("raceDate");
const booksContainer = document.getElementById("books");
const tipsBody = document.querySelector("#tipsTable tbody");
const tipsTable = document.getElementById("tipsTable");
const boardLoading = document.getElementById("boardLoading");
const matrixWrap = document.getElementById("matrixWrap");
const selectedRaceTitle = document.getElementById("selectedRaceTitle");
const raceMetaName = document.getElementById("raceMetaName");
const raceMetaStarters = document.getElementById("raceMetaStarters");
const raceMetaPrize = document.getElementById("raceMetaPrize");
const raceMetaRating = document.getElementById("raceMetaRating");
const raceMetaJumpLocal = document.getElementById("raceMetaJumpLocal");
const raceMetaToJump = document.getElementById("raceMetaToJump");
const raceMetaOverround = document.getElementById("raceMetaOverround");
const betSlipNext = document.getElementById("betSlipNext");
const betSlipDone = document.getElementById("betSlipDone");
const betSlipCount = document.getElementById("betSlipCount");
const betSlipSummary = document.getElementById("betSlipSummary");
const betSlipPotential = document.getElementById("betSlipPotential");
const betSlipScrollHint = document.getElementById("betSlipScrollHint");
const betSlipClearAll = document.getElementById("betSlipClearAll");
const trackModal = document.getElementById("trackModal");
const trackModalTitle = document.getElementById("trackModalTitle");
const trackModalMeta = document.getElementById("trackModalMeta");
const modalOddsInput = document.getElementById("modalOdds");
const modalStakeInput = document.getElementById("modalStake");
const modalSaveBtn = document.getElementById("modalSave");
const modalCancelBtn = document.getElementById("modalCancel");
const refreshTipsBtn = document.getElementById("refreshTips");
const simulateMoveBtn = document.getElementById("simulateMove");
const simulateResultBtn = document.getElementById("simulateResult");
const raceResultsEl = document.getElementById("raceResults");
const valueFilterBtn = document.getElementById("valueFilterBtn");
const mobileSlipBtn = document.getElementById("mobileSlipBtn");
const detailFiltersWrap = document.getElementById("detailFilters");
const filterDistanceEl = document.getElementById("filterDistance");
const filterTrackEl = document.getElementById("filterTrack");
const filterRunsBackEl = document.getElementById("filterRunsBack");
const boardContextEl = document.getElementById("boardContext");
const toastContainer = document.getElementById("toastContainer");

let bookmakers = [];
let bookSymbol = {};
let selectedBooks = new Set();
let selectedRaceId = null;
let openDetailKey = null;
let openDetailEntity = null;
let racesForDay = [];
let tipSignals = {};
let trackedTipsCache = [];
let pendingTrackPayload = null;
let selectedRaceJumpIso = null;
let selectedRaceHeaderMeta = null;
let valueFilterActive = false;
let lastBoardData = null;
let boardSortKey = "edge_pct";
let boardSortAsc = false;
let lastRefreshTime = null;

const lastUpdatedEl = document.getElementById("lastUpdated");

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

function syncThemeMode() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const pref = (localStorage.getItem("horse_theme_pref") || "system").toLowerCase();
    if (pref === "light" || pref === "dark") {
      document.documentElement.setAttribute("data-theme", pref);
    } else {
      document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    }
  };
  apply();
  mq.addEventListener("change", apply);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function selectedBookString() {
  return Array.from(selectedBooks).join(",");
}

function localDayIso(dt) {
  const d = new Date(dt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCountdown(iso) {
  if (!iso) return "-";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < -180000) {
    const abs = Math.abs(diff);
    const mins = Math.floor(abs / 60000);
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return hh > 0 ? `${hh}h ${mm}m ago` : `${mm}m ago`;
  }
  if (diff < 0) return "Jumping";
  const totalSec = Math.floor(diff / 1000);
  if (totalSec < 300) {
    const mm = Math.floor(totalSec / 60);
    const ss = String(totalSec % 60).padStart(2, "0");
    return mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
  }
  const mins = Math.floor(diff / 60000);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
}

function raceStatusClass(iso) {
  if (!iso) return "race-upcoming";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < -180000) return "race-jumped";
  if (diff < 60000)   return "race-live";
  if (diff < 300000)  return "race-imminent";
  return "race-upcoming";
}

// Legacy wrappers for backward compat
function toJumpCountdown(raceDate, jumpTime) {
  return raceDate && jumpTime ? formatCountdown(`${raceDate}T${jumpTime}:00`) : "-";
}

function countdownLabel(raceDate, jumpTime) {
  return raceDate && jumpTime ? formatCountdown(`${raceDate}T${jumpTime}:00`) : "-";
}

function countdownFromIso(iso) {
  return formatCountdown(iso);
}

function localJumpLabel(raceDate, jumpTime) {
  if (!raceDate || !jumpTime) return "-";
  const d = new Date(`${raceDate}T${jumpTime}:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

function renderSelectedRaceTitle() {
  if (!selectedRaceTitle) return;
  if (!selectedRaceHeaderMeta) {
    selectedRaceTitle.textContent = "Race Details";
    if (boardContextEl) boardContextEl.textContent = "";
    return;
  }
  const c = countdownFromIso(selectedRaceJumpIso);
  const jumpPhrase = c === "jumped" ? "Jumped" : `${c} to jump`;
  const title =
    `${selectedRaceHeaderMeta.track} R${selectedRaceHeaderMeta.race_number} ` +
    `(${selectedRaceHeaderMeta.distance_m}m) \u2022 ${selectedRaceHeaderMeta.track_rating} \u2022 ${jumpPhrase}`;
  selectedRaceTitle.textContent = title;
  if (boardContextEl) {
    boardContextEl.textContent = `${selectedRaceHeaderMeta.track} R${selectedRaceHeaderMeta.race_number} \u2022 ${jumpPhrase}`;
  }
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

function profitLossUnits(bet) {
  const stake = Number(bet.stake || 0);
  const odds = Number(bet.odds_at_tip || 0);
  if (bet.result === "won") return stake * (odds - 1);
  if (bet.result === "lost") return -stake;
  return null;
}

function gradeHtml(roi) {
  if (roi == null || roi <= 0) return "";
  return `<span class="stars" title="ROI: ${roi}%"><span class="star-filled">\u2605</span></span>`;
}

function formatFormString(form) {
  if (!form) return "-";
  const last = form.length - 1;
  let html = "";
  for (let i = 0; i < form.length; i++) {
    const ch = form[i];
    if (i === last && ch === "1") {
      html += `<span class="form-first-win">${ch}</span>`;
    } else if (i === last && parseInt(ch) >= 4) {
      html += `<span class="form-first-bad">${ch}</span>`;
    } else {
      html += ch;
    }
  }
  return html;
}

function openTrackModal(payload) {
  pendingTrackPayload = payload;
  if (trackModalTitle) trackModalTitle.textContent = payload.mode === "edit" ? "Edit Tracked Bet" : "Add to Slip";
  if (trackModalMeta) {
    trackModalMeta.textContent = `${payload.track || ""} R${payload.race_number || ""} - ${payload.horse_name || ""}`;
  }
  const odds = Number(payload.odds_at_tip || payload.market_odds || 0);
  if (modalOddsInput) modalOddsInput.value = odds.toFixed(2);
  if (modalStakeInput) modalStakeInput.value = "1.00";

  const kellyHint = document.getElementById("kellyHint");
  if (kellyHint) {
    if (payload.mode !== "edit" && payload.edge_pct != null && odds > 1) {
      const k = computeKelly(payload.edge_pct, odds);
      if (k && Number(k) > 0) {
        kellyHint.hidden = false;
        kellyHint.innerHTML = `½ Kelly: <span class="kelly-value" id="kellyApply">${k}u</span>`;
        document.getElementById("kellyApply")?.addEventListener("click", () => {
          if (modalStakeInput) modalStakeInput.value = k;
        });
      } else {
        kellyHint.hidden = true;
      }
    } else {
      kellyHint.hidden = true;
    }
  }

  trackModal?.classList.remove("hidden");
}

function closeTrackModal() {
  trackModal?.classList.add("hidden");
  pendingTrackPayload = null;
}

async function saveTrackedBetFromModal() {
  if (!pendingTrackPayload) return;
  const odds = Number(modalOddsInput?.value || "0");
  const stake = Number(modalStakeInput?.value || "0");
  if (odds <= 1) {
    showToast("Odds must be greater than 1.0", "error");
    return;
  }
  if (stake < 0) {
    showToast("Stake must be zero or greater", "error");
    return;
  }
  if (pendingTrackPayload.mode === "edit") {
    await jsonFetch(`/api/tips/tracked/${pendingTrackPayload.bet_id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odds_at_tip: odds, stake: stake }),
    });
    showToast("Bet updated", "success");
  } else {
    await jsonFetch("/api/tips/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        race_id: pendingTrackPayload.race_id,
        runner_id: pendingTrackPayload.runner_id,
        bookmaker: pendingTrackPayload.bookmaker,
        edge_pct: pendingTrackPayload.edge_pct,
        odds_at_tip: odds,
        stake: stake,
      }),
    });
    showToast("Bet added to slip", "success");
  }
  closeTrackModal();
  await loadTracked();
}

async function loadBookmakers() {
  const data = await jsonFetch("/api/bookmakers");
  bookmakers = data.bookmakers.map((b) => b.id);
  bookSymbol = Object.fromEntries(data.bookmakers.map((b) => [b.id, b.symbol]));
  selectedBooks = new Set(bookmakers);
  renderBookmakers();
}

function renderBookmakers() {
  booksContainer.innerHTML = "";
  bookmakers.forEach((book) => {
    const label = document.createElement("label");
    label.className = "book-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedBooks.has(book);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedBooks.add(book);
      else selectedBooks.delete(book);
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(bookSymbol[book] || book));
    booksContainer.appendChild(label);
  });
}

async function loadRaceData() {
  const date = raceDateInput.value || todayIso();
  const books = encodeURIComponent(selectedBookString());
  const [racesResp, signalsResp] = await Promise.all([
    jsonFetch(`/api/races?race_date=${date}`),
    jsonFetch(`/api/race-signals?race_date=${date}&books=${books}&rec_edge=1`),
  ]);
  racesForDay = racesResp.races;
  tipSignals = signalsResp.signals || {};
  lastRefreshTime = Date.now();
  if (lastUpdatedEl) lastUpdatedEl.textContent = "Just updated";

  if (!selectedRaceId || !racesForDay.some((r) => String(r.id) === String(selectedRaceId))) {
    selectedRaceId = racesForDay.length ? racesForDay[0].id : null;
  }

  renderMatrix();
}

function renderMatrix() {
  if (!racesForDay.length) {
    matrixWrap.innerHTML = '<div class="empty-state"><p>No races for this date.</p></div>';
    return;
  }

  const tracks = [...new Set(racesForDay.map((r) => r.track))];
  const maxRace = Math.max(...racesForDay.map((r) => r.race_number));
  const raceMap = new Map(racesForDay.map((r) => [`${r.track}|${r.race_number}`, r]));

  const table = document.createElement("table");
  table.className = "matrix-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.innerHTML = `<th>Track</th>${Array.from({ length: maxRace }, (_, i) => `<th>R${i + 1}</th>`).join("")}`;
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  tracks.forEach((track) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="matrix-track">${escapeHtml(track)}</td>`;

    for (let raceNo = 1; raceNo <= maxRace; raceNo += 1) {
      const td = document.createElement("td");
      td.className = "matrix-cell";
      const race = raceMap.get(`${track}|${raceNo}`);

      if (!race) {
        td.classList.add("matrix-empty");
        td.textContent = "-";
      } else {
        const signal = tipSignals[String(race.id)] || { has_tip: false, tip_count: 0, max_edge: 0 };
        const selectedClass = String(selectedRaceId) === String(race.id) ? "selected" : "";
        const icon = signal.has_tip ? `<span class="matrix-tip-icon" title="${signal.tip_count} tip(s)"></span>` : "";
        const jumpIso = `${race.race_date}T${race.jump_time}:00`;
        const jump = formatCountdown(jumpIso);
        const statusCls = raceStatusClass(jumpIso);
        const edgeStr = "";
        const tipsStr = signal.tip_count > 0 ? `<div class="matrix-tips">${signal.tip_count} tip${signal.tip_count > 1 ? "s" : ""}</div>` : "";
        const edgeBorder = signal.max_edge > 5 ? "edge-strong" : signal.max_edge > 0 ? "edge-weak" : "";
        td.innerHTML = `
          <button class="matrix-btn ${selectedClass} ${edgeBorder} ${statusCls}" data-race-id="${race.id}" data-jump-iso="${jumpIso}">
            ${icon}
            <span class="matrix-time" data-countdown="1">${escapeHtml(jump)}</span>
            ${edgeStr}
            ${tipsStr}
          </button>
        `;
      }
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  matrixWrap.innerHTML = "";
  matrixWrap.appendChild(table);

  matrixWrap.querySelectorAll("button[data-race-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      selectedRaceId = Number(btn.getAttribute("data-race-id"));
      renderMatrix();
      await loadTipsForSelectedRace();
    });
  });
}

function renderStatsBar(stats) {
  if (!stats) return "";
  const roiCls = stats.roi > 0 ? "edge-positive" : stats.roi < 0 ? "edge-negative" : "edge-neutral";
  return `
    <div class="stats-grid">
      <div class="stat-badge"><div class="stat-value">${stats.runs}</div><div class="stat-label">Runs</div></div>
      <div class="stat-badge"><div class="stat-value">${stats.wins}</div><div class="stat-label">Wins</div></div>
      <div class="stat-badge"><div class="stat-value">${stats.places}</div><div class="stat-label">Places</div></div>
      <div class="stat-badge"><div class="stat-value">${stats.strike_pct}%</div><div class="stat-label">Strike Rate</div></div>
      <div class="stat-badge"><div class="stat-value">${stats.place_pct}%</div><div class="stat-label">Place Rate</div></div>
      <div class="stat-badge"><div class="stat-value ${roiCls}">${stats.roi}%</div><div class="stat-label">ROI</div></div>
    </div>
  `;
}

function runsBackLabel(val) {
  if (!val) return "-";
  if (val === 1) return "1st up";
  if (val === 2) return "2nd up";
  if (val === 3) return "3rd up";
  if (val === 4) return "4th up";
  return `${val}th up`;
}

function getCardFilters() {
  return {
    distance: filterDistanceEl?.value || "",
    track: filterTrackEl?.value || "",
    runs_back: filterRunsBackEl?.value || "",
  };
}

function showDetailFilters(show) {
  if (detailFiltersWrap) detailFiltersWrap.hidden = !show;
}

function populateTrackDropdown(tracks, current) {
  if (!filterTrackEl) return;
  const val = current || filterTrackEl.value;
  filterTrackEl.innerHTML = `<option value="">All tracks</option>` +
    (tracks || []).map((t) => `<option value="${escapeHtml(t)}"${t === val ? " selected" : ""}>${escapeHtml(t)}</option>`).join("");
}

function renderDetailsTable(title, subtitle, rows, stats) {
  const body = rows.join("") || `<tr><td colspan="7">No history available.</td></tr>`;
  return `
    <div class="details-card">
      <div class="details-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="details-subtitle">${subtitle}</div>` : ""}
      ${renderStatsBar(stats)}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Horse</th>
            <th>Track</th>
            <th>Distance</th>
            <th>Finish</th>
            <th>SP</th>
            <th>Backup</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

async function fetchAndRenderDetails(entityType, entityName, filters, runnerCtx) {
  const params = new URLSearchParams({ name: entityName });
  if (filters.distance) params.set("distance", filters.distance);
  if (filters.track) params.set("track", filters.track);
  if (filters.runs_back) params.set("runs_back", filters.runs_back);
  const url = `/api/${entityType}s/history?${params.toString()}`;
  const history = await jsonFetch(url);
  populateTrackDropdown(history.available_tracks, filters.track);
  const subtitle = runnerCtx
    ? `Barrier ${runnerCtx.barrier} \u2022 $${Number(runnerCtx.market_odds).toFixed(2)}`
    : "";
  const hrows = history.runs.map(
    (run) => `
      <tr>
        <td>${escapeHtml(run.run_date)}</td>
        <td>${escapeHtml(run.horse_name)}</td>
        <td>${escapeHtml(run.track)}</td>
        <td>${escapeHtml(run.distance_m)}m</td>
        <td>${escapeHtml(run.finish_pos)}</td>
        <td>$${Number(run.starting_price).toFixed(2)}</td>
        <td>${runsBackLabel(run.runs_back)}</td>
      </tr>
    `
  );
  return renderDetailsTable(
    `${entityType === "trainer" ? "Trainer" : "Jockey"} - ${entityName}`,
    subtitle,
    hrows,
    history.stats
  );
}

async function refreshOpenDetail() {
  if (!openDetailEntity) return;
  const detailRow = tipsBody.querySelector("tr.details-row");
  if (!detailRow) return;
  const { entityType, entityName, runnerCtx } = openDetailEntity;
  const html = await fetchAndRenderDetails(entityType, entityName, getCardFilters(), runnerCtx);
  detailRow.innerHTML = `<td colspan="14">${html}</td>`;
}

async function openInlineDetails(anchorRow, key, buildHtml, entity) {
  const existing = tipsBody.querySelector("tr.details-row");
  if (existing) existing.remove();
  if (openDetailKey === key) {
    openDetailKey = null;
    openDetailEntity = null;
    showDetailFilters(false);
    return;
  }

  const detailRow = document.createElement("tr");
  detailRow.className = "details-row";
  detailRow.innerHTML = `<td colspan="14">Loading history...</td>`;
  anchorRow.insertAdjacentElement("afterend", detailRow);

  try {
    detailRow.innerHTML = `<td colspan="14">${await buildHtml()}</td>`;
    openDetailKey = key;
    openDetailEntity = entity || null;
    showDetailFilters(!!entity);
  } catch (err) {
    detailRow.innerHTML = `<td colspan="14">Failed to load history.</td>`;
    openDetailKey = key;
    openDetailEntity = entity || null;
    showDetailFilters(!!entity);
    console.error(err);
  }
}

function updateSortIndicators() {
  document.querySelectorAll("#tipsTable thead th[data-sort]").forEach((th) => {
    const key = th.getAttribute("data-sort");
    const base = th.textContent.replace(/ [▲▼]$/, "");
    if (key === boardSortKey) {
      th.textContent = `${base} ${boardSortAsc ? "\u25B2" : "\u25BC"}`;
    } else {
      th.textContent = base;
    }
  });
}

function renderBoardRows(data) {
  tipsBody.innerHTML = "";
  openDetailKey = null;
  openDetailEntity = null;
  showDetailFilters(false);

  let rows = valueFilterActive ? data.rows.filter((t) => t.edge_pct > 0) : [...data.rows];
  rows.sort((a, b) => {
    const av = Number(a[boardSortKey] || 0);
    const bv = Number(b[boardSortKey] || 0);
    return boardSortAsc ? av - bv : bv - av;
  });
  updateSortIndicators();

  if (!rows.length) {
    tipsTable.style.display = "none";
    return;
  }

  tipsTable.style.display = "";

  rows.forEach((tip) => {
    const tr = document.createElement("tr");
    if (tip.edge_pct > 5) tr.className = "row-value-strong";

    tr.innerHTML = `
      <td>${tip.horse_number}</td>
      <td class="col-barrier">${tip.barrier}</td>
      <td><button data-history="1">${escapeHtml(tip.horse_name)}</button></td>
      <td><span class="form-string">${formatFormString(tip.form_last5)}</span></td>
      <td><button data-trainer="1">${escapeHtml(tip.trainer)}</button>${gradeHtml(tip.trainer_roi_pct)}</td>
      <td><button data-jockey="1">${escapeHtml(tip.jockey)}</button>${gradeHtml(tip.jockey_roi_pct)}</td>
      <td class="col-predicted">${formatOdds(tip.predicted_price)}</td>
      <td>${formatOdds(tip.market_odds)}</td>
      <td>${escapeHtml(tip.best_book_symbol)}</td>
      <td class="col-model">${Number(tip.model_prob_pct || 0).toFixed(2)}%</td>
      <td class="col-book">${Number(tip.bookmaker_pct || 0).toFixed(2)}%</td>
      <td><a href="${escapeHtml(tip.bet_url)}" target="_blank" rel="noreferrer">Bet</a></td>
      <td><button data-track="1">+ Slip</button></td>
    `;

    tr.querySelector("button[data-track='1']").addEventListener("click", () => {
      openTrackModal({
        race_id: data.race.id,
        runner_id: tip.runner_id,
        bookmaker: tip.best_bookmaker,
        edge_pct: tip.edge_pct,
        odds_at_tip: tip.market_odds,
        horse_name: tip.horse_name,
        track: data.race.track,
        race_number: data.race.race_number,
      });
    });

    tr.querySelector("button[data-history='1']").addEventListener("click", async () => {
      const key = `horse:${tip.runner_id}`;
      await openInlineDetails(tr, key, async () => {
        const history = await jsonFetch(`/api/runners/${tip.runner_id}/history`);
        const hrows = history.runs.map(
          (run) => `
            <tr>
              <td>${escapeHtml(run.run_date)}</td>
              <td>${escapeHtml(tip.horse_name)}</td>
              <td>${escapeHtml(run.track)}</td>
              <td>${escapeHtml(run.distance_m)}m</td>
              <td>${escapeHtml(run.finish_pos)}</td>
              <td>$${Number(run.starting_price).toFixed(2)}</td>
              <td>${Number(run.carried_weight_kg).toFixed(1)}kg</td>
              <td>${escapeHtml(run.jockey)}</td>
            </tr>
          `
        );
        return renderDetailsTable(`Horse History - ${tip.horse_name}`, "", hrows);
      });
    });

    const runnerCtx = { barrier: tip.barrier, market_odds: tip.market_odds };

    tr.querySelector("button[data-trainer='1']").addEventListener("click", async () => {
      const key = `trainer:${tip.trainer}`;
      const entity = { entityType: "trainer", entityName: tip.trainer, runnerCtx };
      await openInlineDetails(tr, key, async () => {
        return fetchAndRenderDetails("trainer", tip.trainer, getCardFilters(), runnerCtx);
      }, entity);
    });

    tr.querySelector("button[data-jockey='1']").addEventListener("click", async () => {
      const key = `jockey:${tip.jockey}`;
      const entity = { entityType: "jockey", entityName: tip.jockey, runnerCtx };
      await openInlineDetails(tr, key, async () => {
        return fetchAndRenderDetails("jockey", tip.jockey, getCardFilters(), runnerCtx);
      }, entity);
    });

    tipsBody.appendChild(tr);
  });

  if (rows.length) {
    const sum = document.createElement("tr");
    sum.className = "summary-row";
    sum.innerHTML = `
      <td colspan="10"><strong>Totals</strong></td>
      <td class="col-model"><strong>${Number(data.totals?.model_pct_total || 0).toFixed(2)}%</strong></td>
      <td class="col-book"><strong>${Number(data.totals?.bookmaker_pct_total || 0).toFixed(2)}%</strong></td>
      <td></td>
      <td></td>
    `;
    tipsBody.appendChild(sum);
  }
}

async function loadTipsForSelectedRace() {
  if (!selectedRaceId) {
    tipsBody.innerHTML = "";
    tipsTable.style.display = "none";
    selectedRaceHeaderMeta = null;
    renderSelectedRaceTitle();
    if (raceMetaName) raceMetaName.textContent = "-";
    if (raceMetaStarters) raceMetaStarters.textContent = "-";
    if (raceMetaPrize) raceMetaPrize.textContent = "-";
    if (raceMetaRating) raceMetaRating.textContent = "-";
    if (raceMetaJumpLocal) raceMetaJumpLocal.textContent = "-";
    if (raceMetaToJump) raceMetaToJump.textContent = "-";
    if (raceMetaOverround) raceMetaOverround.textContent = "-";
    selectedRaceJumpIso = null;
    lastBoardData = null;
    return;
  }

  if (boardLoading) boardLoading.hidden = false;
  tipsTable.style.display = "none";

  const books = encodeURIComponent(selectedBookString());
  const data = await jsonFetch(`/api/races/${selectedRaceId}/board?min_edge=0&books=${books}`);
  lastBoardData = data;

  if (boardLoading) boardLoading.hidden = true;

  selectedRaceHeaderMeta = {
    track: data.race.track,
    race_number: data.race.race_number,
    distance_m: data.race.distance_m,
    track_rating: data.race.track_rating || "-",
  };
  renderSelectedRaceTitle();
  if (raceMetaName) raceMetaName.textContent = data.race.race_name || "-";
  if (raceMetaStarters) raceMetaStarters.textContent = String(data.race.starters ?? "-");
  if (raceMetaPrize) {
    const prize = Number(data.race.prize_pool || 0);
    raceMetaPrize.textContent = prize > 0 ? `$${prize.toLocaleString()}` : "-";
  }
  if (raceMetaRating) raceMetaRating.textContent = data.race.track_rating || "-";
  selectedRaceJumpIso = `${data.race.race_date}T${data.race.jump_time}:00`;
  if (raceMetaJumpLocal) raceMetaJumpLocal.textContent = localJumpLabel(data.race.race_date, data.race.jump_time);
  if (raceMetaToJump) raceMetaToJump.textContent = countdownLabel(data.race.race_date, data.race.jump_time);

  if (raceMetaOverround) {
    const ovr = Number(data.totals?.bookmaker_pct_total || 0);
    raceMetaOverround.textContent = `${ovr.toFixed(1)}%`;
    raceMetaOverround.className = ovr < 110 ? "overround-good" : ovr > 120 ? "overround-bad" : "";
  }

  renderBoardRows(data);
  renderRaceResults(data.results);
}

async function loadTracked() {
  const data = await jsonFetch("/api/tips/tracked");
  const prevCount = trackedTipsCache.length;
  trackedTipsCache = data.tips || [];
  renderBetSlip();

  if (trackedTipsCache.length > prevCount && betSlipCount) {
    betSlipCount.classList.remove("slip-pulse");
    void betSlipCount.offsetWidth;
    betSlipCount.classList.add("slip-pulse");
  }
}

function renderBetSlip() {
  if (!betSlipNext || !betSlipDone || !betSlipCount) return;
  const selectedDay = raceDateInput?.value || todayIso();
  const dayBets = trackedTipsCache.filter((t) => localDayIso(t.tracked_at) === selectedDay);
  const now = Date.now();
  const nextToGo = dayBets
    .filter((t) => t.result === "pending" && new Date(`${t.race_date}T${t.jump_time}:00`).getTime() >= now)
    .sort((a, b) => new Date(`${a.race_date}T${a.jump_time}:00`) - new Date(`${b.race_date}T${b.jump_time}:00`));
  const completed = dayBets
    .filter((t) => !(t.result === "pending" && new Date(`${t.race_date}T${t.jump_time}:00`).getTime() >= now))
    .sort((a, b) => new Date(`${b.race_date}T${b.jump_time}:00`) - new Date(`${a.race_date}T${a.jump_time}:00`));
  const totalStake = dayBets.reduce((acc, b) => acc + Number(b.stake || 0), 0);
  const pendingStake = nextToGo.reduce((acc, b) => acc + Number(b.stake || 0), 0);
  const potentialReturn = nextToGo.reduce((acc, b) => acc + Number(b.stake || 0) * Number(b.odds_at_tip || 0), 0);

  betSlipCount.textContent = String(nextToGo.length);
  if (betSlipSummary) {
    betSlipSummary.innerHTML = `
      <div>Daily tracked: <strong>${dayBets.length}</strong></div>
      <div>Daily staked: <strong>${totalStake.toFixed(2)}u</strong></div>
      <div>Next-to-go staked: <strong>${pendingStake.toFixed(2)}u</strong></div>
    `;
  }
  if (betSlipPotential) {
    if (nextToGo.length > 0) {
      betSlipPotential.style.display = "";
      betSlipPotential.innerHTML = `<div>Potential return: <span class="betslip-potential">${potentialReturn.toFixed(2)}u</span></div>`;
    } else {
      betSlipPotential.style.display = "none";
    }
  }

  function renderSlipItems(target, rows, emptyText, showProfitLoss = false) {
    target.innerHTML = "";
    if (!rows.length) {
      target.innerHTML = `<div class="betslip-empty">${emptyText}</div>`;
      return;
    }
    rows.forEach((b) => {
    const pl = profitLossUnits(b);
    const plText = pl == null ? "P/L: -" : `P/L: ${pl >= 0 ? "+" : ""}${pl.toFixed(2)}u`;
    const plClass = pl == null ? "edge-neutral" : edgeClass(pl);
    const potentialPayout = b.result === "pending" ? Number(b.stake || 0) * Number(b.odds_at_tip || 0) : 0;
    const potentialHtml = b.result === "pending" && potentialPayout > 0 ? `<div class="betslip-row"><span>Potential: <span class="betslip-potential">${potentialPayout.toFixed(2)}u</span></span></div>` : "";
    const item = document.createElement("div");
    item.className = "betslip-item";
    item.innerHTML = `
      <div class="betslip-row">
        <span>${b.track} R${b.race_number}</span>
        <span class="betslip-time" data-jump="${b.race_date}T${b.jump_time}:00">${countdownLabel(b.race_date, b.jump_time)}</span>
      </div>
      <div class="betslip-horse">${escapeHtml(b.horse_name)}</div>
      <div class="betslip-row">
        <span>${escapeHtml(bookSymbol[b.bookmaker] || b.bookmaker)} @ ${formatOdds(Number(b.odds_at_tip))} | ${Number(b.stake || 0).toFixed(2)}u</span>
        <span class="${showProfitLoss ? plClass : edgeClass(Number(b.edge_pct))}">${showProfitLoss ? plText : `${Number(b.edge_pct).toFixed(2)}%`}</span>
      </div>
      ${potentialHtml}
      <div class="betslip-actions">
        <button class="betslip-icon-btn" data-edit-bet="1" title="Edit tracked bet">\u270E</button>
        <button class="betslip-icon-btn" data-delete-bet="1" title="Delete tracked bet">\uD83D\uDDD1</button>
      </div>
    `;
    item.querySelector("[data-edit-bet='1']").addEventListener("click", () => {
      openTrackModal({
        mode: "edit",
        bet_id: b.id,
        odds_at_tip: b.odds_at_tip,
        stake: b.stake || 0,
        horse_name: b.horse_name,
        track: b.track,
        race_number: b.race_number,
      });
    });
    item.querySelector("[data-delete-bet='1']").addEventListener("click", async () => {
      const ok = confirm(`Delete tracked bet for ${b.horse_name}?`);
      if (!ok) return;
      await jsonFetch(`/api/tips/tracked/${b.id}`, { method: "DELETE" });
      showToast("Bet deleted", "success");
      await loadTracked();
    });
    target.appendChild(item);
    });
  }

  renderSlipItems(betSlipNext, nextToGo, "No upcoming tracked bets.");
  renderSlipItems(betSlipDone, completed, "No completed bets.", true);

  if (betSlipScrollHint) {
    const overflow = (betSlipNext.scrollHeight > betSlipNext.clientHeight) || (betSlipDone.scrollHeight > betSlipDone.clientHeight);
    betSlipScrollHint.hidden = !overflow;
  }
}

function tickMatrixCountdowns() {
  matrixWrap.querySelectorAll("button[data-jump-iso]").forEach((btn) => {
    const iso = btn.getAttribute("data-jump-iso");
    const timeEl = btn.querySelector("[data-countdown]");
    const status = raceStatusClass(iso);
    btn.classList.remove("race-upcoming", "race-imminent", "race-live", "race-jumped");
    btn.classList.add(status);
    if (timeEl) timeEl.textContent = formatCountdown(iso);
  });
}

function tickLastUpdated() {
  if (!lastRefreshTime || !lastUpdatedEl) return;
  const secs = Math.floor((Date.now() - lastRefreshTime) / 1000);
  lastUpdatedEl.textContent = secs < 5 ? "Just updated" : `Updated ${secs}s ago`;
}

function computeKelly(edgePct, decimalOdds) {
  const bankroll = Number(localStorage.getItem("horse_bankroll_units") || "100");
  const b = decimalOdds - 1;
  if (b <= 0 || edgePct == null) return null;
  const p = (1 / decimalOdds) * (1 + edgePct / 100);
  const q = 1 - p;
  const kelly = (b * p - q) / b;
  if (kelly <= 0) return null;
  return ((kelly * 0.5) * bankroll).toFixed(2); // half-Kelly for safety
}

function tickBetSlipCountdowns() {
  if (!betSlipNext && !betSlipDone) return;
  const now = Date.now();
  document.querySelectorAll("#betSlipNext [data-jump], #betSlipDone [data-jump]").forEach((el) => {
    const target = new Date(el.getAttribute("data-jump")).getTime();
    const diff = target - now;
    const mins = Math.floor(Math.abs(diff) / 60000);
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    el.textContent = diff >= 0 ? (hh > 0 ? `${hh}h ${mm}m` : `${mm}m`) : "jumped";
  });
}

function tickSelectedRaceCountdown() {
  if (!selectedRaceJumpIso) return;
  const c = countdownFromIso(selectedRaceJumpIso);
  if (raceMetaToJump) raceMetaToJump.textContent = c;
  renderSelectedRaceTitle();
}

async function simulateMove() {
  if (!selectedRaceId) return;
  await jsonFetch(`/api/races/${selectedRaceId}/simulate-odds-move`, { method: "POST" });
  showToast("Odds move simulated", "info");
  await loadRaceData();
  await loadTipsForSelectedRace();
}

async function simulateResult() {
  if (!selectedRaceId) return;
  const data = await jsonFetch(`/api/races/${selectedRaceId}/simulate-result`, { method: "POST" });
  const s = data.settlement || {};
  showToast(`Result simulated: ${s.won || 0} won, ${s.lost || 0} lost`, "success");
  await loadRaceData();
  await loadTipsForSelectedRace();
  await loadTracked();
}

function renderRaceResults(results) {
  if (!raceResultsEl) return;
  if (!results || !results.length) {
    raceResultsEl.hidden = true;
    return;
  }
  raceResultsEl.hidden = false;
  const sorted = [...results].sort((a, b) => a.finish_pos - b.finish_pos);
  raceResultsEl.innerHTML = `<h3>Race Results</h3><div class="results-grid">${sorted.map((r) => {
    const cls = r.finish_pos === 1 ? "result-item result-winner" : "result-item";
    return `<div class="${cls}"><span class="result-pos">${r.finish_pos}</span><span class="result-name">${escapeHtml(r.horse_name)}</span></div>`;
  }).join("")}</div>`;
}

refreshTipsBtn.addEventListener("click", async () => {
  await loadRaceData();
  await loadTipsForSelectedRace();
});

simulateMoveBtn.addEventListener("click", simulateMove);
simulateResultBtn?.addEventListener("click", simulateResult);
modalSaveBtn?.addEventListener("click", saveTrackedBetFromModal);
modalCancelBtn?.addEventListener("click", closeTrackModal);
trackModal?.addEventListener("click", (e) => {
  if (e.target === trackModal) closeTrackModal();
});

valueFilterBtn?.addEventListener("click", () => {
  valueFilterActive = !valueFilterActive;
  valueFilterBtn.classList.toggle("active", valueFilterActive);
  valueFilterBtn.textContent = valueFilterActive ? "Show all runners" : "Value bets only";
  if (lastBoardData) renderBoardRows(lastBoardData);
});

[filterDistanceEl, filterTrackEl, filterRunsBackEl].forEach((el) => {
  el?.addEventListener("change", () => refreshOpenDetail());
});

betSlipClearAll?.addEventListener("click", async () => {
  const selectedDay = raceDateInput?.value || todayIso();
  const dayBets = trackedTipsCache.filter((t) => localDayIso(t.tracked_at) === selectedDay && t.result === "pending");
  if (!dayBets.length) return;
  const ok = confirm(`Delete all ${dayBets.length} pending bets for today?`);
  if (!ok) return;
  for (const b of dayBets) {
    await jsonFetch(`/api/tips/tracked/${b.id}`, { method: "DELETE" });
  }
  showToast("All pending bets cleared", "success");
  await loadTracked();
});

mobileSlipBtn?.addEventListener("click", () => {
  document.getElementById("betSlip")?.scrollIntoView({ behavior: "smooth" });
});

raceDateInput.addEventListener("change", async () => {
  saveFilter("board", "date", raceDateInput.value);
  await loadRaceData();
  await loadTipsForSelectedRace();
  renderBetSlip();
});

document.querySelectorAll("#tipsTable thead th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.getAttribute("data-sort");
    if (boardSortKey === key) {
      boardSortAsc = !boardSortAsc;
    } else {
      boardSortKey = key;
      boardSortAsc = false;
    }
    if (lastBoardData) renderBoardRows(lastBoardData);
  });
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.key === "Escape") {
    document.querySelectorAll(".modal:not(.hidden)").forEach((m) => m.classList.add("hidden"));
    return;
  }
  if (e.key === "r" || e.key === "R") {
    loadRaceData().then(() => loadTipsForSelectedRace()).then(() => loadTracked());
    return;
  }
  if (e.key >= "1" && e.key <= "5") {
    const pages = ["/", "/tips", "/my-bets", "/stats", "/settings"];
    window.location.href = pages[Number(e.key) - 1];
  }
});

async function init() {
  syncThemeMode();
  const savedDate = loadFilter("board", "date", "");
  raceDateInput.value = savedDate || todayIso();
  await loadBookmakers();
  await loadRaceData();
  await loadTipsForSelectedRace();
  await loadTracked();
  setInterval(async () => {
    await loadRaceData();
    await loadTipsForSelectedRace();
    await loadTracked();
  }, 30000);
  setInterval(tickBetSlipCountdowns, 1000);
  setInterval(tickSelectedRaceCountdown, 1000);
  setInterval(tickMatrixCountdowns, 1000);
  setInterval(tickLastUpdated, 1000);
}

init().catch((err) => {
  console.error(err);
  showToast(`Failed to initialize: ${err.message}`, "error");
});
