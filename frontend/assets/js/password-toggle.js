/**
 * password-toggle.js — adds a show/hide (eye) icon button inside every
 * <input type="password"> on the page, so the customer can check what
 * they typed before submitting. Just include this script on a page; it
 * finds every password field itself, no extra markup needed per input.
 */
(function () {
  const EYE_OPEN =
    '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_CLOSED =
    '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18"/><path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c7 0 10.5 7 10.5 7a13.4 13.4 0 0 1-3.1 4.1M6.5 6.6C3.4 8.5 1.5 12 1.5 12s3.5 7 10.5 7c1.5 0 2.8-.3 4-.8"/><path d="M9.9 10a3 3 0 0 0 4.2 4.2"/></svg>';

  function wrapInput(input) {
    if (input.dataset.pwToggleWrapped) return;
    input.dataset.pwToggleWrapped = "1";

    const wrapper = document.createElement("div");
    wrapper.className = "relative";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    // logical padding/positioning so this works correctly in both the
    // RTL (Persian) and LTR (English) layouts, like the rest of the site
    input.classList.add("pe-10");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.tabIndex = -1;
    btn.setAttribute("aria-label", "toggle password visibility");
    btn.className =
      "absolute inset-y-0 end-1.5 my-1 grid w-8 place-items-center rounded-lg text-bazaar-500 hover:bg-bazaar-100 dark:text-bazaar-300 dark:hover:bg-white/10";
    btn.innerHTML = EYE_OPEN;

    btn.addEventListener("click", () => {
      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";
      btn.innerHTML = willShow ? EYE_CLOSED : EYE_OPEN;
    });

    wrapper.appendChild(btn);
  }

  function init() {
    document.querySelectorAll('input[type="password"]').forEach(wrapInput);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
