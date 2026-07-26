/**
 * scroll-reveal.js — small, dependency-free scroll polish shared by every
 * page: a top progress bar, header elevation once you scroll past it, and
 * a fade-up reveal for anything marked data-reveal. Also auto-staggers
 * cards inside #product-grid whenever products.js re-renders it.
 *
 * Respects prefers-reduced-motion (see assets/css/effects.css) — this file
 * only toggles classes/vars, the actual motion lives in CSS.
 */
(function () {
  // ---------- progress bar ----------
  const bar = document.createElement("div");
  bar.id = "scroll-progress";
  document.addEventListener("DOMContentLoaded", () => document.body.prepend(bar));

  const header = document.querySelector("header");

  function onScroll() {
    const doc = document.documentElement;
    const scrollTop = doc.scrollTop || document.body.scrollTop;
    const height = doc.scrollHeight - doc.clientHeight;
    const pct = height > 0 ? (scrollTop / height) * 100 : 0;
    bar.style.width = pct + "%";

    if (header) {
      header.classList.toggle("is-elevated", scrollTop > 8);
    }
  }
  document.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("DOMContentLoaded", onScroll);

  // ---------- reveal on scroll ----------
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  function observeReveals(root = document) {
    root.querySelectorAll("[data-reveal]:not(.is-visible)").forEach((el) => io.observe(el));
  }

  document.addEventListener("DOMContentLoaded", () => observeReveals());

  // ---------- staggered card-in for dynamically rendered grids ----------
  function tagCards(container) {
    Array.from(container.children).forEach((child, i) => {
      child.style.setProperty("--card-i", i % 12);
      child.classList.add("card-in");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("product-grid");
    if (!grid) return;
    tagCards(grid);
    const mo = new MutationObserver(() => tagCards(grid));
    mo.observe(grid, { childList: true });
  });

  // ---------- lightweight parallax for [data-parallax] ----------
  // data-parallax="0.2" -> moves at 20% of scroll speed while its section
  // is in view. Skipped entirely when the user prefers reduced motion.
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let parallaxEls = [];

  function updateParallax() {
    const vh = window.innerHeight;
    parallaxEls.forEach((el) => {
      const rect = el.container.getBoundingClientRect();
      const progress = (vh - rect.top) / (vh + rect.height); // 0 at enter, 1 at exit
      const offset = (progress - 0.5) * 2 * el.speed * 60; // px
      el.target.style.transform = `translateY(${offset.toFixed(1)}px)`;
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (prefersReducedMotion) return;
    parallaxEls = Array.from(document.querySelectorAll("[data-parallax]")).map((target) => ({
      target,
      container: target.closest("[data-parallax-scope]") || target.parentElement,
      speed: parseFloat(target.getAttribute("data-parallax")) || 0.15,
    }));
    if (parallaxEls.length) {
      updateParallax();
      document.addEventListener("scroll", updateParallax, { passive: true });
    }
  });
})();
