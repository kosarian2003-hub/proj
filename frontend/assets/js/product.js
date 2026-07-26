/**
 * product.js — powers product.html (the Digikala-style product detail page).
 *
 * Data flow:
 *  - GET /api/products/<id>            -> the product itself + "related"
 *    products (same category), read live from products.xlsx just like the
 *    catalog grid.
 *  - GET /api/products/<id>/reviews    -> all reviews for this product, the
 *    average/count, and (if logged in) the current user's own review.
 *  - POST /api/products/<id>/reviews   -> submit or update a review. Reviews
 *    are stored in the backend's SQLite database (see backend/db.py) — never
 *    in localStorage — so they're visible to every visitor, not just the
 *    person who wrote them.
 */
(function () {
  let product = null;
  let related = [];
  let reviews = [];
  let reviewSummary = { count: 0, average: 0 };
  let myReview = null;
  let currentUserInfo = null;
  let qty = 1;

  function getProductId() {
    const params = new URLSearchParams(window.location.search);
    const id = parseInt(params.get("id"), 10);
    return Number.isFinite(id) ? id : null;
  }

  function localizedName(p, lang) {
    return lang === "fa" ? p.name_fa : p.name_en || p.name_fa;
  }
  function localizedCategory(p, lang) {
    return lang === "fa" ? p.category_fa : p.category_en || p.category_fa;
  }
  function localizedDescription(p, lang) {
    return (lang === "fa" ? p.description_fa : p.description_en) || "";
  }
  function localizedSpecs(p, lang) {
    return (lang === "fa" ? p.specs_fa : p.specs_en) || [];
  }

  function starIcon(filled) {
    return `<svg viewBox="0 0 20 20" class="h-4 w-4 ${filled ? "fill-brass-500 text-brass-500" : "fill-none text-bazaar-300 dark:text-bazaar-600"}" stroke="currentColor" stroke-width="1.5">
      <path d="M10 1.6l2.47 5.16 5.63.75-4.13 4.02 1 5.7L10 14.4l-5.07 2.83 1-5.7L1.8 7.5l5.63-.75L10 1.6z"/>
    </svg>`;
  }

  function starRow(rating, size) {
    const cls = size === "lg" ? "h-5 w-5" : "h-4 w-4";
    let html = '<span class="inline-flex items-center gap-0.5">';
    for (let i = 1; i <= 5; i++) {
      html += starIcon(i <= Math.round(rating)).replace(/h-4 w-4/, cls);
    }
    html += "</span>";
    return html;
  }

  function formatDate(iso, lang) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", { year: "numeric", month: "long", day: "numeric" });
    } catch (e) {
      return "";
    }
  }

  // --------------------------------------------------------------------- //
  // gallery
  // --------------------------------------------------------------------- //
  function renderGallery() {
    const mainImg = document.getElementById("gallery-main-img");
    const thumbs = document.getElementById("gallery-thumbs");
    const images = (product.gallery && product.gallery.length ? product.gallery : [product.image]).filter(Boolean);

    if (!images.length) {
      mainImg.style.display = "none";
    } else {
      mainImg.style.display = "";
      mainImg.src = images[0];
      mainImg.alt = localizedName(product, window.BazaarI18n.currentLang());
    }

    thumbs.innerHTML = images
      .map(
        (src, i) => `
        <button data-thumb-src="${src}" class="shrink-0 overflow-hidden rounded-xl border-2 ${i === 0 ? "border-bazaar-700 dark:border-brass-400" : "border-transparent"} transition">
          <img src="${src}" alt="" class="h-16 w-20 object-cover" />
        </button>`
      )
      .join("");

    thumbs.querySelectorAll("[data-thumb-src]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mainImg.style.display = "";
        mainImg.src = btn.getAttribute("data-thumb-src");
        thumbs.querySelectorAll("[data-thumb-src]").forEach((b) => {
          b.classList.remove("border-bazaar-700", "dark:border-brass-400");
          b.classList.add("border-transparent");
        });
        btn.classList.remove("border-transparent");
        btn.classList.add("border-bazaar-700", "dark:border-brass-400");
      });
    });
  }

  // --------------------------------------------------------------------- //
  // main info block
  // --------------------------------------------------------------------- //
  function renderInfo() {
    const t = window.BazaarI18n.t;
    const lang = window.BazaarI18n.currentLang();
    const inStock = product.stock > 0;

    document.title = `${localizedName(product, lang)} | بازار`;
    document.getElementById("breadcrumb-category").textContent = localizedCategory(product, lang);
    document.getElementById("breadcrumb-name").textContent = localizedName(product, lang);
    document.getElementById("product-category-badge").textContent = localizedCategory(product, lang);
    document.getElementById("product-title").textContent = localizedName(product, lang);
    document.getElementById("product-sku").textContent = product.sku || "—";
    document.getElementById("product-price").innerHTML =
      `${formatToman(product.price)}<span class="ms-1 text-xs font-normal text-slate-500 dark:text-slate-400">${t("products_page.toman")}</span>`;

    const stockEl = document.getElementById("product-stock");
    stockEl.className = `mt-1.5 text-xs font-medium ${inStock ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`;
    stockEl.textContent = inStock
      ? `${t("products_page.in_stock")} · ${product.stock} ${t("products_page.stock_count")}`
      : t("products_page.out_of_stock");

    const desc = localizedDescription(product, lang);
    document.getElementById("product-description").textContent = desc || t("product_detail_page.no_description");

    // qty stepper + add to cart
    qty = Math.min(qty, Math.max(1, product.stock || 1));
    document.getElementById("qty-value").textContent = qty;
    const addBtn = document.getElementById("add-to-cart-btn");
    addBtn.disabled = !inStock;
    if (!inStock) {
      addBtn.querySelector("span").textContent = t("product_detail_page.out_of_stock_button");
    } else {
      addBtn.querySelector("span").textContent = t("products_page.add_to_cart");
    }
  }

  function wireQtyAndCart() {
    const t = window.BazaarI18n.t;
    document.getElementById("qty-decrement").addEventListener("click", () => {
      qty = Math.max(1, qty - 1);
      document.getElementById("qty-value").textContent = qty;
    });
    document.getElementById("qty-increment").addEventListener("click", () => {
      qty = Math.min(product.stock || 1, qty + 1);
      document.getElementById("qty-value").textContent = qty;
    });
    document.getElementById("add-to-cart-btn").addEventListener("click", () => {
      if (product.stock <= 0) return;
      const btn = document.getElementById("add-to-cart-btn");
      const span = btn.querySelector("span");
      const original = span.textContent;
      BazaarCart.addItem(product, qty);
      span.textContent = t("products_page.added") + " ✓";
      btn.classList.add("bg-emerald-600", "dark:bg-emerald-600");
      setTimeout(() => {
        span.textContent = original;
        btn.classList.remove("bg-emerald-600", "dark:bg-emerald-600");
      }, 1200);
    });
  }

  // --------------------------------------------------------------------- //
  // specs table
  // --------------------------------------------------------------------- //
  function renderSpecs() {
    const t = window.BazaarI18n.t;
    const lang = window.BazaarI18n.currentLang();
    const specs = localizedSpecs(product, lang);
    const box = document.getElementById("specs-table");

    if (!specs.length) {
      box.innerHTML = `<p class="p-5 text-sm text-bazaar-500 dark:text-bazaar-400">${t("product_detail_page.no_specs")}</p>`;
      return;
    }

    box.innerHTML = specs
      .map(
        (s, i) => `
        <div class="flex items-center justify-between gap-4 px-5 py-3 text-sm ${i % 2 === 0 ? "bg-white dark:bg-bazaar-900/40" : "bg-bazaar-50 dark:bg-bazaar-900/70"}">
          <span class="text-bazaar-500 dark:text-bazaar-400">${s.label}</span>
          <span class="font-medium text-bazaar-900 dark:text-bazaar-100">${s.value}</span>
        </div>`
      )
      .join("");
  }

  // --------------------------------------------------------------------- //
  // related products
  // --------------------------------------------------------------------- //
  function renderRelated() {
    const lang = window.BazaarI18n.currentLang();
    const grid = document.getElementById("related-grid");
    const empty = document.getElementById("related-empty");

    if (!related.length || typeof window.BazaarProductCard !== "function") {
      grid.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    grid.innerHTML = related.map((p) => window.BazaarProductCard(p, lang)).join("");

    grid.querySelectorAll("[data-add-to-cart]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest("[data-product-id]");
        const id = Number(card.getAttribute("data-product-id"));
        const relatedProduct = related.find((p) => p.id === id);
        const t = window.BazaarI18n.t;
        const result = BazaarCart.addItem(relatedProduct, 1);
        const original = btn.textContent;
        if (result.added === 0) {
          btn.textContent = t("cart_page.max_stock_reached");
        } else {
          btn.textContent = t("products_page.added") + " ✓";
        }
        setTimeout(() => (btn.textContent = original), 1200);
      });
    });
  }

  // --------------------------------------------------------------------- //
  // reviews
  // --------------------------------------------------------------------- //
  function renderReviewSummary() {
    const t = window.BazaarI18n.t;
    const box = document.getElementById("product-rating-summary");
    const countLabel = document.getElementById("reviews-count-label");

    if (reviewSummary.count > 0) {
      box.classList.remove("hidden");
      box.classList.add("flex");
      box.innerHTML = `${starRow(reviewSummary.average)}
        <span class="font-mono font-semibold text-bazaar-900 dark:text-bazaar-100">${reviewSummary.average}</span>
        <span class="text-bazaar-400 dark:text-bazaar-500">·</span>
        <span class="text-bazaar-500 dark:text-bazaar-400">${t("product_detail_page.reviews_count").replace("{count}", reviewSummary.count)}</span>`;
    } else {
      box.classList.add("hidden");
      box.classList.remove("flex");
    }
    countLabel.textContent = reviewSummary.count
      ? t("product_detail_page.reviews_count").replace("{count}", reviewSummary.count)
      : "";
  }

  function renderReviewList() {
    const lang = window.BazaarI18n.currentLang();
    const t = window.BazaarI18n.t;
    const list = document.getElementById("reviews-list");
    const empty = document.getElementById("reviews-empty");

    if (!reviews.length) {
      list.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    list.innerHTML = reviews
      .map((r) => {
        const isMine = currentUserInfo && r.user_id === currentUserInfo.id;
        const initials = (r.user_name || "?").trim().charAt(0).toUpperCase();
        return `
        <div class="flex gap-3.5">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bazaar-700 text-xs font-bold text-white">${initials}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-bazaar-900 dark:text-bazaar-100">${r.user_name}</span>
              ${isMine ? `<span class="rounded-full bg-brass-500/20 px-2 py-0.5 text-[10px] font-medium text-brass-500">${t("product_detail_page.your_review_badge")}</span>` : ""}
              <span class="text-xs text-bazaar-400 dark:text-bazaar-500">${formatDate(r.created_at, lang)}</span>
            </div>
            <div class="mt-1">${starRow(r.rating)}</div>
            ${r.comment ? `<p class="mt-2 text-sm leading-6 text-bazaar-700 dark:text-bazaar-300">${escapeHtml(r.comment)}</p>` : ""}
          </div>
        </div>`;
      })
      .join("");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  let selectedRating = 0;

  function renderReviewForm() {
    const t = window.BazaarI18n.t;
    const box = document.getElementById("review-form-box");

    if (!currentUserInfo) {
      box.innerHTML = `
        <p class="text-sm text-bazaar-600 dark:text-bazaar-400">${t("product_detail_page.review_login_required")}</p>
        <a href="login.html" class="mt-3 inline-block rounded-full bg-bazaar-700 px-5 py-2 text-sm font-semibold text-white hover:bg-bazaar-800">${t("product_detail_page.review_login_cta")}</a>`;
      return;
    }

    selectedRating = myReview ? myReview.rating : 0;
    box.innerHTML = `
      <h3 class="text-sm font-semibold text-bazaar-900 dark:text-bazaar-100">${t("product_detail_page.review_form_title")}</h3>
      <div class="mt-2.5">
        <p class="text-xs text-bazaar-500 dark:text-bazaar-400">${t("product_detail_page.review_rating_label")}</p>
        <div id="rating-picker" class="mt-1.5 flex gap-1"></div>
      </div>
      <textarea id="review-comment" rows="3" placeholder="${t("product_detail_page.review_comment_placeholder")}"
        class="mt-3 w-full rounded-xl border border-bazaar-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-bazaar-500 dark:border-white/10 dark:bg-bazaar-800 dark:text-bazaar-100">${myReview ? escapeHtml(myReview.comment || "") : ""}</textarea>
      <p id="review-form-msg" class="mt-2 hidden text-xs"></p>
      <button id="review-submit-btn" class="mt-3 rounded-xl bg-bazaar-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-bazaar-800 dark:bg-bazaar-600 dark:hover:bg-bazaar-500">
        ${myReview ? t("product_detail_page.review_update_submit") : t("product_detail_page.review_submit")}
      </button>`;

    const picker = document.getElementById("rating-picker");
    function drawPicker() {
      picker.innerHTML = [1, 2, 3, 4, 5]
        .map((i) => `<button type="button" data-star="${i}" class="p-0.5">${starIcon(i <= selectedRating).replace(/h-4 w-4/, "h-6 w-6")}</button>`)
        .join("");
      picker.querySelectorAll("[data-star]").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedRating = Number(btn.getAttribute("data-star"));
          drawPicker();
        });
      });
    }
    drawPicker();

    document.getElementById("review-submit-btn").addEventListener("click", submitReview);
  }

  async function submitReview() {
    const t = window.BazaarI18n.t;
    const msg = document.getElementById("review-form-msg");
    const comment = document.getElementById("review-comment").value.trim();

    if (!selectedRating) {
      msg.textContent = t("product_detail_page.select_rating_first");
      msg.className = "mt-2 text-xs text-rose-500";
      msg.classList.remove("hidden");
      return;
    }

    const btn = document.getElementById("review-submit-btn");
    btn.disabled = true;
    try {
      const res = await BazaarAPI.post(`/api/products/${product.id}/reviews`, { rating: selectedRating, comment });
      if (!res.ok) throw new Error(res.error || "error");
      reviews = res.reviews || [];
      reviewSummary = res.summary || reviewSummary;
      myReview = res.my_review || null;
      renderReviewSummary();
      renderReviewList();
      msg.textContent = t("product_detail_page.review_submitted");
      msg.className = "mt-2 text-xs text-emerald-600 dark:text-emerald-400";
      msg.classList.remove("hidden");
      renderReviewForm();
    } catch (e) {
      msg.textContent = t("product_detail_page.review_error");
      msg.className = "mt-2 text-xs text-rose-500";
      msg.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  }

  // --------------------------------------------------------------------- //
  // orchestration
  // --------------------------------------------------------------------- //
  function renderAll() {
    renderGallery();
    renderInfo();
    renderSpecs();
    renderRelated();
    renderReviewSummary();
    renderReviewList();
    renderReviewForm();
  }

  async function load() {
    const id = getProductId();
    const loading = document.getElementById("product-loading");
    const errorBox = document.getElementById("product-error");
    const content = document.getElementById("product-content");

    if (id === null) {
      loading.classList.add("hidden");
      errorBox.classList.remove("hidden");
      return;
    }

    try {
      const [productRes, reviewsRes, meRes] = await Promise.all([
        BazaarAPI.get(`/api/products/${id}`),
        BazaarAPI.get(`/api/products/${id}/reviews`),
        BazaarAPI.get("/api/auth/me"),
      ]);

      if (!productRes.ok) throw new Error(productRes.error || "not found");

      product = productRes.product;
      related = productRes.related || [];
      reviews = reviewsRes.reviews || [];
      reviewSummary = reviewsRes.summary || { count: 0, average: 0 };
      myReview = reviewsRes.my_review || null;
      currentUserInfo = meRes.user || null;
      qty = 1;

      loading.classList.add("hidden");
      content.classList.remove("hidden");
      renderAll();
      wireQtyAndCart();
    } catch (e) {
      loading.classList.add("hidden");
      errorBox.classList.remove("hidden");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("product-content")) return;
    load();
  });

  document.addEventListener("bazaar:translated", () => {
    if (product) renderAll();
  });
})();
