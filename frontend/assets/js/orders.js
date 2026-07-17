/**
 * orders.js — fetches the logged-in customer's own orders and renders them
 * as a simple status timeline. Redirects to login if no one is signed in.
 */
(function () {
  const STATUS_LABELS = {
    pending_payment: "orders_page.status_pending",
    paid: "orders_page.status_paid",
    shipped: "orders_page.status_shipped",
    delivered: "orders_page.status_delivered",
    cancelled: "orders_page.status_cancelled",
  };
  const STATUS_COLORS = {
    pending_payment: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    paid: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    shipped: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400",
    delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
  };

  function orderCard(order, t) {
    const lang = window.KhorshidI18n.currentLang();
    const itemsText = order.items.map((i) => `${i.name} × ${i.qty}`).join("، ");
    const date = new Date(order.created_at).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US");
    return `
      <div class="rounded-2xl border border-khorshid-100 bg-white p-5 dark:border-white/5 dark:bg-khorshid-900/40">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="font-mono text-sm font-semibold text-khorshid-900 dark:text-white">#${order.id}</p>
          <span class="rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[order.status] || ""}">${t(STATUS_LABELS[order.status] || order.status)}</span>
        </div>
        <p class="mt-2 text-sm text-khorshid-700 dark:text-khorshid-300">${itemsText}</p>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-khorshid-500 dark:text-khorshid-400">
          <span>${date}</span>
          <span class="font-mono text-sm font-bold text-khorshid-900 dark:text-white">${formatToman(order.total)} ${t("products_page.toman")}</span>
        </div>
      </div>`;
  }

  async function load() {
    const res = await KhorshidAPI.get("/api/auth/me");
    if (!res.user) {
      window.location.href = "login.html?redirect=orders.html";
      return;
    }

    const t = window.KhorshidI18n.t;
    const data = await KhorshidAPI.get("/api/orders/mine");
    const list = document.getElementById("orders-list");
    const empty = document.getElementById("orders-empty");
    if (!data.ok || !data.orders.length) {
      empty.classList.remove("hidden");
      return;
    }
    list.innerHTML = data.orders.map((o) => orderCard(o, t)).join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("orders-list")) load();
  });
})();
