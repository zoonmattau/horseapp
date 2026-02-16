const displayNameInput = document.getElementById("displayName");
const emailInput = document.getElementById("email");
const timezoneInput = document.getElementById("timezone");
const defaultMinEdgeInput = document.getElementById("defaultMinEdge");
const notificationsEnabledInput = document.getElementById("notificationsEnabled");
const notifyMinEdgeInput = document.getElementById("notifyMinEdge");
const saveProfileBtn = document.getElementById("saveProfile");
const saveSettingsBtn = document.getElementById("saveSettings");

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
  const s = data.settings || {};
  timezoneInput.value = s.timezone || "Australia/Sydney";
  defaultMinEdgeInput.value = s.default_min_edge ?? 1.0;
  notificationsEnabledInput.value = String(s.notifications_enabled ?? 1);
  notifyMinEdgeInput.value = s.notify_min_edge ?? 1.0;
}

async function saveProfile() {
  await jsonFetch("/api/user/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      display_name: displayNameInput.value.trim(),
      email: emailInput.value.trim(),
    }),
  });
  alert("Profile saved.");
}

async function saveSettings() {
  await jsonFetch("/api/user/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timezone: timezoneInput.value.trim() || "Australia/Sydney",
      default_min_edge: Number(defaultMinEdgeInput.value || "1"),
      notifications_enabled: Number(notificationsEnabledInput.value || "1"),
      notify_min_edge: Number(notifyMinEdgeInput.value || "1"),
    }),
  });
  alert("Settings saved.");
}

saveProfileBtn.addEventListener("click", saveProfile);
saveSettingsBtn.addEventListener("click", saveSettings);

async function init() {
  await loadProfile();
  await loadSettings();
}

init().catch((err) => {
  console.error(err);
  alert(`Failed to load settings: ${err.message}`);
});
