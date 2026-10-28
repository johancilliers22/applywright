/* Meridian — shared site behaviour. Progressive enhancement only. */
(() => {
  "use strict";

  const doc = document;
  const root = doc.documentElement;

  root.classList.remove("no-js");

  // --- mobile nav ---------------------------------------------------------
  // The drawer is a disclosure, not a modal: focus stays on the button, Tab
  // walks into the open list, Escape closes and returns focus there. aria
  // state is written in the same place as the class so the two cannot drift.
  const toggle = doc.querySelector("[data-nav-toggle]");
  const drawer = doc.querySelector("[data-nav-mobile]");
  if (toggle && drawer) {
    const desktop = window.matchMedia("(min-width: 940px)");
    const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
    const setOpen = (open, restoreFocus = false) => {
      drawer.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Menu");
      if (!open && restoreFocus) toggle.focus();
    };

    toggle.addEventListener("click", () => setOpen(!isOpen()));
    drawer.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });
    doc.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !isOpen()) return;
      event.preventDefault();
      setOpen(false, true);
    });
    // Above the breakpoint the toggle is display:none; a resize while open must
    // not leave a stale aria-expanded="true" behind.
    desktop.addEventListener("change", (event) => {
      if (event.matches && isOpen()) setOpen(false);
    });
  }

  // --- skip link ----------------------------------------------------------
  // The link itself is the first thing in partials/nav.html. Browsers move the
  // sequential-focus start point to a fragment target on their own; tabindex
  // makes that reliable across engines and lets the jump land the focus, not
  // just the scroll. #main paints no ring (see site.css).
  const skip = doc.querySelector("a.skip");
  const main = doc.querySelector("main#main");
  if (skip && main) {
    main.setAttribute("tabindex", "-1");
    skip.addEventListener("click", () => main.focus({ preventScroll: true }));
  }

  // --- scroll reveal ------------------------------------------------------
  // Nothing is hidden without JS. `reveal-on` is set only after the targets are
  // chosen, and only for blocks that start below the fold, so the first paint
  // never flashes. The hidden/settled styles are in tokens.css; the stagger and
  // the reduced-motion escape hatch are in motion.css.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) {
    root.classList.remove("reveal-on");
  } else {
    const blocks = [
      ".section-head > *",
      ".grid > *",
      ".price-grid > *",
      ".stats > *",
      ".steps > *",
      ".bento > *",
      ".split > *",
      ".table-wrap",
      ".faq",
      ".cta-band__inner > *",
      ".card",
    ];
    const viewport = window.innerHeight || 0;
    const marked = [];

    for (const selector of blocks) {
      for (const el of doc.querySelectorAll(selector)) {
        // Skip an element already covered by a parent block, and skip the
        // bands that have their own entrance animation.
        if (el.closest(".reveal")) continue;
        if (el.closest(".hero, .page-head, .nav, .footer")) continue;
        if (el.getBoundingClientRect().top < viewport * 0.92) continue;

        let index = 0;
        for (let prev = el.previousElementSibling; prev; prev = prev.previousElementSibling) {
          if (prev.classList.contains("reveal")) index += 1;
        }

        // Suppress the transition while the hidden state is committed: these
        // blocks have already painted visible, so without this they would fade
        // *out* for a full reveal duration before they could ever fade in.
        el.style.transition = "none";
        el.classList.add("reveal");
        // The step, not a duration: motion.css multiplies it by --stagger, so
        // the stagger stays a token rather than a number copied into JS.
        el.style.setProperty("--reveal-step", String(Math.min(index, 5)));
        marked.push(el);
      }
    }

    if (marked.length) {
      root.classList.add("reveal-on");

      // Two frames later the hidden state is settled off screen; hand the
      // transitions back to the stylesheets.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          for (const el of marked) el.style.removeProperty("transition");
        });
      });

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        },
        { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
      );
      for (const el of marked) observer.observe(el);

      // Fonts and images settle after the observer installs; anything that ends
      // up on screen stays visible even if the observer never spoke.
      window.addEventListener(
        "load",
        () => {
          for (const el of marked) {
            if (el.classList.contains("is-visible")) continue;
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) el.classList.add("is-visible");
          }
        },
        { once: true }
      );
    } else {
      root.classList.remove("reveal-on");
    }
  }

  // --- live status in the footer -----------------------------------------
  const label = doc.querySelector("[data-status-label]");
  if (label) {
    fetch("/api/health", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((h) => {
        label.textContent =
          h.provider === "live" ? "Assistant online · live model" : "Assistant online · demo model";
      })
      .catch(() => {
        label.textContent = "Status unavailable";
      });
  }

  // --- contact form -------------------------------------------------------
  const form = doc.querySelector("[data-contact-form]");
  if (form) {
    const out = form.querySelector("[data-form-status]");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      if (btn) btn.disabled = true;
      if (out) out.textContent = "Sending…";
      try {
        const body = Object.fromEntries(new FormData(form).entries());
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // The API answers { error: { code, message } }; never stringify the object.
          const detail = data?.error?.message || data?.error?.code;
          throw new Error(detail || `HTTP ${res.status}`);
        }
        form.reset();
        if (out) out.textContent = "Received — we'll come back to you within one business day.";
      } catch (err) {
        const message = err?.message && err.message !== "[object Object]" ? err.message : "please try again in a moment";
        if (out) out.textContent = `Could not send: ${message}`;
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }
})();
