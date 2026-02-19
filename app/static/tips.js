const raceDateInput = document.getElementById("raceDate");
const minEdgeInput = document.getElementById("minEdge");
const booksContainer = document.getElementById("books");
const tipsContainer = document.getElementById("tipsContainer");
const tipsLoading = document.getElementById("tipsLoading");
const tipsEmpty = document.getElementById("tipsEmpty");
const tipCountBadge = document.getElementById("tipCountBadge");
const timeSortHeader = document.getElementById("timeSortHeader");
const refreshTipsBtn = document.getElementById("refreshTips");
const trackModal = document.getElementById("trackModal");
const trackModalMeta = document.getElementById("trackModalMeta");
const modalOddsInput = document.getElementById("modalOdds");
const modalStakeInput = document.getElementById("modalStake");
const modalSaveBtn = document.getElementById("modalSave");
const modalCancelBtn = document.getElementById("modalCancel");
const toastContainer = document.getElementById("toastContainer");

let bookmakers = [];
let bookSymbol = {};
let selectedBooks = new Set();
let timeSortAsc = true;
let pendingTrackPayload = null;

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function selectedBookString() {
  return Array.from(selectedBooks).join(",");
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
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
  if (!iso) return "status-upcoming";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < -180000) return "status-jumped";
  if (diff < 60000)   return "status-live";
  if (diff < 300000)  return "status-imminent";
  return "status-upcoming";
}

function computeKelly(edgePct, decimalOdds) {
  const bankroll = Number(localStorage.getItem("horse_bankroll_units") || "100");
  const b = decimalOdds - 1;
  if (b <= 0 || edgePct == null) return null;
  const p = (1 / decimalOdds) * (1 + edgePct / 100);
  const q = 1 - p;
  const kelly = (b * p - q) / b;
  if (kelly <= 0) return null;
  return ((kelly * 0.5) * bankroll).toFixed(2);
}

function tickTipsCountdowns() {
  document.querySelectorAll("[data-jump-iso]").forEach((el) => {
    const iso = el.getAttribute("data-jump-iso");
    const cdEl = el.querySelector("[data-countdown]");
    const badgeEl = el.querySelector(".race-status-badge");
    const status = raceStatusClass(iso);
    if (cdEl) cdEl.textContent = formatCountdown(iso);
    if (badgeEl) {
      badgeEl.className = `race-status-badge ${status}`;
      const labels = { "status-upcoming": "Upcoming", "status-imminent": "Imminent", "status-live": "Live", "status-jumped": "Jumped" };
      badgeEl.textContent = labels[status] || "Upcoming";
    }
  });
}

function openTrackModal(payload) {
  pendingTrackPayload = payload;
  trackModalMeta.textContent = `${payload.track} R${payload.race_number} - ${payload.horse_name}`;
  const odds = Number(payload.odds_at_tip);
  modalOddsInput.value = odds.toFixed(2);
  modalStakeInput.value = "1.00";

  const kellyHint = document.getElementById("kellyHint");
  if (kellyHint) {
    const k = computeKelly(payload.edge_pct, odds);
    if (k && Number(k) > 0) {
      kellyHint.hidden = false;
      kellyHint.innerHTML = `½ Kelly: <span class="kelly-value" id="kellyApply">${k}u</span>`;
      document.getElementById("kellyApply")?.addEventListener("click", () => {
        modalStakeInput.value = k;
      });
    } else {
      kellyHint.hidden = true;
    }
  }

  trackModal.classList.remove("hidden");
}

function closeTrackModal() {
  trackModal.classList.add("hidden");
  pendingTrackPayload = null;
}

async function saveTrackedBetFromModal() {
  if (!pendingTrackPayload) return;
  const odds = Number(modalOddsInput.value || "0");
  const stake = Number(modalStakeInput.value || "0");
  if (odds <= 1) {
    showToast("Odds must be greater than 1.0", "error");
    return;
  }
  if (stake < 0) {
    showToast("Stake must be zero or greater", "error");
    return;
  }

  await jsonFetch("/api/tips/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      race_id: pendingTrackPayload.race_id,
      runner_id: pendingTrackPayload.runner_id,
      bookmaker: pendingTrackPayload.bookmaker,
      edge_pct: pendingTrackPayload.edge_pct,
      odds_at_tip: odds,
      stake,
    }),
  });
  closeTrackModal();
  showToast("Bet added to slip", "success");
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

function setLoadingState(loading) {
  if (tipsLoading) tipsLoading.hidden = !loading;
  if (loading) {
    if (tipsContainer) tipsContainer.style.display = "none";
    if (tipsEmpty) tipsEmpty.hidden = true;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatFormString(form) {
  if (!form || form === "-") return "-";
  const last = form.length - 1;
  let html = "";
  for (let i = 0; i < form.length; i++) {
    const ch = form[i];
    if (i === last && ch === "1") html += `<span class="form-first-win">${ch}</span>`;
    else if (i === last && parseInt(ch) >= 4) html += `<span class="form-first-bad">${ch}</span>`;
    else html += ch;
  }
  return html;
}

function gradeHtml(roi) {
  if (roi == null || roi <= 0) return "";
  return `<span class="stars" title="ROI: ${roi}%"><span class="star-filled">★</span></span>`;
}

async function loadDailyTips() {
  setLoadingState(true);
  const date = raceDateInput.value || todayIso();
  const minEdge = Number(minEdgeInput.value || "0");
  const books = encodeURIComponent(selectedBookString());
  const data = await jsonFetch(`/api/tips/daily?race_date=${date}&min_edge=${minEdge}&books=${books}`);
  const tips = [...(data.tips || [])];
  tips.sort((a, b) => {
    const ta = `${a.race_date || date}T${a.jump_time || "23:59"}:00`;
    const tb = `${b.race_date || date}T${b.jump_time || "23:59"}:00`;
    const cmp = new Date(ta).getTime() - new Date(tb).getTime();
    return timeSortAsc ? cmp : -cmp;
  });

  setLoadingState(false);

  if (tipCountBadge) {
    tipCountBadge.textContent = String(tips.length);
    tipCountBadge.className = tips.length > 0 ? "badge badge-brand" : "badge badge-muted";
  }

  if (timeSortHeader) timeSortHeader.textContent = `Jump Time ${timeSortAsc ? "▲" : "▼"}`;

  if (!tipsContainer) return;
  tipsContainer.innerHTML = "";

  if (!tips.length) {
    tipsContainer.style.display = "none";
    if (tipsEmpty) tipsEmpty.hidden = false;
    return;
  }

  tipsContainer.style.display = "flex";
  if (tipsEmpty) tipsEmpty.hidden = true;

  notifyHighEdgeTips(tips);

  // Group tips by race
  const raceGroups = new Map();
  tips.forEach((tip) => {
    const key = `${tip.track}|${tip.race_number}|${tip.jump_time}`;
    if (!raceGroups.has(key)) raceGroups.set(key, { track: tip.track, race_number: tip.race_number, jump_time: tip.jump_time, distance_m: tip.distance_m, tips: [] });
    raceGroups.get(key).tips.push(tip);
  });

  raceGroups.forEach((group) => {
    const jumpIso = group.jump_time ? `${raceDateInput.value || todayIso()}T${group.jump_time}:00` : null;
    const status = jumpIso ? raceStatusClass(jumpIso) : "status-upcoming";
    const statusLabels = { "status-upcoming": "Upcoming", "status-imminent": "Imminent", "status-live": "Live", "status-jumped": "Jumped" };

    const groupEl = document.createElement("div");
    groupEl.className = "tips-race-group";

    const headerEl = document.createElement("div");
    headerEl.className = "tips-race-header";
    if (jumpIso) headerEl.setAttribute("data-jump-iso", jumpIso);
    headerEl.innerHTML = `
      <span class="tips-race-title">${escapeHtml(group.track)} R${group.race_number}</span>
      ${group.distance_m ? `<span class="tips-race-meta">${group.distance_m}m</span>` : ""}
      <span class="tips-race-countdown" data-countdown="1">${jumpIso ? formatCountdown(jumpIso) : (group.jump_time || "-")}</span>
      <span class="race-status-badge ${status}">${statusLabels[status] || "Upcoming"}</span>
    `;
    groupEl.appendChild(headerEl);

    const cardsRow = document.createElement("div");
    cardsRow.className = "tips-cards-row";

    group.tips.forEach((tip) => {
      const edgePct = Number(tip.edge_pct);
      const edgeCls = edgePct > 0 ? "edge-positive" : edgePct < 0 ? "edge-negative" : "edge-neutral";
      const isStrong = edgePct > 5;

      const card = document.createElement("div");
      card.className = `tip-card${isStrong ? " tip-edge-strong" : ""}`;
      card.innerHTML = `
        <div class="tip-card-top">
          <div class="tip-horse-info">
            <div class="tip-horse-name">#${tip.horse_number} ${escapeHtml(tip.horse_name)}</div>
            <div class="tip-horse-sub form-string">${formatFormString(tip.form_last5 || "-")}</div>
          </div>
        </div>
        <div class="tip-card-people">
          <span>J: ${escapeHtml(tip.jockey)}${gradeHtml(tip.jockey_roi_pct)}</span>
          <span>T: ${escapeHtml(tip.trainer)}${gradeHtml(tip.trainer_roi_pct)}</span>
        </div>
        <div class="tip-card-odds">
          <div class="tip-odds-block">
            <div class="tip-odds-label">Best Price</div>
            <div class="tip-odds-value">${formatOdds(Number(tip.market_odds))} <span class="tip-book-tag">${escapeHtml(tip.best_book_symbol || "")}</span></div>
          </div>
          <div class="tip-odds-block">
            <div class="tip-odds-label">Model Est.</div>
            <div class="tip-odds-value tip-odds-model">${formatOdds(Number(tip.predicted_price))}</div>
          </div>
          <div class="tip-odds-block">
            <div class="tip-odds-label">Edge</div>
            <div class="tip-odds-value ${edgePct > 0 ? "tip-edge-pos" : "tip-edge-neg"}">${edgePct > 0 ? "+" : ""}${edgePct.toFixed(1)}%</div>
          </div>
        </div>
        <div class="tip-card-actions">
          <a href="${escapeHtml(tip.bet_url)}" target="_blank" rel="noreferrer" class="btn btn-sm btn-ghost">Bet →</a>
          <button class="btn btn-sm btn-primary" data-track-bet="1">+ Slip</button>
        </div>
      `;

      card.querySelector("button[data-track-bet='1']").addEventListener("click", () => {
        openTrackModal({
          race_id: tip.race_id,
          runner_id: tip.runner_id,
          bookmaker: tip.best_bookmaker,
          edge_pct: tip.edge_pct,
          odds_at_tip: tip.market_odds,
          horse_name: tip.horse_name,
          track: tip.track,
          race_number: tip.race_number,
        });
      });

      cardsRow.appendChild(card);
    });

    groupEl.appendChild(cardsRow);
    tipsContainer.appendChild(groupEl);
  });
}

raceDateInput.addEventListener("change", () => saveFilter("tips", "date", raceDateInput.value));
minEdgeInput.addEventListener("change", () => saveFilter("tips", "minEdge", minEdgeInput.value));

refreshTipsBtn.addEventListener("click", () => {
  loadDailyTips().catch((err) => {
    console.error(err);
    showToast(`Failed to load tips: ${err.message}`, "error");
  });
});

timeSortHeader?.addEventListener("click", async () => {
  timeSortAsc = !timeSortAsc;
  await loadDailyTips();
});

modalSaveBtn?.addEventListener("click", () => {
  saveTrackedBetFromModal().catch((err) => {
    console.error(err);
    showToast(`Failed to save bet: ${err.message}`, "error");
  });
});
modalCancelBtn?.addEventListener("click", closeTrackModal);
trackModal?.addEventListener("click", (e) => {
  if (e.target === trackModal) closeTrackModal();
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.key === "Escape") {
    document.querySelectorAll(".modal:not(.hidden)").forEach((m) => m.classList.add("hidden"));
    return;
  }
  if (e.key === "r" || e.key === "R") {
    loadDailyTips().catch(console.error);
    return;
  }
  if (e.key >= "1" && e.key <= "5") {
    const pages = ["/", "/tips", "/my-bets", "/stats", "/settings"];
    window.location.href = pages[Number(e.key) - 1];
  }
});

function notifyHighEdgeTips(tips) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const enabled = localStorage.getItem("horse_notifications_enabled");
  if (enabled === "0") return;
  const minEdge = Number(localStorage.getItem("horse_notify_min_edge") || "5");
  const hot = tips.filter((t) => Number(t.edge_pct) >= minEdge);
  if (!hot.length) return;
  const top5 = hot.slice(0, 5);
  const body = top5.map((t) => `${t.track} R${t.race_number} ${t.horse_name} (${Number(t.edge_pct).toFixed(1)}%)`).join("\n");
  new Notification("HorseEdge - High Edge Tips", { body, tag: "horseedge-tips" });
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  const enabled = localStorage.getItem("horse_notifications_enabled");
  if (enabled === "0") return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

async function init() {
  applyThemeFromPreference();
  await requestNotificationPermission();
  const savedDate = loadFilter("tips", "date", "");
  raceDateInput.value = savedDate || todayIso();
  const savedMinEdge = loadFilter("tips", "minEdge", "");
  if (savedMinEdge) minEdgeInput.value = savedMinEdge;
  await loadBookmakers();
  await loadDailyTips();
  setInterval(() => {
    loadDailyTips().catch(console.error);
  }, 60000);
  setInterval(tickTipsCountdowns, 1000);
}

init().catch((err) => {
  console.error(err);
  showToast(`Failed to initialize: ${err.message}`, "error");
});
