/**
 * account.js — wires up the account page:
 *  - profile info (first/last name, phone) + avatar upload
 *  - saved delivery address, using the same Leaflet pin/reverse-geocode
 *    mechanism as the checkout page (map.js)
 *  - change password
 *
 * Requires being logged in; redirects to login otherwise, same pattern as
 * orders.js / payment.js.
 */
(function () {
  function showMessage(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
    el.className = "mt-2 text-xs " + (isError ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400");
  }

  function renderAvatar(user) {
    const el = document.getElementById("avatar-preview");
    if (!el) return;
    if (user.avatar_url) {
      el.innerHTML = `<img src="${user.avatar_url}?t=${Date.now()}" alt="" class="h-full w-full object-cover">`;
    } else {
      const initials = ((user.first_name || user.name || "?")[0] || "?") + ((user.last_name || "")[0] || "");
      el.textContent = initials.toUpperCase();
    }
  }

  function fillProfileForm(user) {
    const form = document.getElementById("profile-form");
    if (!form) return;
    form.first_name.value = user.first_name || "";
    form.last_name.value = user.last_name || "";
    form.phone.value = user.phone || "";
  }

  function setupAvatarUpload(t) {
    const btn = document.getElementById("avatar-button");
    const input = document.getElementById("avatar-input");
    if (!btn || !input) return;

    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", credentials: "include", body });
      const data = await res.json();
      const msgEl = document.getElementById("profile-message");
      if (data.ok) {
        renderAvatar(data.user);
        showMessage(msgEl, t("account_page.saved_message"), false);
      } else {
        showMessage(msgEl, t("account_page.avatar_error"), true);
      }
      input.value = "";
    });
  }

  function setupProfileForm(t) {
    const form = document.getElementById("profile-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById("profile-message");
      const res = await KhorshidAPI.post("/api/profile/update", {
        first_name: form.first_name.value.trim(),
        last_name: form.last_name.value.trim(),
        phone: form.phone.value.trim(),
      });
      if (res.ok) {
        fillProfileForm(res.user);
        renderAvatar(res.user);
        showMessage(msgEl, t("account_page.saved_message"), false);
      } else {
        showMessage(msgEl, t("auth.error_invalid"), true);
      }
    });
  }

  function setupAddress(user, t) {
    const saveBtn = document.getElementById("address-save");
    if (!saveBtn) return;

    // prefill the saved pin, if there is one
    if (user.address && window.KhorshidMap) {
      window.KhorshidMap.setLocation(user.address.lat, user.address.lng);
    }

    saveBtn.addEventListener("click", async () => {
      const msgEl = document.getElementById("address-message");
      const loc = window.KhorshidMap ? window.KhorshidMap.getLocation() : null;
      if (!loc) {
        showMessage(msgEl, t("cart_page.select_location_first"), true);
        return;
      }
      const res = await KhorshidAPI.post("/api/profile/address", {
        lat: loc.lat,
        lng: loc.lng,
        address: loc.address || "",
      });
      if (res.ok) {
        showMessage(msgEl, t("account_page.address_saved"), false);
      } else {
        showMessage(msgEl, t("auth.error_invalid"), true);
      }
    });
  }

  function setupPasswordForm(t) {
    const form = document.getElementById("password-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById("password-message");
      const currentPassword = form.current_password.value;
      const newPassword = form.new_password.value;
      const confirmPassword = form.confirm_password.value;

      if (newPassword !== confirmPassword) {
        showMessage(msgEl, t("account_page.password_mismatch"), true);
        return;
      }

      const res = await KhorshidAPI.post("/api/profile/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      if (res.ok) {
        form.reset();
        showMessage(msgEl, t("account_page.password_changed"), false);
      } else if (res.error === "invalid_current_password") {
        showMessage(msgEl, t("account_page.wrong_current_password"), true);
      } else {
        showMessage(msgEl, t("auth.error_invalid"), true);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!document.getElementById("account-content")) return;

    const me = await KhorshidAPI.get("/api/auth/me");
    if (!me.user) {
      window.location.href = "login.html?redirect=account.html";
      return;
    }

    const t = window.KhorshidI18n.t;
    fillProfileForm(me.user);
    renderAvatar(me.user);
    setupAvatarUpload(t);
    setupProfileForm(t);
    setupAddress(me.user, t);
    setupPasswordForm(t);
  });
})();
