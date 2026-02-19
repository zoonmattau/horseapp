const toastContainer = document.getElementById("toastContainer");
const dashLastUpdated = document.getElementById("dashLastUpdated");

let lastRefreshTime = null;

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

function syncTheme() {
  const pref = (localStorage.getItem("horse_theme_pref") || "system").toLowerCase();
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    if (pref === "light" || pref === "dark") document.documentElement.setAttribute("data-theme", pref);
    else document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
  };
  apply();
  mq.addEventListener("change", apply);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function jsonFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatOdds(decimalOdds) {
  const fmt = (localStorage.getItem("horse_odds_format") || "decimal").toLowerCase();
  if (fmt === "american") {
    if (decimalOdds >= 2.0) return `+${Math.round((decimalOdds - 1) * 100)}`;
    if (decimalOdds > 1.0) return `-${Math.round(100 / (decimalOdds - 1))}`;
    return "+0";
  }
  return `$${Number(decimalOdds).toFixed(2)}`;
}

function setGreeting() {
  const h = new Date().getHours();
  const el = document.getElementById("timeOfDay");
  if (el) el.textContent = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function setDate() {
  const el = document.getElementById("todayDate");
  if (el) el.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function tickCountdowns() {
  document.querySelectorAll("[data-cd-iso]").forEach((el) => {
    const iso = el.getAttribute("data-cd-iso");
    el.textContent = formatCountdown(iso);
  });
  if (lastRefreshTime && dashLastUpdated) {
    const secs = Math.floor((Date.now() - lastRefreshTime) / 1000);
    dashLastUpdated.textContent = secs < 5 ? "Just updated" : `Updated ${secs}s ago`;
  }
}

async function loadDashboard() {
  const today = todayIso();

  const [racesResp, tipsResp, betsResp] = await Promise.all([
    jsonFetch(`/api/races?race_date=${today}`),
    jsonFetch(`/api/tips/daily?race_date=${today}&min_edge=1&books=`).catch(() => ({ tips: [] })),
    jsonFetch("/api/tips/tracked").catch(() => ({ tips: [] })),
  ]);

  lastRefreshTime = Date.now();

  const races = racesResp.races || [];
  const tips = tipsResp.tips || [];
  const allBets = betsResp.tips || [];

  // --- KPIs ---
  const highEdge = tips.filter((t) => Number(t.edge_pct) >= 5);
  const kpiTipsCount = document.getElementById("kpiTipsCount");
  const kpiHighEdgeSub = document.getElementById("kpiHighEdgeSub");
  if (kpiTipsCount) kpiTipsCount.textContent = String(tips.length);
  if (kpiHighEdgeSub) kpiHighEdgeSub.textContent = `${highEdge.length} high edge (≥5%)`;

  // Next race
  const now = Date.now();
  const upcoming = races
    .filter((r) => new Date(`${r.race_date}T${r.jump_time}:00`).getTime() > now - 60000)
    .sort((a, b) => new Date(`${a.race_date}T${a.jump_time}:00`) - new Date(`${b.race_date}T${b.jump_time}:00`));
  const next = upcoming[0];
  const kpiNextRace = document.getElementById("kpiNextRace");
  const kpiNextRaceSub = document.getElementById("kpiNextRaceSub");
  if (kpiNextRace) {
    if (next) {
      const iso = `${next.race_date}T${next.jump_time}:00`;
      kpiNextRace.innerHTML = `<span data-cd-iso="${iso}">${formatCountdown(iso)}</span>`;
      if (kpiNextRaceSub) kpiNextRaceSub.textContent = `${next.track} R${next.race_number}`;
    } else {
      kpiNextRace.textContent = "—";
      if (kpiNextRaceSub) kpiNextRaceSub.textContent = "No more races today";
    }
  }

  // Today P&L
  const todayBets = allBets.filter((b) => (b.race_date || "").startsWith(today));
  let todayPL = 0;
  let settledCount = 0;
  todayBets.forEach((b) => {
    if (b.result === "won") { todayPL += Number(b.stake || 0) * (Number(b.odds_at_tip || 0) - 1); settledCount++; }
    else if (b.result === "lost") { todayPL -= Number(b.stake || 0); settledCount++; }
  });
  const kpiTodayPL = document.getElementById("kpiTodayPL");
  const kpiTodayPLSub = document.getElementById("kpiTodayPLSub");
  if (kpiTodayPL) {
    kpiTodayPL.textContent = settledCount ? `${todayPL >= 0 ? "+" : ""}${todayPL.toFixed(2)}u` : "—";
    kpiTodayPL.style.color = settledCount ? (todayPL >= 0 ? "var(--ok)" : "var(--warn)") : "";
  }
  if (kpiTodayPLSub) kpiTodayPLSub.textContent = settledCount ? `${settledCount} settled` : "No settled bets today";

  // Bets tracked
  const pendingToday = todayBets.filter((b) => b.result === "pending");
  const kpiBetsTracked = document.getElementById("kpiBetsTracked");
  const kpiBetsTrackedSub = document.getElementById("kpiBetsTrackedSub");
  if (kpiBetsTracked) kpiBetsTracked.textContent = String(todayBets.length);
  if (kpiBetsTrackedSub) kpiBetsTrackedSub.textContent = `${pendingToday.length} pending`;

  // --- Top 5 tips ---
  const dashTopTips = document.getElementById("dashTopTips");
  if (dashTopTips) {
    const top5 = [...tips].sort((a, b) => Number(b.edge_pct) - Number(a.edge_pct)).slice(0, 5);
    if (!top5.length) {
      dashTopTips.innerHTML = `<div class="muted" style="font-size:var(--text-sm);padding:var(--sp-3) 0">No tips today — check back after fields are published.</div>`;
    } else {
      const jumpIsoOf = (t) => t.jump_time ? `${today}T${t.jump_time}:00` : null;
      dashTopTips.innerHTML = top5.map((t) => {
        const iso = jumpIsoOf(t);
        const edgePct = Number(t.edge_pct);
        const edgeCls = edgePct > 0 ? "edge-positive" : "edge-negative";
        const status = iso ? raceStatusClass(iso) : "status-upcoming";
        const statusLabel = { "status-upcoming": "Upcoming", "status-imminent": "Imminent", "status-live": "Live", "status-jumped": "Jumped" }[status] || "";
        return `
          <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-2) 0;border-bottom:1px solid var(--line)">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:var(--text-sm)">${escapeHtml(t.horse_name)}</div>
              <div style="font-size:var(--text-xs);color:var(--muted)">${escapeHtml(t.track)} R${t.race_number} · ${escapeHtml(t.jockey)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:var(--sp-2);flex-shrink:0">
              ${iso ? `<span class="race-status-badge ${status}" style="font-size:9px">${statusLabel}</span>` : ""}
              <span style="font-family:var(--mono);font-size:var(--text-sm);color:var(--muted)">${formatOdds(Number(t.market_odds))}</span>
              <span class="tip-edge-badge ${edgeCls}" style="font-size:11px">${edgePct > 0 ? "+" : ""}${edgePct.toFixed(1)}%</span>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // --- Next races ---
  const dashNextRaces = document.getElementById("dashNextRaces");
  if (dashNextRaces) {
    const nextFive = upcoming.slice(0, 6);
    if (!nextFive.length) {
      dashNextRaces.innerHTML = `<div class="muted" style="font-size:var(--text-sm)">No more races today.</div>`;
    } else {
      dashNextRaces.innerHTML = nextFive.map((r) => {
        const iso = `${r.race_date}T${r.jump_time}:00`;
        const status = raceStatusClass(iso);
        return `
          <div class="next-race-item">
            <div class="next-race-track">${escapeHtml(r.track)} R${r.race_number}</div>
            <div class="next-race-details">${r.distance_m}m · ${r.track_rating}</div>
            <span class="race-status-badge ${status}" style="font-size:9px">${{ "status-upcoming": "Upcoming", "status-imminent": "Imminent", "status-live": "Live", "status-jumped": "Jumped" }[status]}</span>
            <div class="next-race-countdown" data-cd-iso="${iso}">${formatCountdown(iso)}</div>
          </div>
        `;
      }).join("");
    }
  }

  // --- Recent outcomes spark ---
  const dashRecentOutcomes = document.getElementById("dashRecentOutcomes");
  const dashRecentEmpty = document.getElementById("dashRecentEmpty");
  const settled = [...allBets]
    .filter((b) => b.result === "won" || b.result === "lost")
    .sort((a, b) => new Date(a.tracked_at) - new Date(b.tracked_at))
    .slice(-30);
  if (dashRecentOutcomes) {
    if (!settled.length) {
      dashRecentOutcomes.style.display = "none";
      if (dashRecentEmpty) dashRecentEmpty.hidden = false;
    } else {
      dashRecentOutcomes.style.display = "";
      if (dashRecentEmpty) dashRecentEmpty.hidden = true;
      dashRecentOutcomes.innerHTML = settled.map((b) => {
        const cls = b.result === "won" ? "spark-win" : "spark-loss";
        return `<div class="spark-col ${cls}" title="${escapeHtml(b.horse_name)} — ${b.result}"></div>`;
      }).join("");
    }
  }
}

async function init() {
  syncTheme();
  setGreeting();
  setDate();
  await loadDashboard();
  setInterval(tickCountdowns, 1000);
  setInterval(() => loadDashboard().catch(console.error), 60000);
}

init().catch((err) => {
  console.error(err);
  showToast(`Failed to load dashboard: ${err.message}`, "error");
});
