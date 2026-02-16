const displayNameInput = document.getElementById("displayName");
const emailInput = document.getElementById("email");
const timezoneInput = document.getElementById("timezone");
const defaultMinEdgeInput = document.getElementById("defaultMinEdge");
const notificationsEnabledInput = document.getElementById("notificationsEnabled");
const notifyMinEdgeInput = document.getElementById("notifyMinEdge");
const themeInput = document.getElementById("theme");
const oddsFormatInput = document.getElementById("oddsFormat");
const defaultStakeInput = document.getElementById("defaultStake");
const bankrollUnitsInput = document.getElementById("bankrollUnits");
const autoSettleEnabledInput = document.getElementById("autoSettleEnabled");
const analyticsTopNInput = document.getElementById("analyticsTopN");
const settingsStatus = document.getElementById("settingsStatus");
const exportBox = document.getElementById("settingsExport");

const saveProfileBtn = document.getElementById("saveProfile");
const saveSettingsBtn = document.getElementById("saveSettings");
const exportSettingsBtn = document.getElementById("exportSettings");
const resetSettingsBtn = document.getElementById("resetSettings");

function applyThemePreference(themePref) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (themePref === "light" || themePref === "dark") {
    document.documentElement.setAttribute("data-theme", themePref);
    return;
  }
  document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
}

function setStatus(message, tone = "neutral") {
  if (!settingsStatus) return;
  settingsStatus.textContent = message;
  settingsStatus.classList.remove("edge-positive", "edge-negative", "edge-neutral");
  settingsStatus.classList.add(
    tone === "ok" ? "edge-positive" : tone === "error" ? "edge-negative" : "edge-neutral"
  );
}

function sanitizeNumber(input, fallback) {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function collectSettingsPayload() {
  return {
    timezone: timezoneInput.value.trim() || "Australia/Sydney",
    default_min_edge: sanitizeNumber(defaultMinEdgeInput.value, 1.0),
    notifications_enabled: Number(notificationsEnabledInput.value || "1"),
    notify_min_edge: sanitizeNumber(notifyMinEdgeInput.value, 1.0),
    theme: themeInput.value || "system",
    odds_format: oddsFormatInput.value || "decimal",
    default_stake: Math.max(0, sanitizeNumber(defaultStakeInput.value, 1.0)),
    bankroll_units: Math.max(0, sanitizeNumber(bankrollUnitsInput.value, 100.0)),
    auto_settle_enabled: Number(autoSettleEnabledInput.value || "1"),
    analytics_top_n: Math.max(3, Math.min(20, Math.round(sanitizeNumber(analyticsTopNInput.value, 8)))),
  };
}

function applySettingsToForm(s = {}) {
  timezoneInput.value = s.timezone || "Australia/Sydney";
  defaultMinEdgeInput.value = s.default_min_edge ?? 1.0;
  notificationsEnabledInput.value = String(s.notifications_enabled ?? 1);
  notifyMinEdgeInput.value = s.notify_min_edge ?? 1.0;
  themeInput.value = s.theme || "system";
  oddsFormatInput.value = s.odds_format || "decimal";
  defaultStakeInput.value = s.default_stake ?? 1.0;
  bankrollUnitsInput.value = s.bankroll_units ?? 100.0;
  autoSettleEnabledInput.value = String(s.auto_settle_enabled ?? 1);
  analyticsTopNInput.value = s.analytics_top_n ?? 8;
  applyThemePreference(themeInput.value || "system");
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadProfile() {
  const data = await jsonFetch("/api/user/profile");
  const p = data.profile || {};
  displayNameInput.value = p.display_name || "";
  emailInput.value = p.email || "";
}

async function loadSettings() {
  const data = await jsonFetch("/api/user/settings");
  applySettingsToForm(data.settings || {});
}

async function saveProfile() {
  setStatus("Saving profile...", "neutral");
  await jsonFetch("/api/user/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      display_name: displayNameInput.value.trim(),
      email: emailInput.value.trim(),
    }),
  });
  setStatus("Profile saved.", "ok");
}

async function saveSettings() {
  setStatus("Saving settings...", "neutral");
  const payload = collectSettingsPayload();
  await jsonFetch("/api/user/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  localStorage.setItem("horse_theme_pref", payload.theme);
  localStorage.setItem("horse_odds_format", payload.odds_format);
  localStorage.setItem("horse_default_stake", String(payload.default_stake));
  localStorage.setItem("horse_analytics_top_n", String(payload.analytics_top_n));
  applyThemePreference(payload.theme);
  setStatus("Settings saved.", "ok");
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportSettings() {
  setStatus("Exporting settings...", "neutral");
  const data = await jsonFetch("/api/user/settings/export");
  const ts = new Date().toISOString().replaceAll(":", "-");
  downloadJson(`horseedge-settings-${ts}.json`, data);
  if (exportBox) {
    exportBox.hidden = false;
    exportBox.textContent = JSON.stringify(data, null, 2);
  }
  setStatus("Settings exported.", "ok");
}

async function resetSettings() {
  const ok = confirm("Reset all settings to defaults?");
  if (!ok) return;

  setStatus("Resetting settings...", "neutral");
  const data = await jsonFetch("/api/user/settings/reset", { method: "POST" });
  applySettingsToForm(data.settings || {});
  localStorage.removeItem("horse_theme_pref");
  localStorage.removeItem("horse_odds_format");
  localStorage.removeItem("horse_default_stake");
  localStorage.removeItem("horse_analytics_top_n");
  setStatus("Settings reset to defaults.", "ok");
}

saveProfileBtn.addEventListener("click", () => {
  saveProfile().catch((err) => {
    console.error(err);
    setStatus(`Profile save failed: ${err.message}`, "error");
  });
});

saveSettingsBtn.addEventListener("click", () => {
  saveSettings().catch((err) => {
    console.error(err);
    setStatus(`Settings save failed: ${err.message}`, "error");
  });
});

exportSettingsBtn?.addEventListener("click", () => {
  exportSettings().catch((err) => {
    console.error(err);
    setStatus(`Export failed: ${err.message}`, "error");
  });
});

resetSettingsBtn?.addEventListener("click", () => {
  resetSettings().catch((err) => {
    console.error(err);
    setStatus(`Reset failed: ${err.message}`, "error");
  });
});

themeInput?.addEventListener("change", () => {
  applyThemePreference(themeInput.value || "system");
});

async function init() {
  setStatus("Loading settings...", "neutral");
  await loadProfile();
  await loadSettings();
  setStatus("Ready", "ok");
}

init().catch((err) => {
  console.error(err);
  setStatus(`Failed to load settings: ${err.message}`, "error");
});