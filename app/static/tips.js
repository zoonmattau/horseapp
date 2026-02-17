const raceDateInput = document.getElementById("raceDate");
const minEdgeInput = document.getElementById("minEdge");
const booksContainer = document.getElementById("books");
const tipsBody = document.querySelector("#tipsTable tbody");
const tipsTable = document.getElementById("tipsTable");
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

function openTrackModal(payload) {
  pendingTrackPayload = payload;
  trackModalMeta.textContent = `${payload.track} R${payload.race_number} - ${payload.horse_name}`;
  modalOddsInput.value = Number(payload.odds_at_tip).toFixed(2);
  modalStakeInput.value = "1.00";
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
    tipsTable.style.display = "none";
    if (tipsEmpty) tipsEmpty.hidden = true;
  }
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

  timeSortHeader.textContent = `Jump Time ${timeSortAsc ? "\u25B2" : "\u25BC"}`;
  tipsBody.innerHTML = "";

  if (!tips.length) {
    tipsTable.style.display = "none";
    if (tipsEmpty) tipsEmpty.hidden = false;
    return;
  }

  tipsTable.style.display = "";
  if (tipsEmpty) tipsEmpty.hidden = true;

  notifyHighEdgeTips(tips);

  tips.forEach((tip) => {
    const edgeCls = Number(tip.edge_pct) > 0
      ? "edge-positive"
      : Number(tip.edge_pct) < 0
        ? "edge-negative"
        : "edge-neutral";
    const form = tip.form_last5 || "-";
    let formHtml = "";
    const lastIdx = form.length - 1;
    for (let i = 0; i < form.length; i++) {
      const ch = form[i];
      if (i === lastIdx && ch === "1") formHtml += `<span class="form-first-win">${ch}</span>`;
      else if (i === lastIdx && parseInt(ch) >= 4) formHtml += `<span class="form-first-bad">${ch}</span>`;
      else formHtml += ch;
    }
    if (!form || form === "-") formHtml = "-";
    function tipGrade(roi) {
      if (roi == null || roi <= 0) return "";
      return `<span class="stars" title="ROI: ${roi}%"><span class="star-filled">\u2605</span></span>`;
    }
    const tr = document.createElement("tr");
    if (Number(tip.edge_pct) > 5) tr.className = "row-value-strong";
    tr.innerHTML = `
      <td>${tip.track}</td>
      <td>R${tip.race_number}</td>
      <td>${tip.jump_time || "-"}</td>
      <td>${tip.horse_number}</td>
      <td>${tip.horse_name}</td>
      <td><span class="form-string">${formHtml}</span></td>
      <td>${tip.trainer}${tipGrade(tip.trainer_roi_pct)}</td>
      <td>${tip.jockey}${tipGrade(tip.jockey_roi_pct)}</td>
      <td>${formatOdds(Number(tip.market_odds))}</td>
      <td>${tip.best_book_symbol}</td>
      <td class="${edgeCls}">${Number(tip.edge_pct).toFixed(2)}%</td>
      <td><a href="${tip.bet_url}" target="_blank" rel="noreferrer">Bet</a></td>
      <td><button data-track-bet="1">+ Slip</button></td>
    `;
    tr.querySelector("button[data-track-bet='1']").addEventListener("click", () => {
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
    tipsBody.appendChild(tr);
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

timeSortHeader.addEventListener("click", async () => {
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
}

init().catch((err) => {
  console.error(err);
  showToast(`Failed to initialize: ${err.message}`, "error");
});
