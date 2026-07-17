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
      const address = o.delivery && o.delivery.address
        ? o.delivery.address
        : (o.delivery && o.delivery.lat ? `${o.delivery.lat}, ${o.delivery.lng}` : "—");
      tr.innerHTML = `
        <td class="px-4 py-3 font-mono text-xs">#${o.id}</td>
        <td class="px-4 py-3">${customerName}</td>
        <td class="px-4 py-3 text-xs text-khorshid-600 dark:text-khorshid-400">${itemsText}</td>
        <td class="px-4 py-3 max-w-[16rem] text-xs text-khorshid-600 dark:text-khorshid-400">${address}${o.delivery && o.delivery.note ? `<br><span class="text-khorshid-400">${o.delivery.note}</span>` : ""}</td>
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
    loadSummary();
    loadOrders();
    loadRepairs();
    loadCoupons();
  });
})();
