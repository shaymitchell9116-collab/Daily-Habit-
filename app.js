const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "daily-habit-v1";
const SENT_KEY = "daily-habit-reminders-v1";
let activities = [];
let filter = "all";
let editingId = null;
let activeDay = "";
let pushSubscriptionActive = false;
let pushSetupPending = false;

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function currentTimeKey(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function loadActivities() {
  try { activities = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { activities = []; }
  const today = todayKey();
  activities = activities.filter(a => a && (a.repeat !== "once" || a.createdOn === today));
  activities.forEach(a => {
    if (a.repeat === "daily" && a.completedOn !== today) {
      a.done = false;
      a.completedOn = null;
    } else if (a.completedOn === today) {
      a.done = true;
    }
  });
  activeDay = today;
}
function saveActivities() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(activities)); }
  catch { toast("Could not save. Check your browser storage space."); }
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function formatTime(value) {
  if (!value) return "No reminder set";
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function render() {
  const total = activities.length;
  const done = activities.filter(a => a.done).length;
  const pending = total - done;
  const percent = total ? Math.round(done / total * 100) : 0;
  $("completedCount").textContent = done;
  $("totalCount").textContent = total;
  $("progressPercent").textContent = `${percent}%`;
  $("progressBar").style.width = `${percent}%`;
  $("progressNote").textContent = total === 0 ? "Start with one thing. Build momentum." : done === total ? "Everything completed. Strong work." : `${pending} ${pending === 1 ? "activity" : "activities"} left. Keep moving.`;
  $("allCount").textContent = total;
  $("pendingCount").textContent = pending;
  $("doneCount").textContent = done;

  document.querySelectorAll(".filter").forEach(button => button.classList.toggle("active", button.dataset.filter === filter));
  const visible = activities
    .filter(a => filter === "all" || (filter === "done" ? a.done : !a.done))
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  $("activityList").innerHTML = visible.map(a => `
    <article class="activity ${a.done ? "done" : ""}">
      <button class="check" data-action="toggle" data-id="${escapeHtml(a.id)}" aria-label="${a.done ? "Mark pending" : "Mark done"}">${a.done ? "✓" : ""}</button>
      <div class="activity-main">
        <div class="activity-name">${escapeHtml(a.name)}</div>
        <div class="activity-meta"><span>◷ ${escapeHtml(formatTime(a.time))}</span><span>·</span><span>${a.repeat === "daily" ? "Repeats daily" : "Today only"}</span></div>
        ${a.note ? `<div class="activity-note">${escapeHtml(a.note)}</div>` : ""}
      </div>
      <div class="activity-actions">
        <button class="small-action" data-action="edit" data-id="${escapeHtml(a.id)}" aria-label="Edit activity">✎</button>
        <button class="small-action" data-action="delete" data-id="${escapeHtml(a.id)}" aria-label="Delete activity">×</button>
      </div>
    </article>`).join("");

  $("emptyState").classList.toggle("show", visible.length === 0);
  const emptyHeading = $("emptyState").querySelector("h3");
  const emptyText = $("emptyState").querySelector("p");
  const emptyButton = $("emptyState").querySelector("button");
  if (activities.length === 0) {
    emptyHeading.textContent = "Your day is yours to design.";
    emptyText.textContent = "Add your first activity and choose when you want to be reminded.";
    emptyButton.textContent = "Add your first activity";
    emptyButton.hidden = false;
  } else {
    emptyHeading.textContent = `No ${filter} activities.`;
    emptyText.textContent = "Try another filter or add a new activity.";
    emptyButton.textContent = "Add activity";
    emptyButton.hidden = false;
  }
}
function toast(message) {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3000);
}
function openDialog(activity = null) {
  editingId = activity?.id || null;
  $("dialogTitle").textContent = activity ? "Edit activity" : "New activity";
  $("activityName").value = activity?.name || "";
  $("activityTime").value = activity?.time || "";
  $("activityRepeat").value = activity?.repeat || "daily";
  $("activityNote").value = activity?.note || "";
  $("activityDialog").showModal();
  $("activityName").focus();
}
function closeDialog() { $("activityDialog").close(); }

$("addBtn").addEventListener("click", () => openDialog());
$("emptyAddBtn").addEventListener("click", () => openDialog());
$("closeDialog").addEventListener("click", closeDialog);
$("cancelDialog").addEventListener("click", closeDialog);
$("activityForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("activityName").value.trim();
  if (!name) return;
  const data = {
    name,
    time: $("activityTime").value,
    repeat: $("activityRepeat").value,
    note: $("activityNote").value.trim()
  };
  if (editingId) {
    const existing = activities.find(a => a.id === editingId);
    if (existing) Object.assign(existing, data);
    toast("Activity updated.");
  } else {
    activities.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...data,
      done: false,
      createdOn: todayKey(),
      completedOn: null
    });
    toast("Activity added.");
  }
  saveActivities();
  render();
  closeDialog();
  syncActivities();
});

document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  filter = button.dataset.filter;
  render();
}));
$("activityList").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const activity = activities.find(a => a.id === button.dataset.id);
  if (!activity) return;
  switch (button.dataset.action) {
    case "toggle":
      activity.done = !activity.done;
      activity.completedOn = activity.done ? todayKey() : null;
      toast(activity.done ? "Marked as done." : "Moved back to pending.");
      break;
    case "edit": openDialog(activity); return;
    case "delete":
      if (!confirm(`Delete "${activity.name}"?`)) return;
      activities = activities.filter(a => a.id !== activity.id);
      toast("Activity deleted.");
      break;
  }
  saveActivities();
  render();
  syncActivities();
});

function setDate() {
  const date = new Date();
  $("dayName").textContent = date.toLocaleDateString([], { weekday: "short" }).toUpperCase();
  $("dayNumber").textContent = date.getDate();
  $("monthName").textContent = date.toLocaleDateString([], { month: "short" }).toUpperCase();
  $("todayLabel").textContent = date.toLocaleDateString([], { weekday: "long", month: "long", year: "numeric" }).toUpperCase();
}
function readSentReminders() {
  try { return new Set(JSON.parse(localStorage.getItem(SENT_KEY) || "[]")); }
  catch { return new Set(); }
}
function writeSentReminders(sent) {
  const values = [...sent];
  // Keep the browser-side reminder ledger bounded.
  localStorage.setItem(SENT_KEY, JSON.stringify(values.slice(-500)));
}
async function checkReminders() {
  if (pushSubscriptionActive || pushSetupPending) return; // Avoid local duplicates while background push is being established.
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const today = todayKey(now);
  const current = now.getHours() * 60 + now.getMinutes();
  const sent = readSentReminders();
  for (const activity of activities) {
    if (!activity.time || activity.done || (activity.repeat === "once" && activity.createdOn !== today)) continue;
    const [hour, minute] = activity.time.split(":").map(Number);
    const due = hour * 60 + minute;
    const elapsed = current - due;
    const key = `${activity.id}|${today}`;
    // A five-minute grace window catches a throttled browser tab without sending stale alerts hours later.
    if (elapsed < 0 || elapsed > 5 || sent.has(key)) continue;
    const options = { body: `Time for: ${activity.name}`, icon: "/icon-192.png", tag: `${activity.id}-${today}` };
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification("Daily Habit reminder", options);
      } else {
        new Notification("Daily Habit reminder", options);
      }
      sent.add(key);
      writeSentReminders(sent);
    } catch (error) {
      console.warn("Could not display reminder:", error);
    }
  }
}
async function syncActivities() {
  try {
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activities,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos"
      })
    });
  } catch {
    // Local storage remains the source of truth when no push server is connected.
  }
}
async function setupPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  pushSetupPending = true;
  try {
    await navigator.serviceWorker.register("/sw.js");
    const registration = await navigator.serviceWorker.ready;
    const response = await fetch("/api/vapid-public-key");
    if (!response.ok) return false;
    const { publicKey } = await response.json();
    if (!publicKey) return false;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }
    const saved = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription)
    });
    pushSubscriptionActive = saved.ok;
    return pushSubscriptionActive;
  } catch (error) {
    console.info("Background push setup is not available:", error);
    return false;
  } finally {
    pushSetupPending = false;
  }
}
function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}
async function enableNotifications() {
  if (!("Notification" in window)) {
    toast("This browser does not support notifications.");
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast("Notifications are blocked. Allow them in your browser's site settings.");
      return;
    }
    if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js");
    const pushReady = await setupPush();
    toast(pushReady
      ? "Notifications enabled, including background push."
      : "On-page reminders enabled. Closed-site push still needs server setup.");
  } catch (error) {
    console.warn(error);
    toast("Notification setup failed. Check browser permissions.");
  }
}
$("notifyBtn").addEventListener("click", enableNotifications);

function handleDayChange() {
  const today = todayKey();
  if (today !== activeDay) {
    loadActivities();
    saveActivities();
    setDate();
    render();
    syncActivities();
  }
}

loadActivities();
setDate();
render();
syncActivities();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(error => console.info("Service worker unavailable:", error));
}
if ("Notification" in window && Notification.permission === "granted") setupPush().then(() => checkReminders());
else checkReminders();
setInterval(() => {
  handleDayChange();
  checkReminders();
}, 15000);
window.addEventListener("focus", () => {
  handleDayChange();
  checkReminders();
});
