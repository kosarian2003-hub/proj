/**
 * delivery-slot.js — Digikala/Snapp-style delivery time picker for the
 * checkout page: the customer picks one of the next 7 days, then one of
 * 3 time windows for that day (morning / afternoon / evening). Selection
 * is required before payment, same rule as the map pin, and is sent to
 * the server as part of the order's `delivery` object so it also shows
 * up in the admin panel.
 */
(function () {
  const ICON_MORNING =
    '<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10V3"/><path d="m8 6 4-4 4 4"/><path d="M3 18h18"/><path d="M5.5 18a6.5 6.5 0 0 1 13 0"/><path d="M2 21h20"/></svg>';
  const ICON_AFTERNOON =
    '<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';
  const ICON_EVENING =
    '<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V8"/><path d="m8 11 4 4 4-4"/><path d="M3 18h18"/><path d="M5.5 18a6.5 6.5 0 0 1 13 0"/><path d="M2 21h20"/></svg>';
  const CHECK_ICON =
    '<svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  const WINDOWS = [
    { id: "morning", from: 8, to: 12, icon: ICON_MORNING },
    { id: "afternoon", from: 12, to: 16, icon: ICON_AFTERNOON },
    { id: "evening", from: 16, to: 20, icon: ICON_EVENING },
  ];

  let selectedDayIndex = null; // 0..6, defaults to "today" once rendered
  let selectedWindowId = null; // "morning" | "afternoon" | "evening" | null
  let days = []; // [{ iso, date }]
  let blockedDates = new Set(); // ISO date strings ("YYYY-MM-DD") the admin disabled

  function t(key, fallback) {
    const val = window.KhorshidI18n ? window.KhorshidI18n.t(key) : null;
    return val !== null && val !== undefined ? val : fallback;
  }

  function currentLang() {
    return window.KhorshidI18n ? window.KhorshidI18n.currentLang() : "fa";
  }

  function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function dayParts(date, idx) {
    const lang = currentLang();
    const locale = lang === "fa" ? "fa-IR-u-ca-persian" : "en-US";
    let weekday = "",
      dayNum = String(date.getDate()),
      month = "";
    try {
      const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).formatToParts(date);
      weekday = (parts.find((p) => p.type === "weekday") || {}).value || "";
      dayNum = (parts.find((p) => p.type === "day") || {}).value || dayNum;
      month = (parts.find((p) => p.type === "month") || {}).value || "";
    } catch (e) {
      /* fall back to the plain Gregorian numbers already set above */
    }
    if (idx === 0) weekday = t("cart_page.delivery_today", lang === "fa" ? "امروز" : "Today");
    else if (idx === 1) weekday = t("cart_page.delivery_tomorrow", lang === "fa" ? "فردا" : "Tomorrow");
    return { weekday, dayNum, month };
  }

  function dayFullLabel(date, idx) {
    const { weekday, dayNum, month } = dayParts(date, idx);
    return idx <= 1 ? weekday : `${weekday} ${dayNum} ${month}`;
  }

  function windowShortLabel(w) {
    const lang = currentLang();
    const key = `cart_page.delivery_window_${w.id}_short`;
    const fa = { morning: "صبح", afternoon: "ظهر", evening: "عصر" };
    const en = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };
    return t(key, lang === "fa" ? fa[w.id] : en[w.id]);
  }

  function windowHours(w) {
    const lang = currentLang();
    if (lang === "fa") return `${w.from.toLocaleString("fa-IR")} تا ${w.to.toLocaleString("fa-IR")}`;
    return `${w.from}–${w.to}`;
  }

  function windowFullLabel(w) {
    return `${windowShortLabel(w)} (${windowHours(w)})`;
  }

  function dayChipHTML(active, parts, blocked) {
    if (blocked) {
      return `
        <span class="text-[10px] font-medium text-khorshid-300 dark:text-khorshid-600">${parts.weekday}</span>
        <span class="mt-1 text-lg font-extrabold leading-none line-through">${parts.dayNum}</span>
        <span class="mt-0.5 text-[9px] text-khorshid-300 dark:text-khorshid-600">${t("cart_page.delivery_date_full", "تکمیل")}</span>`;
    }
    return `
      <span class="text-[10px] font-medium ${active ? "text-white/80" : "text-khorshid-500 dark:text-khorshid-400"}">${parts.weekday}</span>
      <span class="mt-1 text-lg font-extrabold leading-none">${parts.dayNum}</span>
      <span class="mt-0.5 text-[10px] ${active ? "text-white/80" : "text-khorshid-400 dark:text-khorshid-500"}">${parts.month}</span>`;
  }

  function dayBtnClass(active, blocked) {
    if (blocked) {
      return (
        "flex shrink-0 cursor-not-allowed flex-col items-center justify-center rounded-2xl border-2 px-3.5 py-2.5 min-w-[62px] " +
        "border-khorshid-100 bg-khorshid-50 opacity-50 dark:border-white/5 dark:bg-white/5"
      );
    }
    return (
      "flex shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-3.5 py-2.5 min-w-[62px] transition-all " +
      (active
        ? "border-khorshid-700 bg-khorshid-700 text-white shadow-md shadow-khorshid-700/20"
        : "border-khorshid-100 bg-white text-khorshid-900 hover:border-khorshid-300 hover:bg-khorshid-50 dark:border-white/10 dark:bg-khorshid-950/30 dark:text-khorshid-100 dark:hover:border-white/20 dark:hover:bg-white/5")
    );
  }

  function windowCardHTML(w, active) {
    return `
      <span class="grid h-9 w-9 place-items-center rounded-full ${
        active ? "bg-white/15 text-white" : "bg-khorshid-50 text-khorshid-600 dark:bg-white/5 dark:text-khorshid-300"
      }">${w.icon}</span>
      <span class="mt-2 text-xs font-bold">${windowShortLabel(w)}</span>
      <span class="mt-0.5 text-[10px] ${active ? "text-white/80" : "text-khorshid-400 dark:text-khorshid-500"}">${windowHours(w)}</span>
      ${
        active
          ? `<span class="absolute -top-1.5 -end-1.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-white dark:ring-khorshid-900">${CHECK_ICON}</span>`
          : ""
      }`;
  }

  function windowBtnClass(active) {
    return (
      "relative flex flex-col items-center rounded-2xl border-2 px-3 py-3.5 transition-all " +
      (active
        ? "border-khorshid-700 bg-khorshid-700 text-white shadow-md shadow-khorshid-700/20"
        : "border-khorshid-100 bg-white text-khorshid-900 hover:border-khorshid-300 hover:bg-khorshid-50 dark:border-white/10 dark:bg-khorshid-950/30 dark:text-khorshid-100 dark:hover:border-white/20 dark:hover:bg-white/5")
    );
  }

  function clearMessage() {
    const msg = document.getElementById("delivery-time-message");
    if (msg) msg.classList.add("hidden");
  }

  function updateConfirmPanel() {
    const panel = document.getElementById("delivery-time-confirm");
    const textEl = document.getElementById("delivery-time-confirm-text");
    if (!panel || !textEl) return;
    const slot = getSlot();
    if (!slot) {
      panel.classList.add("hidden");
      return;
    }
    textEl.textContent = `${slot.day_label} — ${slot.window_label}`;
    panel.classList.remove("hidden");
  }

  function highlightDay() {
    const box = document.getElementById("delivery-day-list");
    if (!box) return;
    box.querySelectorAll("button").forEach((btn) => {
      const idx = Number(btn.dataset.dayIndex);
      const blocked = blockedDates.has(days[idx].iso);
      const active = idx === selectedDayIndex && !blocked;
      btn.disabled = blocked;
      btn.className = dayBtnClass(active, blocked);
      btn.innerHTML = dayChipHTML(active, dayParts(days[idx].date, idx), blocked);
    });
  }

  function highlightWindow() {
    const box = document.getElementById("delivery-window-list");
    if (!box) return;
    box.querySelectorAll("button").forEach((btn) => {
      const w = WINDOWS.find((x) => x.id === btn.dataset.windowId);
      const active = btn.dataset.windowId === selectedWindowId;
      btn.className = windowBtnClass(active);
      btn.innerHTML = windowCardHTML(w, active);
    });
  }

  function selectDay(idx) {
    if (blockedDates.has(days[idx].iso)) return;
    selectedDayIndex = idx;
    highlightDay();
    clearMessage();
    updateConfirmPanel();
  }

  function selectWindow(id) {
    selectedWindowId = id;
    highlightWindow();
    clearMessage();
    updateConfirmPanel();
  }

  function renderDays() {
    const box = document.getElementById("delivery-day-list");
    if (!box) return;
    const previousIndex = selectedDayIndex;
    box.innerHTML = "";
    days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      days.push({ iso: toISODate(date), date });

      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.dayIndex = String(i);
      btn.addEventListener("click", () => selectDay(i));
      box.appendChild(btn);
    }

    let nextIndex = previousIndex === null ? 0 : previousIndex;
    if (blockedDates.has(days[nextIndex].iso)) {
      const firstOpen = days.findIndex((d) => !blockedDates.has(d.iso));
      nextIndex = firstOpen === -1 ? null : firstOpen;
    }
    selectedDayIndex = nextIndex;
    highlightDay();
  }

  function renderWindows() {
    const box = document.getElementById("delivery-window-list");
    if (!box) return;
    box.innerHTML = "";
    WINDOWS.forEach((w) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.windowId = w.id;
      btn.addEventListener("click", () => selectWindow(w.id));
      box.appendChild(btn);
    });
    highlightWindow();
  }

  function getSlot() {
    if (selectedDayIndex === null || !selectedWindowId || !days[selectedDayIndex]) return null;
    const w = WINDOWS.find((x) => x.id === selectedWindowId);
    return {
      date: days[selectedDayIndex].iso,
      day_label: dayFullLabel(days[selectedDayIndex].date, selectedDayIndex),
      window: selectedWindowId,
      window_label: w ? windowFullLabel(w) : selectedWindowId,
    };
  }

  async function fetchBlockedDates() {
    try {
      const res = await (window.KhorshidAPI
        ? window.KhorshidAPI.get("/api/delivery/blocked-dates")
        : fetch("/api/delivery/blocked-dates").then((r) => r.json()));
      blockedDates = new Set((res && res.dates) || []);
    } catch (e) {
      blockedDates = new Set();
    }
  }

  async function init() {
    if (!document.getElementById("delivery-day-list")) return;
    await fetchBlockedDates();
    renderDays();
    renderWindows();
    updateConfirmPanel();
  }

  async function refresh() {
    if (!document.getElementById("delivery-day-list")) return;
    await fetchBlockedDates();
    renderDays();
    updateConfirmPanel();
  }

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("khorshid:translated", () => {
    if (document.getElementById("delivery-day-list")) {
      renderDays();
      renderWindows();
      updateConfirmPanel();
    }
  });

  window.KhorshidDeliverySlot = { getSlot: getSlot, refresh: refresh };
})();
