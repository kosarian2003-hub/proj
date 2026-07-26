/**
 * nav.js — mobile menu toggle + swap login/signup for account/logout when
 * signed in.
 *
 * The auth-state check runs on both DOMContentLoaded AND the `pageshow`
 * event. That second one matters: when the browser restores a page from
 * back/forward cache (e.g. the user clicks the browser's Back button),
 * DOMContentLoaded does NOT fire again — the page is repainted exactly as
 * it looked before, which could show stale "logged out" nav even though
 * the person is still logged in. `pageshow` fires in both the normal-load
 * and bfcache-restore cases, so re-running the check there keeps the nav
 * correct either way.
 */
(function () {
  function setupMobileMenu() {
    const menuBtn = document.querySelector("[data-menu-toggle]");
    const menu = document.querySelector("[data-mobile-menu]");
    if (menuBtn && menu && !menuBtn.dataset.wired) {
      menuBtn.dataset.wired = "1";
      menuBtn.addEventListener("click", () => menu.classList.toggle("hidden"));
    }
  }

  function setupLogout() {
    document.querySelectorAll("[data-logout]").forEach((btn) => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = "1";
      btn.addEventListener("click", async () => {
        await BazaarAPI.post("/api/auth/logout");
        window.location.reload();
      });
    });
  }

  async function syncAuthState() {
    try {
      const res = await BazaarAPI.get("/api/auth/me");
      const loggedOutEls = document.querySelectorAll("[data-auth-guest]");
      const loggedInEls = document.querySelectorAll("[data-auth-user]");
      const adminEls = document.querySelectorAll("[data-admin-only]");

      if (res.user) {
        loggedOutEls.forEach((el) => {
          el.classList.add("hidden");
          if (el.dataset.authFlex) el.classList.remove(el.dataset.authFlex);
        });
        loggedInEls.forEach((el) => {
          el.classList.remove("hidden");
          if (el.dataset.authFlex) el.classList.add(el.dataset.authFlex); // re-apply flex layout that "hidden" overrides
        });
        document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = res.user.name));

        // Show the uploaded profile photo when there is one; otherwise fall
        // back to a generated initials avatar (no external calls needed).
        document.querySelectorAll("[data-user-avatar]").forEach((el) => {
          if (res.user.avatar_url) {
            el.innerHTML = `<img src="${res.user.avatar_url}" alt="" class="h-full w-full rounded-full object-cover">`;
          } else {
            const initials = ((res.user.first_name || res.user.name || "?")[0] || "?") +
              ((res.user.last_name || "")[0] || "");
            el.textContent = initials.toUpperCase();
          }
        });

        adminEls.forEach((el) => el.classList.toggle("hidden", !res.user.is_admin));
      } else {
        // definitely logged out — make sure we're not stuck showing a
        // stale "logged in" nav from a bfcache restore or an old session
        loggedOutEls.forEach((el) => {
          el.classList.remove("hidden");
          if (el.dataset.authFlex) el.classList.add(el.dataset.authFlex);
        });
        loggedInEls.forEach((el) => {
          el.classList.add("hidden");
          if (el.dataset.authFlex) el.classList.remove(el.dataset.authFlex);
        });
        adminEls.forEach((el) => el.classList.add("hidden"));
      }
    } catch (e) {
      /* backend not reachable — leave whatever the page already shows */
    }
  }

  function setupBottomNavActiveState() {
    const bar = document.querySelector("[data-bottom-nav]");
    if (!bar) return;
    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const sectionByFile = {
      "index.html": "home",
      "products.html": "products",
      "product.html": "products",
      "payment.html": "cart",
      "orders.html": "orders",
      "account.html": "account",
      "login.html": "account",
      "signup.html": "account",
    };
    const activeSection = sectionByFile[file];
    bar.querySelectorAll("[data-nav-page]").forEach((link) => {
      const isActive = link.getAttribute("data-nav-page") === activeSection;
      link.classList.toggle("text-bazaar-700", isActive);
      link.classList.toggle("dark:text-brass-400", isActive);
      link.classList.toggle("text-bazaar-500", !isActive);
      link.classList.toggle("dark:text-bazaar-400", !isActive);
    });
  }

  function init() {
    setupMobileMenu();
    setupLogout();
    setupBottomNavActiveState();
    syncAuthState();
  }

  document.addEventListener("DOMContentLoaded", init);
  // re-sync on bfcache restores (back/forward navigation) and regular loads
  window.addEventListener("pageshow", () => {
    setupMobileMenu();
    setupLogout();
    setupBottomNavActiveState();
    syncAuthState();
  });
})();
