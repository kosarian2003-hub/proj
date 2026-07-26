/**
 * repair.js — submits the repair-request form; if the visitor is logged in,
 * also lists their previous repair requests with status.
 */
(function () {
  const STATUS_LABELS = {
    new: "repair_page.status_new",
    in_progress: "repair_page.status_in_progress",
    done: "repair_page.status_done",
    cancelled: "repair_page.status_cancelled",
  };

  function repairCard(r, t) {
    const lang = window.BazaarI18n.currentLang();
    const date = new Date(r.created_at).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US");
    return `
      <div class="rounded-xl border border-bazaar-100 bg-white p-4 text-sm dark:border-white/5 dark:bg-bazaar-900/40">
        <div class="flex items-center justify-between">
          <p class="font-medium text-bazaar-900 dark:text-white">${r.device_type}</p>
          <span class="rounded-full bg-bazaar-100 px-2.5 py-0.5 text-xs text-bazaar-700 dark:bg-white/10 dark:text-bazaar-300">${t(STATUS_LABELS[r.status] || r.status)}</span>
        </div>
        <p class="mt-1 text-bazaar-600 dark:text-bazaar-400">${r.issue}</p>
        <p class="mt-2 text-xs text-bazaar-400">${date}</p>
      </div>`;
  }

  async function loadMyRepairs() {
    const me = await BazaarAPI.get("/api/auth/me");
    if (!me.user) return;
    const data = await BazaarAPI.get("/api/repairs/mine");
    if (!data.ok || !data.repairs.length) return;
    const t = window.BazaarI18n.t;
    document.getElementById("my-repairs-section").classList.remove("hidden");
    document.getElementById("my-repairs-list").innerHTML = data.repairs.map((r) => repairCard(r, t)).join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("repair-form");
    if (!form) return;
    loadMyRepairs();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = document.querySelector("[data-form-error]");
      const successBox = document.getElementById("repair-success");
      errBox.classList.add("hidden");
      successBox.classList.add("hidden");

      const res = await BazaarAPI.post("/api/repairs", {
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        device_type: form.device_type.value,
        issue: form.issue.value.trim(),
      });

      if (res.ok) {
        form.reset();
        successBox.classList.remove("hidden");
        loadMyRepairs();
      } else {
        errBox.textContent = window.BazaarI18n.t("repair_page.error");
        errBox.classList.remove("hidden");
      }
    });
  });
})();
