/**
 * products.js — pulls products from GET /api/products (which reads the live
 * Excel file on the server) and builds one Product Card per product,
 * re-fetching every 10 seconds so edits to the spreadsheet show up live.
 *
 * Search / category filter / sort all run client-side against the last
 * fetched product list — the catalog is small, so there's no need for a
 * server round-trip on every keystroke.
 */
(function () {
  const POLL_MS = 10000;
  let lastUpdatedAt = null;
  let allProducts = [];

  function cardTemplate(p, lang) {
    const name = lang === "fa" ? p.name_fa : p.name_en || p.name_fa;
    const category = lang === "fa" ? p.category_fa : p.category_en || p.category_fa;
    const inStock = p.stock > 0;
    const t = window.BazaarI18n.t;

    const media = p.image
      ? `<img src="${p.image}" alt="${name}" loading="lazy" class="h-full w-full object-cover" onerror="this.remove()" />`
      : `<svg viewBox="0 0 64 64" class="h-16 w-16 text-bazaar-700/70 dark:text-bazaar-300/70" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="14" y="6" width="36" height="52" rx="4"/>
          <line x1="20" y1="16" x2="44" y2="16"/>
          <circle cx="32" cy="36" r="10"/>
          <circle cx="32" cy="36" r="3"/>
        </svg>`;

    return `
      <article class="group relative flex flex-col overflow-hidden rounded-2xl border border-bazaar-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-white/5 dark:bg-bazaar-900/40" data-product-id="${p.id}">
        <a href="product.html?id=${p.id}" class="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-bazaar-50 to-bazaar-100 dark:from-bazaar-800 dark:to-bazaar-900">
          ${media}
          <span class="absolute top-3 ${document.documentElement.dir === 'rtl' ? 'right-3' : 'left-3'} rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-bazaar-900 shadow dark:bg-bazaar-950/80 dark:text-bazaar-100">${category || ""}</span>
        </a>
        <div class="flex flex-1 flex-col gap-3 p-4">
          <a href="product.html?id=${p.id}" class="font-display text-[15px] font-semibold leading-snug text-bazaar-950 hover:text-bazaar-700 dark:text-bazaar-100 dark:hover:text-brass-400">${name}</a>
          <div class="mt-auto flex items-end justify-between">
            <div>
              <p class="font-mono text-lg font-bold text-bazaar-900 dark:text-bazaar-300">${formatToman(p.price)}<span class="ms-1 text-xs font-normal text-slate-500 dark:text-slate-400">${t("products_page.toman")}</span></p>
              <p class="mt-0.5 text-xs ${inStock ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}">
                ${inStock ? `${t("products_page.in_stock")} · ${p.stock} ${t("products_page.stock_count")}` : t("products_page.out_of_stock")}
              </p>
            </div>
          </div>
          <button
            data-add-to-cart
            ${inStock ? "" : "disabled"}
            class="mt-1 w-full rounded-xl bg-bazaar-700 py-2.5 text-sm font-semibold text-white transition hover:bg-bazaar-800 disabled:cursor-not-allowed disabled:bg-bazaar-200 disabled:text-bazaar-500 dark:bg-bazaar-600 dark:hover:bg-bazaar-500 dark:disabled:bg-bazaar-800">
            ${t("products_page.add_to_cart")}
          </button>
        </div>
      </article>`;
  }

  function populateCategoryOptions(products, lang) {
    const select = document.getElementById("category-filter");
    if (!select) return;
    const current = select.value;
    const key = lang === "fa" ? "category_fa" : "category_en";
    const categories = [...new Set(products.map((p) => p[key]).filter(Boolean))];
    select.innerHTML =
      `<option value="">${window.BazaarI18n.t("products_page.all_categories")}</option>` +
      categories.map((c) => `<option value="${c}">${c}</option>`).join("");
    if (categories.includes(current)) select.value = current;
  }

  function getFilteredSorted(lang) {
    const searchTerm = (document.getElementById("product-search")?.value || "").trim().toLowerCase();
    const category = document.getElementById("category-filter")?.value || "";
    const sort = document.getElementById("sort-select")?.value || "default";
    const key = lang === "fa" ? "category_fa" : "category_en";

    let list = allProducts.filter((p) => {
      const name = (lang === "fa" ? p.name_fa : p.name_en || p.name_fa).toLowerCase();
      const matchesSearch = !searchTerm || name.includes(searchTerm) || (p.sku || "").toLowerCase().includes(searchTerm);
      const matchesCategory = !category || p[key] === category;
      return matchesSearch && matchesCategory;
    });

    if (sort === "price_asc") list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === "stock_desc") list = [...list].sort((a, b) => b.stock - a.stock);

    return list;
  }

  function render() {
    const grid = document.getElementById("product-grid");
    const emptyState = document.getElementById("product-empty");
    if (!grid) return;

    const lang = window.BazaarI18n.currentLang();
    populateCategoryOptions(allProducts, lang);
    const products = getFilteredSorted(lang);

    if (!products.length) {
      grid.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      return;
    }
    if (emptyState) emptyState.classList.add("hidden");

    grid.innerHTML = products.map((p) => cardTemplate(p, lang)).join("");

    grid.querySelectorAll("[data-add-to-cart]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest("[data-product-id]");
        const id = Number(card.getAttribute("data-product-id"));
        const product = allProducts.find((p) => p.id === id);
        const result = BazaarCart.addItem(product, 1);

        const original = btn.textContent;
        if (result.added === 0) {
          btn.textContent = window.BazaarI18n.t("cart_page.max_stock_reached");
          btn.classList.add("bg-amber-500", "dark:bg-amber-600");
          setTimeout(() => {
            btn.textContent = original;
            btn.classList.remove("bg-amber-500", "dark:bg-amber-600");
          }, 1400);
          return;
        }
        btn.textContent = window.BazaarI18n.t("products_page.added") + " ✓";
        btn.classList.add("bg-emerald-600", "dark:bg-emerald-600");
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove("bg-emerald-600", "dark:bg-emerald-600");
        }, 1000);
      });
    });
  }

  async function fetchAndRender(silent) {
    const status = document.getElementById("live-status");
    const errorBox = document.getElementById("product-error");
    const errorDetail = document.getElementById("product-error-detail");
    try {
      const data = await BazaarAPI.get("/api/products");
      if (data.ok === false) throw new Error(data.error || "unknown error");
      lastUpdatedAt = data.updated_at;
      allProducts = data.products || [];
      render();
      if (errorBox) errorBox.classList.add("hidden");
      const synced = document.getElementById("last-synced");
      if (synced) {
        const fileTime = data.updated_at ? new Date(data.updated_at * 1000).toLocaleTimeString("fa-IR") : "—";
        const now = new Date().toLocaleTimeString("fa-IR");
        synced.textContent = `فایل: ${fileTime} — دریافت: ${now}`;
      }
      if (status) {
        status.classList.remove("bg-rose-500");
        status.classList.add("bg-emerald-500");
      }
    } catch (e) {
      if (errorBox) {
        errorBox.classList.remove("hidden");
        if (errorDetail) errorDetail.textContent = e.message || String(e);
      }
      if (status) {
        status.classList.remove("bg-emerald-500");
        status.classList.add("bg-rose-500");
      }
      if (!silent) console.error("Failed to load products:", e);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("product-grid")) return;
    fetchAndRender(false);
    setInterval(() => fetchAndRender(true), POLL_MS);

    ["product-search", "category-filter", "sort-select"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", render);
    });
  });

  // re-render with the new language's product names when the language changes
  document.addEventListener("bazaar:translated", () => {
    if (document.getElementById("product-grid")) render();
  });

  // exposed so product.html can render "similar products" cards with the
  // exact same markup/behavior instead of duplicating the template
  window.BazaarProductCard = cardTemplate;
})();
