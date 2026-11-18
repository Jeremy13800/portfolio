/* Maquette Cosmic — JavaScript minimal, sans dépendance. */
(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 1. Menu mobile --------------------------------------------------------- */
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
    };
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia("(min-width: 64em)").addEventListener("change", (e) => { if (e.matches) setOpen(false); });
  }

  /* 2. Header : fond au scroll (sentinelle, aucun écouteur de scroll) ----- */
  const header = document.querySelector(".site-header");
  if (header && "IntersectionObserver" in window) {
    const sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.className = "sentinel";
    document.body.prepend(sentinel);
    new IntersectionObserver(([entry]) => {
      header.classList.toggle("is-scrolled", !entry.isIntersecting);
    }, { rootMargin: "-48px 0px 0px 0px" }).observe(sentinel);
  }

  /* 3. Apparition au scroll (une seule fois) -------------------------------- */
  const items = document.querySelectorAll(".reveal");
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  } else {
    items.forEach((el) => el.classList.add("is-in"));
  }

  /* 4. Rail de secteurs : secteur courant ---------------------------------- */
  const rail = document.querySelectorAll(".rail span");
  const sectors = document.querySelectorAll("[data-sector]");
  if (rail.length && sectors.length && "IntersectionObserver" in window) {
    const so = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.dataset.sector;
        rail.forEach((s) => s.classList.toggle("is-current", s.dataset.s === id));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sectors.forEach((s) => so.observe(s));
  }

  /* 5. Orbites SVG : pause si mouvement réduit ----------------------------- */
  if (reduce) {
    document.querySelectorAll("svg").forEach((svg) => {
      if (typeof svg.pauseAnimations === "function") svg.pauseAnimations();
    });
  }

  /* 6. Formulaire : démonstration, n'envoie rien ---------------------------- */
  const form = document.getElementById("demo-form");
  const status = document.getElementById("form-status");
  if (form && status) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const missing = [...form.querySelectorAll("[required]")].filter((f) => !f.value.trim());
      if (missing.length) {
        status.textContent = "Merci de renseigner : " +
          missing.map((f) => form.querySelector(`label[for="${f.id}"]`).firstChild.textContent.trim().toLowerCase()).join(", ") + ".";
        missing[0].focus();
        return;
      }
      status.textContent = "Démonstration : votre message n'a pas été envoyé, aucune donnée ne quitte cette page.";
    });
  }
})();
