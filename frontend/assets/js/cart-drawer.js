/**
 * cart-drawer.js — Digikala/Snapp-style mini cart. Slides in from the left
 * edge of the screen whenever BazaarCart.addItem() succeeds, shows the
 * current cart contents, and stays open until the customer closes it (✕
 * button, backdrop click, or Escape) or follows the "go to cart" button
 * down to payment.html (the full cart/checkout page).
 *
 * The drawer builds its own markup at runtime and appends it to <body>, so
 * no page's HTML needs to change — just include this script (after cart.js
 * and i18n.js) on any page that has add-to-cart buttons.
 */
(function () {
  let drawerEl = null;
  let backdropEl = null;
  let panelEl = null;

  function t(key, fallback) {
    const val = window.BazaarI18n ? window.BazaarI18n.t(key) : null;
    return val && val !== key ? val : fallback;
  }

  function lang() {
    return window.BazaarI18n ? window.BazaarI18n.currentLang() : "fa";
  }

  function buildDrawer() {
    if (drawerEl) return;

    drawerEl = document.createElement("div");
    drawerEl.id = "bazaar-cart-drawer-root";
    drawerEl.innerHTML = `
      <div data-cart-backdrop class="fixed inset-0 z-[60] bg-bazaar-950/50 opacity-0 pointer-events-none transition-opacity duration-300"></div>
      <aside data-cart-panel
        class="fixed inset-y-0 left-0 z-[70] flex w-[88vw] max-w-sm -translate-x-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-out dark:bg-bazaar-950"
        role="dialog" aria-modal="true" aria-label="سبد خرید">
        <div class="flex items-center justify-between border-b border-bazaar-100 px-5 py-4 dark:border-white/10">
          <h2 class="font-display text-base font-extrabold text-bazaar-900 dark:text-white" data-cart-drawer-title>سبد خرید</h2>
          <button type="button" data-cart-close class="grid h-8 w-8 place-items-center rounded-full text-bazaar-500 hover:bg-bazaar-100 dark:text-bazaar-400 dark:hover:bg-white/10" aria-label="close">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div data-cart-lines class="flex-1 overflow-y-auto px-5 py-2"></div>

        <div data-cart-empty class="hidden flex-1 flex-col items-center justify-center gap-2 px-5 text-center text-bazaar-400">
          <svg viewBox="0 0 24 24" class="h-10 w-10" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <p class="text-sm" data-cart-drawer-empty-text>سبد خرید شما خالی است.</p>
        </div>

        <div data-cart-footer class="hidden border-t border-bazaar-100 p-5 dark:border-white/10">
          <div class="mb-3 flex items-center justify-between text-sm">
            <span class="text-bazaar-500 dark:text-bazaar-400" data-cart-drawer-subtotal-label>جمع سبد خرید</span>
            <span data-cart-drawer-subtotal class="font-mono text-base font-bold text-bazaar-950 dark:text-white">۰</span>
          </div>
          <a href="payment.html" data-cart-goto class="block w-full rounded-xl bg-bazaar-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-bazaar-800">
            مشاهده سبد خرید و تکمیل خرید
          </a>
        </div>
      </aside>`;
    document.body.appendChild(drawerEl);

    backdropEl = drawerEl.querySelector("[data-cart-backdrop]");
    panelEl = drawerEl.querySelector("[data-cart-panel]");

    backdropEl.addEventListener("click", close);
    drawerEl.querySelector("[data-cart-close]").addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) close();
    });

    applyTranslations();
  }

  function applyTranslations() {
    const titleEl = drawerEl.querySelector("[data-cart-drawer-title]");
    const emptyEl = drawerEl.querySelector("[data-cart-drawer-empty-text]");
    const subtotalLabelEl = drawerEl.querySelector("[data-cart-drawer-subtotal-label]");
    const gotoEl = drawerEl.querySelector("[data-cart-goto]");
    const isFa = lang() === "fa";
    if (titleEl) titleEl.textContent = t("cart_page.drawer_title", isFa ? "سبد خرید" : "Your Cart");
    if (emptyEl) emptyEl.textContent = t("cart_page.drawer_empty", isFa ? "سبد خرید شما خالی است." : "Your cart is empty.");
    if (subtotalLabelEl) subtotalLabelEl.textContent = t("cart_page.drawer_subtotal", isFa ? "جمع سبد خرید" : "Cart Total");
    if (gotoEl) gotoEl.textContent = t("cart_page.drawer_goto_cart", isFa ? "مشاهده سبد خرید و تکمیل خرید" : "View Cart & Checkout");
    drawerEl.querySelector("[data-cart-panel]").setAttribute("aria-label", isFa ? "سبد خرید" : "Cart");
  }

  function lineTemplate(item) {
    const isFa = lang() === "fa";
    const name = isFa ? item.name_fa : item.name_en || item.name_fa;
    const currency = t("products_page.toman", isFa ? "تومان" : "Toman");
    return `
      <div class="flex items-center gap-3 border-b border-bazaar-100 py-3 last:border-b-0 dark:border-white/5">
        ${
          item.image
            ? `<img src="${item.image}" alt="${name}" loading="lazy" class="h-14 w-14 shrink-0 rounded-xl object-cover" onerror="this.remove()" />`
            : `<div class="h-14 w-14 shrink-0 rounded-xl bg-bazaar-50 dark:bg-white/5"></div>`
        }
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-bazaar-900 dark:text-bazaar-100">${name}</p>
          <p class="mt-1 font-mono text-xs text-bazaar-500 dark:text-bazaar-400">${formatToman(item.price)} ${currency}</p>
          <div class="mt-2 flex items-center gap-2">
            <button type="button" data-cart-dec="${item.id}" class="grid h-6 w-6 place-items-center rounded-lg border border-bazaar-200 text-bazaar-600 hover:bg-bazaar-50 dark:border-white/10 dark:text-bazaar-300 dark:hover:bg-white/5">−</button>
            <span class="min-w-[1.5rem] text-center font-mono text-xs">${item.qty}</span>
            <button type="button" data-cart-inc="${item.id}" class="grid h-6 w-6 place-items-center rounded-lg border border-bazaar-200 text-bazaar-600 hover:bg-bazaar-50 dark:border-white/10 dark:text-bazaar-300 dark:hover:bg-white/5">+</button>
            <button type="button" data-cart-remove="${item.id}" class="ms-auto text-xs text-rose-500 hover:underline">${t("cart_page.drawer_remove", isFa ? "حذف" : "Remove")}</button>
          </div>
        </div>
      </div>`;
  }

  function render() {
    if (!drawerEl) return;
    const items = window.BazaarCart ? window.BazaarCart.readCart() : [];
    const linesBox = drawerEl.querySelector("[data-cart-lines]");
    const emptyBox = drawerEl.querySelector("[data-cart-empty]");
    const footerBox = drawerEl.querySelector("[data-cart-footer]");
    const subtotalEl = drawerEl.querySelector("[data-cart-drawer-subtotal]");

    applyTranslations();

    if (!items.length) {
      linesBox.innerHTML = "";
      linesBox.classList.add("hidden");
      emptyBox.classList.remove("hidden");
      emptyBox.classList.add("flex");
      footerBox.classList.add("hidden");
      return;
    }

    linesBox.classList.remove("hidden");
    emptyBox.classList.add("hidden");
    emptyBox.classList.remove("flex");
    footerBox.classList.remove("hidden");

    linesBox.innerHTML = items.map(lineTemplate).join("");
    subtotalEl.textContent = `${formatToman(window.BazaarCart.totalPrice())} ${t("products_page.toman", lang() === "fa" ? "تومان" : "Toman")}`;

    linesBox.querySelectorAll("[data-cart-inc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-cart-inc"));
        const item = items.find((i) => i.id === id);
        if (item) window.BazaarCart.setQty(id, item.qty + 1);
      });
    });
    linesBox.querySelectorAll("[data-cart-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-cart-dec"));
        const item = items.find((i) => i.id === id);
        if (!item) return;
        if (item.qty <= 1) {
          window.BazaarCart.removeItem(id);
        } else {
          window.BazaarCart.setQty(id, item.qty - 1);
        }
      });
    });
    linesBox.querySelectorAll("[data-cart-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.BazaarCart.removeItem(Number(btn.getAttribute("data-cart-remove")));
      });
    });
  }

  function isOpen() {
    return !!panelEl && !panelEl.classList.contains("-translate-x-full");
  }

  function open() {
    buildDrawer();
    render();
    document.body.classList.add("overflow-hidden");
    backdropEl.classList.remove("opacity-0", "pointer-events-none");
    panelEl.classList.remove("-translate-x-full");
  }

  function close() {
    if (!drawerEl) return;
    document.body.classList.remove("overflow-hidden");
    backdropEl.classList.add("opacity-0", "pointer-events-none");
    panelEl.classList.add("-translate-x-full");
  }

  document.addEventListener("bazaar:item-added", open);
  document.addEventListener("bazaar:cart-changed", () => {
    if (isOpen()) render();
  });
  document.addEventListener("bazaar:translated", () => {
    if (drawerEl) applyTranslations();
    if (isOpen()) render();
  });

  window.BazaarCartDrawer = { open: open, close: close };
})();
