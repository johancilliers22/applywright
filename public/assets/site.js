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
  // Retired. The scroll-triggered reveal, its observer and the `reveal-on` /
  // `is-visible` classes were deleted with the rest of the old motion (the
  // design pass measured them as delaying the reading they decorated, and the
  // hidden state needed a focus-within rescue to keep WCAG 2.4.7 honest). What
  // is left is CSS-only: one page entrance, the hero's evidence trace and the
  // drawer disclosure in motion.css.

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
