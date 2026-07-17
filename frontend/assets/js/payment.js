/**
 * payment.js — renders the cart on the checkout page, shows the shipping rule
 * (first order free, flat fee after), and drives order creation + payment.
 *
 * Checkout requires an account: on load we check /api/auth/me, and if no one
 * is logged in we send the customer to the login page with a `redirect` back
 * to this page. Once logged in, the recipient's first/last name fields are
 * pre-filled from the account so they don't have to retype them.
 */
(function () {
  let appliedCoupon = null; // { code, discount_percent } | null

  function renderCartLines() {
    const list = document.getElementById("cart-lines");
    const emptyBox = document.getElementById("cart-empty");
    const summaryBox = document.getElementById("cart-summary");
    if (!list) return;

    const items = KhorshidCart.readCart();
    const lang = window.KhorshidI18n.currentLang();
    const t = window.KhorshidI18n.t;

    if (!items.length) {
      list.innerHTML = "";
      if (emptyBox) emptyBox.classList.remove("hidden");
      if (summaryBox) summaryBox.classList.add("hidden");
      return;
    }
    if (emptyBox) emptyBox.classList.add("hidden");
    if (summaryBox) summaryBox.classList.remove("hidden");

    list.innerHTML = items
      .map(
        (i) => `
      <div class="flex items-center justify-between gap-3 border-b border-slate-100 py-3 dark:border-slate-700/60">
        <div>
          <p class="text-sm font-medium text-slate-800 dark:text-slate-100">${lang === "fa" ? i.name_fa : i.name_en || i.name_fa}</p>
          <p class="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">${formatToman(i.price)} ${t("products_page.toman")}</p>
        </div>
        <div class="flex flex-col items-end gap-1">
          <div class="flex items-center gap-2">
            <input type="number" min="1" max="${i.stock ?? ""}" value="${i.qty}" data-qty-input data-id="${i.id}"
              class="w-14 rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-center text-sm dark:border-slate-600" />
            <button data-remove-id="${i.id}" class="text-xs text-rose-500 hover:underline">✕</button>
          </div>
        </div>
      </div>`
      )
      .join("");

    list.querySelectorAll("[data-qty-input]").forEach((input) => {
      input.addEventListener("change", () => {
        const requested = Number(input.value);
        const applied = KhorshidCart.setQty(Number(input.getAttribute("data-id")), requested);
        if (applied !== null && applied < requested) {
          alert(t("cart_page.max_stock_reached"));
        }
        renderAll();
      });
    });
    list.querySelectorAll("[data-remove-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        KhorshidCart.removeItem(Number(btn.getAttribute("data-remove-id")));
        renderAll();
      });
    });
  }

  function renderTotals() {
    const subtotalEl = document.getElementById("subtotal-amount");
    const totalEl = document.getElementById("total-amount");
    const shippingEl = document.getElementById("shipping-amount");
    const discountRow = document.getElementById("discount-row");
    const discountEl = document.getElementById("discount-amount");
    if (!subtotalEl) return;
    const t = window.KhorshidI18n.t;

    const subtotal = KhorshidCart.totalPrice();
    subtotalEl.textContent = `${formatToman(subtotal)} ${t("products_page.toman")}`;

    const discount = appliedCoupon ? Math.round((subtotal * appliedCoupon.discount_percent) / 100) : 0;
    if (discount > 0) {
      discountRow.classList.remove("hidden");
      discountEl.textContent = `-${formatToman(discount)} ${t("products_page.toman")}`;
    } else {
      discountRow.classList.add("hidden");
    }

    // We don't know free-shipping eligibility until the order is created
    // server-side (it depends on the logged-in user's order history), so we
    // show the flat fee as an estimate and the real figure after payment.
    shippingEl.textContent = t("cart_page.free_shipping");
    totalEl.textContent = `${formatToman(Math.max(0, subtotal - discount))} ${t("products_page.toman")}`;
  }

  function renderAll() {
    renderCartLines();
    renderTotals();
  }

  async function requireLoginOrRedirect() {
    const res = await KhorshidAPI.get("/api/auth/me");
    if (!res.user) {
      window.location.href = "login.html?redirect=payment.html";
      return null;
    }
    return res.user;
  }

  function prefillCustomer(user) {
    const form = document.getElementById("checkout-form");
    if (!form || !user) return;
    if (form.customer_first_name && !form.customer_first_name.value) {
      form.customer_first_name.value = user.first_name || "";
    }
    if (form.customer_last_name && !form.customer_last_name.value) {
      form.customer_last_name.value = user.last_name || "";
    }
    if (form.customer_phone && !form.customer_phone.value && user.phone) {
      form.customer_phone.value = user.phone;
    }
    if (user.address && window.KhorshidMap) {
      window.KhorshidMap.setLocation(user.address.lat, user.address.lng);
    }
  }

  async function handlePay(e) {
    e.preventDefault();
    const form = e.target;
    const t = window.KhorshidI18n.t;
    const items = KhorshidCart.readCart();
    if (!items.length) return;

    const loc = window.KhorshidMap ? window.KhorshidMap.getLocation() : null;
    if (!loc) {
      alert(t("cart_page.select_location_first"));
      return;
    }

    const payBtn = document.getElementById("pay-button");
    payBtn.disabled = true;
    payBtn.textContent = t("cart_page.processing");

    const orderRes = await KhorshidAPI.post("/api/orders", {
      items: items.map((i) => ({ id: i.id, name: i.name_fa, price: i.price, qty: i.qty })),
      delivery: {
        lat: loc.lat,
        lng: loc.lng,
        address: loc.address || "",
        note: form.address_note.value.trim(),
      },
      customer: {
        first_name: form.customer_first_name.value.trim(),
        last_name: form.customer_last_name.value.trim(),
        name: `${form.customer_first_name.value.trim()} ${form.customer_last_name.value.trim()}`.trim(),
        phone: form.customer_phone.value.trim(),
      },
      coupon_code: appliedCoupon ? appliedCoupon.code : "",
    });

    if (!orderRes.ok) {
      payBtn.disabled = false;
      payBtn.textContent = t("cart_page.pay_button");
      if (orderRes.error === "login_required") {
        window.location.href = "login.html?redirect=payment.html";
        return;
      }
      if (orderRes.error === "insufficient_stock") {
        alert(t("cart_page.insufficient_stock").replace("{available}", orderRes.available));
        return;
      }
      alert(orderRes.error || "order_failed");
      return;
    }

    const payRes = await KhorshidAPI.post(`/api/orders/${orderRes.order.id}/pay`);
    if (payRes.ok) {
      KhorshidCart.clearCart();
      document.getElementById("checkout-form-wrap").classList.add("hidden");
      const successBox = document.getElementById("payment-success");
      successBox.classList.remove("hidden");
      document.getElementById("invoice-number").textContent = payRes.invoice.id;
      document.getElementById("final-total").textContent =
        `${formatToman(payRes.order.total)} ${t("products_page.toman")}`;
    } else {
      payBtn.disabled = false;
      payBtn.textContent = t("cart_page.pay_button");
    }
  }

  async function setupCoupon() {
    const applyBtn = document.getElementById("coupon-apply");
    const input = document.getElementById("coupon-input");
    const message = document.getElementById("coupon-message");
    if (!applyBtn) return;
    const t = window.KhorshidI18n.t;

    applyBtn.addEventListener("click", async () => {
      const code = input.value.trim();
      if (!code) return;
      const res = await KhorshidAPI.post("/api/coupons/validate", { code });
      message.classList.remove("hidden");
      if (res.ok) {
        appliedCoupon = { code: res.code, discount_percent: res.discount_percent };
        message.textContent = t("cart_page.coupon_applied").replace("{percent}", res.discount_percent);
        message.className = "mt-2 text-xs text-emerald-600 dark:text-emerald-400";
      } else {
        appliedCoupon = null;
        message.textContent = t("cart_page.coupon_invalid");
        message.className = "mt-2 text-xs text-rose-600 dark:text-rose-400";
      }
      renderTotals();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!document.getElementById("cart-lines")) return;
    renderAll();
    setupCoupon();
    const user = await requireLoginOrRedirect();
    if (!user) return; // already redirecting to login
    prefillCustomer(user);
    const form = document.getElementById("checkout-form");
    if (form) form.addEventListener("submit", handlePay);
  });

  document.addEventListener("khorshid:translated", () => {
    if (document.getElementById("cart-lines")) renderAll();
  });
})();
