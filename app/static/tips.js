const raceDateInput = document.getElementById("raceDate");
const minEdgeInput = document.getElementById("minEdge");
const booksContainer = document.getElementById("books");
const tipsBody = document.querySelector("#tipsTable tbody");
const timeSortHeader = document.getElementById("timeSortHeader");
const refreshTipsBtn = document.getElementById("refreshTips");
const selectAllBooksBtn = document.getElementById("selectAllBooks");
const clearAllBooksBtn = document.getElementById("clearAllBooks");
const trackModal = document.getElementById("trackModal");
const trackModalMeta = document.getElementById("trackModalMeta");
const modalOddsInput = document.getElementById("modalOdds");
const modalStakeInput = document.getElementById("modalStake");
const modalSaveBtn = document.getElementById("modalSave");
const modalCancelBtn = document.getElementById("modalCancel");

let bookmakers = [];
let selectedBooks = new Set();
let timeSortAsc = true;
let pendingTrackPayload = null;

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
    alert("Odds must be greater than 1.0");
    return;
  }
  if (stake < 0) {
    alert("Stake must be zero or greater");
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
}

async function loadBookmakers() {
  const data = await jsonFetch("/api/bookmakers");
  bookmakers = data.bookmakers.map((b) => b.id);
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

async function loadDailyTips() {
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

  timeSortHeader.textContent = `Jump Time ${timeSortAsc ? "ASC" : "DESC"}`;
  tipsBody.innerHTML = "";
  tips.forEach((tip) => {
    const edgeCls = Number(tip.edge_pct) > 0
      ? "edge-positive"
      : Number(tip.edge_pct) < 0
        ? "edge-negative"
        : "edge-neutral";
    const form = tip.form_last5 || "-";
    let formHtml = "";
    for (let i = 0; i < form.length; i++) {
      const ch = form[i];
      if (i === 0 && ch === "1") formHtml += `<span class="form-first-win">${ch}</span>`;
      else if (i === 0 && parseInt(ch) >= 4) formHtml += `<span class="form-first-bad">${ch}</span>`;
      else formHtml += ch;
    }
    if (!form || form === "-") formHtml = "-";
    const trainerSr = tip.trainer_strike_pct ? ` <span class="strike-rate">(${tip.trainer_strike_pct}%)</span>` : "";
    const jockeySr = tip.jockey_strike_pct ? ` <span class="strike-rate">(${tip.jockey_strike_pct}%)</span>` : "";
    const tr = document.createElement("tr");
    if (Number(tip.edge_pct) > 5) tr.className = "row-value-strong";
    tr.innerHTML = `
      <td>${tip.track}</td>
      <td>R${tip.race_number}</td>
      <td>${tip.jump_time || "-"}</td>
      <td>${tip.horse_number}</td>
      <td>${tip.horse_name}</td>
      <td><span class="form-string">${formHtml}</span></td>
      <td>${tip.trainer}${trainerSr}</td>
      <td>${tip.jockey}${jockeySr}</td>
      <td>$${Number(tip.market_odds).toFixed(2)}</td>
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

selectAllBooksBtn.addEventListener("click", () => {
  selectedBooks = new Set(bookmakers);
  renderBookmakers();
});

clearAllBooksBtn.addEventListener("click", () => {
  selectedBooks = new Set();
  renderBookmakers();
});

refreshTipsBtn.addEventListener("click", loadDailyTips);
timeSortHeader.addEventListener("click", async () => {
  timeSortAsc = !timeSortAsc;
  await loadDailyTips();
});

modalSaveBtn?.addEventListener("click", saveTrackedBetFromModal);
modalCancelBtn?.addEventListener("click", closeTrackModal);
trackModal?.addEventListener("click", (e) => {
  if (e.target === trackModal) closeTrackModal();
});

async function init() {
  raceDateInput.value = todayIso();
  await loadBookmakers();
  await loadDailyTips();
}

init().catch((err) => {
  console.error(err);
  alert(`Failed to initialize daily tips page: ${err.message}`);
});
