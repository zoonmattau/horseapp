const raceDateInput = document.getElementById("raceDate");
const booksContainer = document.getElementById("books");
const tipsBody = document.querySelector("#tipsTable tbody");
const trackedBody = document.querySelector("#trackedTable tbody");
const matrixWrap = document.getElementById("matrixWrap");
const selectedRaceTitle = document.getElementById("selectedRaceTitle");
const raceMetaName = document.getElementById("raceMetaName");
const raceMetaStarters = document.getElementById("raceMetaStarters");
const raceMetaPrize = document.getElementById("raceMetaPrize");
const raceMetaRating = document.getElementById("raceMetaRating");
const raceMetaJumpLocal = document.getElementById("raceMetaJumpLocal");
const raceMetaToJump = document.getElementById("raceMetaToJump");
const betSlipList = document.getElementById("betSlipList");
const betSlipCount = document.getElementById("betSlipCount");
const betSlipSummary = document.getElementById("betSlipSummary");
const trackModal = document.getElementById("trackModal");
const trackModalMeta = document.getElementById("trackModalMeta");
const modalOddsInput = document.getElementById("modalOdds");
const modalStakeInput = document.getElementById("modalStake");
const modalSaveBtn = document.getElementById("modalSave");
const modalCancelBtn = document.getElementById("modalCancel");
const refreshTipsBtn = document.getElementById("refreshTips");
const simulateMoveBtn = document.getElementById("simulateMove");
const selectAllBooksBtn = document.getElementById("selectAllBooks");
const clearAllBooksBtn = document.getElementById("clearAllBooks");

let bookmakers = [];
let bookSymbol = {};
let selectedBooks = new Set();
let selectedRaceId = null;
let openDetailKey = null;
let racesForDay = [];
let tipSignals = {};
let trackedTipsCache = [];
let pendingTrackPayload = null;
let selectedRaceJumpIso = null;
let selectedRaceHeaderMeta = null;

function syncThemeMode() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
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

function toJumpCountdown(raceDate, jumpTime) {
  if (!raceDate || !jumpTime) return "-";
  const target = new Date(`${raceDate}T${jumpTime}:00`);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const absMinutes = Math.floor(Math.abs(diffMs) / 60000);
  const h = Math.floor(absMinutes / 60);
  const m = absMinutes % 60;
  if (diffMs >= 0) {
    if (h > 0) return `in ${h}h ${m}m`;
    return `in ${m}m`;
  }
  if (h > 0) return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

function countdownLabel(raceDate, jumpTime) {
  if (!raceDate || !jumpTime) return "-";
  const target = new Date(`${raceDate}T${jumpTime}:00`);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  const mins = Math.floor(Math.abs(diff) / 60000);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  if (diff >= 0) return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
  return "jumped";
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

function countdownFromIso(iso) {
  if (!iso) return "-";
  const target = new Date(iso);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  const mins = Math.floor(Math.abs(diff) / 60000);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return diff >= 0 ? (hh > 0 ? `${hh}h ${mm}m` : `${mm}m`) : "jumped";
}

function renderSelectedRaceTitle() {
  if (!selectedRaceTitle) return;
  if (!selectedRaceHeaderMeta) {
    selectedRaceTitle.textContent = "Race Details";
    return;
  }
  const c = countdownFromIso(selectedRaceJumpIso);
  const jumpPhrase = c === "jumped" ? "Jumped" : `${c} to jump`;
  selectedRaceTitle.textContent =
    `${selectedRaceHeaderMeta.track} R${selectedRaceHeaderMeta.race_number} ` +
    `(${selectedRaceHeaderMeta.distance_m}m) • ${selectedRaceHeaderMeta.track_rating} • ${jumpPhrase}`;
}

function edgeClass(value) {
  if (value > 0) return "edge-positive";
  if (value < 0) return "edge-negative";
  return "edge-neutral";
}

function openTrackModal(payload) {
  pendingTrackPayload = payload;
  if (trackModalMeta) {
    trackModalMeta.textContent = `${payload.track || ""} R${payload.race_number || ""} - ${payload.horse_name || ""}`;
  }
  if (modalOddsInput) modalOddsInput.value = Number(payload.odds_at_tip || payload.market_odds || 0).toFixed(2);
  if (modalStakeInput) modalStakeInput.value = "1.00";
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
    alert("Odds must be greater than 1.0");
    return;
  }
  if (stake < 0) {
    alert("Stake must be zero or greater");
    return;
  }
  const params = new URLSearchParams({
    race_id: String(pendingTrackPayload.race_id),
    runner_id: String(pendingTrackPayload.runner_id),
    bookmaker: pendingTrackPayload.bookmaker,
    edge_pct: String(pendingTrackPayload.edge_pct),
    odds_at_tip: String(odds),
    stake: String(stake),
  });
  await jsonFetch(`/api/tips/track?${params.toString()}`, { method: "POST" });
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
    const wrap = document.createElement("label");
    wrap.style.display = "flex";
    wrap.style.gap = "6px";
    wrap.style.alignItems = "center";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedBooks.has(book);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedBooks.add(book);
      else selectedBooks.delete(book);
    });

    wrap.appendChild(checkbox);
    wrap.appendChild(document.createTextNode(book));
    booksContainer.appendChild(wrap);
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

  if (!selectedRaceId || !racesForDay.some((r) => String(r.id) === String(selectedRaceId))) {
    selectedRaceId = racesForDay.length ? racesForDay[0].id : null;
  }

  renderMatrix();
}

function renderMatrix() {
  if (!racesForDay.length) {
    matrixWrap.innerHTML = "No races for this date.";
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
        const jump = toJumpCountdown(race.race_date, race.jump_time);
        td.innerHTML = `
          <button class="matrix-btn ${selectedClass}" data-race-id="${race.id}">
            ${icon}
            <span class="matrix-time">${escapeHtml(jump)}</span>
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

function renderDetailsTable(title, rows) {
  const body = rows.join("") || `<tr><td colspan="8">No history available.</td></tr>`;
  return `
    <div class="details-card">
      <div class="details-title">${escapeHtml(title)}</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Horse</th>
            <th>Track</th>
            <th>Distance</th>
            <th>Finish</th>
            <th>SP</th>
            <th>Weight</th>
            <th>Jockey</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

async function openInlineDetails(anchorRow, key, buildHtml) {
  const existing = tipsBody.querySelector("tr.details-row");
  if (existing) existing.remove();
  if (openDetailKey === key) {
    openDetailKey = null;
    return;
  }

  const detailRow = document.createElement("tr");
  detailRow.className = "details-row";
  detailRow.innerHTML = `<td colspan="11">Loading history...</td>`;
  anchorRow.insertAdjacentElement("afterend", detailRow);

  try {
    detailRow.innerHTML = `<td colspan="11">${await buildHtml()}</td>`;
    openDetailKey = key;
  } catch (err) {
    detailRow.innerHTML = `<td colspan="11">Failed to load history.</td>`;
    openDetailKey = key;
    console.error(err);
  }
}

async function loadTipsForSelectedRace() {
  if (!selectedRaceId) {
    tipsBody.innerHTML = "";
    selectedRaceHeaderMeta = null;
    renderSelectedRaceTitle();
    if (raceMetaName) raceMetaName.textContent = "-";
    if (raceMetaStarters) raceMetaStarters.textContent = "-";
    if (raceMetaPrize) raceMetaPrize.textContent = "-";
    if (raceMetaRating) raceMetaRating.textContent = "-";
    if (raceMetaJumpLocal) raceMetaJumpLocal.textContent = "-";
    if (raceMetaToJump) raceMetaToJump.textContent = "-";
    selectedRaceJumpIso = null;
    return;
  }

  const books = encodeURIComponent(selectedBookString());
  const data = await jsonFetch(`/api/races/${selectedRaceId}/board?min_edge=0&books=${books}`);
  tipsBody.innerHTML = "";
  openDetailKey = null;

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

  data.rows.forEach((tip) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tip.horse_number}</td>
      <td>${tip.barrier}</td>
      <td><button data-history="1">${escapeHtml(tip.horse_name)}</button></td>
      <td><button data-trainer="1">${escapeHtml(tip.trainer)}</button></td>
      <td><button data-jockey="1">${escapeHtml(tip.jockey)}</button></td>
      <td>$${tip.predicted_price.toFixed(2)}</td>
      <td>$${tip.market_odds.toFixed(2)}</td>
      <td>${escapeHtml(tip.best_book_symbol)}</td>
      <td>${Number(tip.model_prob_pct || 0).toFixed(2)}%</td>
      <td>${Number(tip.predicted_price_pct || 0).toFixed(2)}%</td>
      <td class="${edgeClass(tip.edge_pct)}">${tip.edge_pct.toFixed(2)}%</td>
      <td><a href="${escapeHtml(tip.bet_url)}" target="_blank" rel="noreferrer">Bet</a></td>
      <td><button data-track="1">Track</button></td>
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
        const rows = history.runs.map(
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
        return renderDetailsTable(`Horse History - ${tip.horse_name}`, rows);
      });
    });

    tr.querySelector("button[data-trainer='1']").addEventListener("click", async () => {
      const key = `trainer:${tip.trainer}`;
      await openInlineDetails(tr, key, async () => {
        const history = await jsonFetch(`/api/trainers/history?name=${encodeURIComponent(tip.trainer)}`);
        const rows = history.runs.map(
          (run) => `
            <tr>
              <td>${escapeHtml(run.run_date)}</td>
              <td>${escapeHtml(run.horse_name)}</td>
              <td>${escapeHtml(run.track)}</td>
              <td>${escapeHtml(run.distance_m)}m</td>
              <td>${escapeHtml(run.finish_pos)}</td>
              <td>$${Number(run.starting_price).toFixed(2)}</td>
              <td>-</td>
              <td>-</td>
            </tr>
          `
        );
        return renderDetailsTable(`Trainer History - ${tip.trainer}`, rows);
      });
    });

    tr.querySelector("button[data-jockey='1']").addEventListener("click", async () => {
      const key = `jockey:${tip.jockey}`;
      await openInlineDetails(tr, key, async () => {
        const history = await jsonFetch(`/api/jockeys/history?name=${encodeURIComponent(tip.jockey)}`);
        const rows = history.runs.map(
          (run) => `
            <tr>
              <td>${escapeHtml(run.run_date)}</td>
              <td>${escapeHtml(run.horse_name)}</td>
              <td>${escapeHtml(run.track)}</td>
              <td>${escapeHtml(run.distance_m)}m</td>
              <td>${escapeHtml(run.finish_pos)}</td>
              <td>$${Number(run.starting_price).toFixed(2)}</td>
              <td>-</td>
              <td>${escapeHtml(tip.jockey)}</td>
            </tr>
          `
        );
        return renderDetailsTable(`Jockey History - ${tip.jockey}`, rows);
      });
    });

    tipsBody.appendChild(tr);
  });
}

async function loadTracked() {
  const data = await jsonFetch("/api/tips/tracked");
  trackedTipsCache = data.tips || [];
  trackedBody.innerHTML = "";
  trackedTipsCache.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(t.tracked_at).toLocaleString()}</td>
      <td>${t.race_id}</td>
      <td>${escapeHtml(t.horse_name)}</td>
      <td>${escapeHtml(bookSymbol[t.bookmaker] || t.bookmaker)}</td>
      <td>${Number(t.edge_pct).toFixed(2)}%</td>
      <td>$${Number(t.odds_at_tip).toFixed(2)}</td>
      <td>${escapeHtml(t.result)}</td>
    `;
    trackedBody.appendChild(tr);
  });
  renderBetSlip();
}

function renderBetSlip() {
  if (!betSlipList || !betSlipCount) return;
  const selectedDay = raceDateInput?.value || todayIso();
  const dayBets = trackedTipsCache.filter((t) => localDayIso(t.tracked_at) === selectedDay);
  const pending = dayBets.filter((t) => t.result === "pending");
  const totalStake = dayBets.reduce((acc, b) => acc + Number(b.stake || 0), 0);
  const pendingStake = pending.reduce((acc, b) => acc + Number(b.stake || 0), 0);

  betSlipCount.textContent = String(pending.length);
  if (betSlipSummary) {
    betSlipSummary.innerHTML = `
      <div>Daily tracked: <strong>${dayBets.length}</strong></div>
      <div>Daily staked: <strong>${totalStake.toFixed(2)}u</strong></div>
      <div>Pending staked: <strong>${pendingStake.toFixed(2)}u</strong></div>
    `;
  }

  betSlipList.innerHTML = "";
  if (!pending.length) {
    betSlipList.innerHTML = `<div class="betslip-empty">No pending tracked bets.</div>`;
    return;
  }

  pending.slice(0, 10).forEach((b) => {
    const item = document.createElement("div");
    item.className = "betslip-item";
    item.innerHTML = `
      <div class="betslip-row">
        <span>${b.track} R${b.race_number}</span>
        <span class="betslip-time" data-jump="${b.race_date}T${b.jump_time}:00">${countdownLabel(b.race_date, b.jump_time)}</span>
      </div>
      <div class="betslip-horse">${escapeHtml(b.horse_name)}</div>
      <div class="betslip-row">
        <span>${escapeHtml(bookSymbol[b.bookmaker] || b.bookmaker)} @ $${Number(b.odds_at_tip).toFixed(2)} | ${Number(b.stake || 0).toFixed(2)}u</span>
        <span class="${edgeClass(Number(b.edge_pct))}">${Number(b.edge_pct).toFixed(2)}%</span>
      </div>
    `;
    betSlipList.appendChild(item);
  });
}

function tickBetSlipCountdowns() {
  if (!betSlipList) return;
  const now = Date.now();
  betSlipList.querySelectorAll("[data-jump]").forEach((el) => {
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
  await loadRaceData();
  await loadTipsForSelectedRace();
}

selectAllBooksBtn.addEventListener("click", async () => {
  selectedBooks = new Set(bookmakers);
  renderBookmakers();
  await loadRaceData();
  await loadTipsForSelectedRace();
});

clearAllBooksBtn.addEventListener("click", async () => {
  selectedBooks = new Set();
  renderBookmakers();
  matrixWrap.innerHTML = "Select at least one bookmaker.";
  tipsBody.innerHTML = "";
  selectedRaceHeaderMeta = null;
  selectedRaceJumpIso = null;
  renderSelectedRaceTitle();
});

refreshTipsBtn.addEventListener("click", async () => {
  await loadRaceData();
  await loadTipsForSelectedRace();
});

simulateMoveBtn.addEventListener("click", simulateMove);
modalSaveBtn?.addEventListener("click", saveTrackedBetFromModal);
modalCancelBtn?.addEventListener("click", closeTrackModal);
trackModal?.addEventListener("click", (e) => {
  if (e.target === trackModal) closeTrackModal();
});

raceDateInput.addEventListener("change", async () => {
  await loadRaceData();
  await loadTipsForSelectedRace();
  renderBetSlip();
});

async function init() {
  syncThemeMode();
  raceDateInput.value = todayIso();
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
}

init().catch((err) => {
  console.error(err);
  alert(`Failed to initialize app: ${err.message}`);
});
