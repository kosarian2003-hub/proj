/**
 * admin.js — drives the admin dashboard (admin.html). Everything here talks
 * to the /api/admin/* and /api/accounting/summary endpoints, all of which
 * require an is_admin session — a non-admin (or logged-out) visitor sees the
 * "access denied" panel instead of the dashboard.
 */
(function () {
  const ORDER_STATUSES = ["pending_payment", "paid", "shipped", "delivered", "cancelled"];
  const ORDER_STATUS_LABELS = {
    pending_payment: "در انتظار پرداخت", paid: "پرداخت‌شده", shipped: "ارسال‌شده",
    delivered: "تحویل داده‌شده", cancelled: "لغو شده",
  };
  const REPAIR_STATUSES = ["new", "in_progress", "done", "cancelled"];
  const REPAIR_STATUS_LABELS = { new: "ثبت شده", in_progress: "در حال بررسی", done: "انجام شده", cancelled: "لغو شده" };

  function statusSelect(current, options, labels, onChange) {
    const select = document.createElement("select");
    select.className = "rounded-lg border border-khorshid-200 bg-white px-2 py-1 text-xs text-khorshid-900 dark:border-white/10 dark:bg-khorshid-800 dark:text-khorshid-100";
    options.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = labels[opt] || opt;
      if (opt === current) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener("change", () => onChange(select.value));
    return select;
  }

  function summaryCard(label, value, tone) {
    return `
      <div class="rounded-2xl border border-khorshid-100 bg-white p-4 dark:border-white/5 dark:bg-khorshid-900/40">
        <p class="text-xs text-khorshid-500 dark:text-khorshid-400">${label}</p>
        <p class="mt-1 font-mono text-lg font-bold ${tone || "text-khorshid-950 dark:text-white"}">${value}</p>
      </div>`;
  }

  async function loadSummary() {
    const res = await KhorshidAPI.get("/api/accounting/summary");
    if (!res.ok) return;
    const cards = [
      summaryCard("درآمد (تومان)", formatToman(res.revenue_toman)),
      summaryCard("سفارش‌های پرداخت‌شده", res.paid_orders),
      summaryCard("سفارش‌های در انتظار", res.pending_orders),
      summaryCard("ارزش انبار (تومان)", formatToman(res.inventory_value_toman)),
      summaryCard("تعمیرات باز", res.open_repairs),
      summaryCard("ناموجود", res.out_of_stock_products.length, res.out_of_stock_products.length ? "text-rose-600" : ""),
      summaryCard("موجودی کم (≤۳)", res.low_stock_products.length, res.low_stock_products.length ? "text-amber-600" : ""),
      summaryCard("تخفیف اعطاشده (تومان)", formatToman(res.discounts_given_toman)),
    ];
    document.getElementById("summary-cards").innerHTML = cards.join("");
  }

  async function loadOrders() {
    const res = await KhorshidAPI.get("/api/admin/orders");
    if (!res.ok) return;
    const tbody = document.getElementById("orders-tbody");
    tbody.innerHTML = "";
    res.orders.forEach((o) => {
      const tr = document.createElement("tr");
      const itemsText = o.items.map((i) => `${i.name} × ${i.qty}`).join("، ");
      const customerName = `${o.customer.first_name || ""} ${o.customer.last_name || ""}`.trim() || "—";
      const phone = (o.customer && o.customer.phone) || "—";
      const email = o.user_email || "—";
      const address = o.delivery && o.delivery.address
        ? o.delivery.address
        : (o.delivery && o.delivery.lat ? `${o.delivery.lat}, ${o.delivery.lng}` : "—");
      const slot = o.delivery && o.delivery.slot;
      const slotText = slot ? `${slot.day_label || ""} / ${slot.window_label || ""}`.trim() : "—";
      tr.innerHTML = `
        <td class="px-4 py-3 font-mono text-xs">#${o.id}</td>
        <td class="px-4 py-3">${customerName}</td>
        <td class="px-4 py-3 font-mono text-xs">${phone}</td>
        <td class="px-4 py-3 font-mono text-xs">${email}</td>
        <td class="px-4 py-3 text-xs text-khorshid-600 dark:text-khorshid-400">${itemsText}</td>
        <td class="px-4 py-3 max-w-[16rem] text-xs text-khorshid-600 dark:text-khorshid-400">${address}${o.delivery && o.delivery.note ? `<br><span class="text-khorshid-400">${o.delivery.note}</span>` : ""}</td>
        <td class="px-4 py-3 whitespace-nowrap text-xs text-khorshid-600 dark:text-khorshid-400">${slotText}</td>
        <td class="px-4 py-3 font-mono">${formatToman(o.total)}</td>
        <td class="px-4 py-3 text-xs text-khorshid-500">${new Date(o.created_at).toLocaleDateString("fa-IR")}</td>
        <td class="px-4 py-3"></td>`;
      const statusCell = tr.querySelector("td:last-child");
      statusCell.appendChild(
        statusSelect(o.status, ORDER_STATUSES, ORDER_STATUS_LABELS, async (newStatus) => {
          await KhorshidAPI.post(`/api/admin/orders/${o.id}/status`, { status: newStatus });
          loadSummary();
        })
      );
      tbody.appendChild(tr);
    });
  }

  async function loadRepairs() {
    const res = await KhorshidAPI.get("/api/admin/repairs");
    if (!res.ok) return;
    const tbody = document.getElementById("repairs-tbody");
    tbody.innerHTML = "";
    res.repairs.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="px-4 py-3">${r.name}</td>
        <td class="px-4 py-3 font-mono text-xs">${r.phone}</td>
        <td class="px-4 py-3">${r.device_type}</td>
        <td class="px-4 py-3 text-xs text-khorshid-600 dark:text-khorshid-400">${r.issue}</td>
        <td class="px-4 py-3 text-xs text-khorshid-500">${new Date(r.created_at).toLocaleDateString("fa-IR")}</td>
        <td class="px-4 py-3"></td>`;
      tr.querySelector("td:last-child").appendChild(
        statusSelect(r.status, REPAIR_STATUSES, REPAIR_STATUS_LABELS, async (newStatus) => {
          await KhorshidAPI.post(`/api/admin/repairs/${r.id}/status`, { status: newStatus });
          loadSummary();
        })
      );
      tbody.appendChild(tr);
    });
  }

  async function loadCoupons() {
    const res = await KhorshidAPI.get("/api/admin/coupons");
    if (!res.ok) return;
    const tbody = document.getElementById("coupons-tbody");
    tbody.innerHTML = res.coupons
      .map(
        (c) => `
      <tr>
        <td class="px-4 py-3 font-mono">${c.code}</td>
        <td class="px-4 py-3">%${c.discount_percent}</td>
        <td class="px-4 py-3">
          <span class="rounded-full px-2.5 py-0.5 text-xs ${c.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-khorshid-100 text-khorshid-500 dark:bg-white/10"}">
            ${c.active ? "فعال" : "غیرفعال"}
          </span>
        </td>
        <td class="px-4 py-3">
          <button data-toggle-coupon="${c.code}" class="text-xs text-khorshid-600 underline dark:text-khorshid-300">
            ${c.active ? "غیرفعال کن" : "فعال کن"}
          </button>
        </td>
      </tr>`
      )
      .join("");
    tbody.querySelectorAll("[data-toggle-coupon]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await KhorshidAPI.post(`/api/admin/coupons/${btn.getAttribute("data-toggle-coupon")}/toggle`);
        loadCoupons();
      });
    });
  }

  function dayPartsFa(date, idx) {
    let weekday = "", dayNum = String(date.getDate()), month = "";
    try {
      const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "short", day: "numeric", month: "short" }).formatToParts(date);
      weekday = (parts.find((p) => p.type === "weekday") || {}).value || "";
      dayNum = (parts.find((p) => p.type === "day") || {}).value || dayNum;
      month = (parts.find((p) => p.type === "month") || {}).value || "";
    } catch (e) { /* fall back to plain numbers already set above */ }
    if (idx === 0) weekday = "امروز";
    else if (idx === 1) weekday = "فردا";
    return { weekday, dayNum, month };
  }

  function toISODate(date) {
    const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function renderDeliveryDayPicker(blockedList) {
    const box = document.getElementById("delivery-day-picker");
    if (!box) return;
    const blockedMap = {};
    blockedList.forEach((d) => { blockedMap[d.date] = d.reason || ""; });

    box.innerHTML = "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 21; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const iso = toISODate(date);
      const blocked = Object.prototype.hasOwnProperty.call(blockedMap, iso);
      const parts = dayPartsFa(date, i);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "flex shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-3 py-2.5 min-w-[62px] transition-all " +
        (blocked
          ? "border-rose-600 bg-rose-600 text-white shadow-md shadow-rose-600/20"
          : "border-khorshid-100 bg-white text-khorshid-900 hover:border-khorshid-300 hover:bg-khorshid-50 dark:border-white/10 dark:bg-khorshid-950/30 dark:text-khorshid-100 dark:hover:border-white/20 dark:hover:bg-white/5");
      btn.innerHTML = `
        <span class="text-[10px] font-medium ${blocked ? "text-white/80" : "text-khorshid-500 dark:text-khorshid-400"}">${parts.weekday}</span>
        <span class="mt-1 text-lg font-extrabold leading-none">${parts.dayNum}</span>
        <span class="mt-0.5 text-[10px] ${blocked ? "text-white/80" : "text-khorshid-400 dark:text-khorshid-500"}">${parts.month}</span>`;
      btn.title = blocked ? `غیرفعال — کلیک کنید تا دوباره فعال شود${blockedMap[iso] ? " (" + blockedMap[iso] + ")" : ""}` : "کلیک کنید تا این روز غیرفعال شود";
      btn.addEventListener("click", async () => {
        if (blocked) {
          await KhorshidAPI.post(`/api/admin/blocked-dates/${iso}/unblock`);
        } else {
          const reasonInput = document.getElementById("block-date-reason");
          await KhorshidAPI.post("/api/admin/blocked-dates", { date: iso, reason: reasonInput ? reasonInput.value.trim() : "" });
        }
        loadBlockedDates();
      });
      box.appendChild(btn);
    }
  }

  function renderBlockedDatesTable(blockedList) {
    const tbody = document.getElementById("blocked-dates-tbody");
    tbody.innerHTML = blockedList
      .map(
        (d) => `
      <tr>
        <td class="px-4 py-3 font-mono">${d.date}</td>
        <td class="px-4 py-3 text-xs text-khorshid-600 dark:text-khorshid-400">${d.reason || "—"}</td>
        <td class="px-4 py-3">
          <button data-unblock-date="${d.date}" class="text-xs text-khorshid-600 underline dark:text-khorshid-300">
            فعال کن
          </button>
        </td>
      </tr>`
      )
      .join("");
    if (!blockedList.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="px-4 py-6 text-center text-xs text-khorshid-400">روزی غیرفعال نشده است.</td></tr>`;
    }
    tbody.querySelectorAll("[data-unblock-date]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await KhorshidAPI.post(`/api/admin/blocked-dates/${btn.getAttribute("data-unblock-date")}/unblock`);
        loadBlockedDates();
      });
    });
  }

  async function loadBlockedDates() {
    const res = await KhorshidAPI.get("/api/admin/blocked-dates");
    if (!res.ok) return;
    renderDeliveryDayPicker(res.dates);
    renderBlockedDatesTable(res.dates);
  }

  function setupTabs() {
    document.querySelectorAll(".admin-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach((b) => {
          b.classList.remove("border-khorshid-700", "text-khorshid-900", "dark:text-white");
          b.classList.add("border-transparent", "text-khorshid-500");
        });
        btn.classList.add("border-khorshid-700", "text-khorshid-900", "dark:text-white");
        btn.classList.remove("border-transparent", "text-khorshid-500");

        const target = btn.getAttribute("data-tab");
        document.querySelectorAll("[data-panel]").forEach((p) => {
          p.classList.toggle("hidden", p.getAttribute("data-panel") !== target);
        });
      });
    });
  }

  function setupCouponForm() {
    const form = document.getElementById("coupon-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const res = await KhorshidAPI.post("/api/admin/coupons", {
        code: form.code.value.trim(),
        discount_percent: Number(form.discount_percent.value),
      });
      if (res.ok) {
        form.reset();
        loadCoupons();
      }
    });
  }

  function setupBlockDateForm() {
    const form = document.getElementById("block-date-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const reasonInput = document.getElementById("block-date-reason");
      const res = await KhorshidAPI.post("/api/admin/blocked-dates", {
        date: form.date.value,
        reason: reasonInput ? reasonInput.value.trim() : "",
      });
      if (res.ok) {
        form.reset();
        loadBlockedDates();
      }
    });
  }

  function setupUploadForm() {
    const form = document.getElementById("upload-products-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const resultEl = document.getElementById("upload-result");
      const file = form.file.files[0];
      if (!file) return;
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload-products", { method: "POST", credentials: "include", body });
      const data = await res.json();
      resultEl.textContent = data.ok ? "آپلود با موفقیت انجام شد." : `خطا: ${data.error}`;
      resultEl.className = "mt-3 text-xs " + (data.ok ? "text-emerald-600" : "text-rose-600");
      form.reset();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!document.getElementById("admin-content")) return;

    const me = await KhorshidAPI.get("/api/auth/me");
    if (!me.user) {
      window.location.href = "login.html?redirect=admin.html";
      return;
    }
    if (!me.user.is_admin) {
      document.getElementById("access-denied").classList.remove("hidden");
      return;
    }

    document.getElementById("admin-content").classList.remove("hidden");
    setupTabs();
    setupCouponForm();
    setupUploadForm();
    setupBlockDateForm();
    loadSummary();
    loadOrders();
    loadRepairs();
    loadCoupons();
    loadBlockedDates();
  });
})();
