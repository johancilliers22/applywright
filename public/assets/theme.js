/* ==========================================================================
   Applywright — theme resolution
   Loaded as a classic, render-blocking <script src="/assets/theme.js"> in the
   <head> of the five marketing pages, AFTER the stylesheets.

   Why blocking and after the CSS:
     - It sets data-theme on <html> synchronously, before the first paint, so
       there is no flash of the wrong scheme. `defer` and `type="module"` both
       run after parsing, which is after first paint — too late.
     - A classic script that follows <link rel="stylesheet"> waits for those
       sheets, so getComputedStyle() can read the palette it just chose from.
       Inline boot code would be shorter but is blocked by the CSP
       (script-src 'self') and by scripts/check.js.

   Resolution order: saved choice -> prefers-color-scheme -> light.
   The toggle is injected into .nav__actions at runtime because nav.html has
   another owner. Everything here is progressive: without this file the pages
   render in the light scheme exactly as they do today.

   Public API (for the SPA owner, if they choose to adopt the same key):
     window.applywrightTheme.mode()          -> 'light' | 'dark' | 'system'
     window.applywrightTheme.theme()         -> 'light' | 'dark' (resolved)
     window.applywrightTheme.set('dark')     -> persists and repaints
   ========================================================================== */

(() => {
  "use strict";

  const KEY = "applywright-theme"; // 'light' | 'dark' | absent (follow system)
  const MODES = ["light", "dark", "system"];
  const root = document.documentElement;
  const system = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  let mode = readMode();

  // --- storage ------------------------------------------------------------
  // Private mode, blocked storage and a hostile extension all throw here. Fail
  // closed to "system": a preference that cannot be saved must not look saved.
  function readMode() {
    try {
      const value = window.localStorage.getItem(KEY);
      return value === "light" || value === "dark" ? value : "system";
    } catch {
      return "system";
    }
  }

  function writeMode(next) {
    try {
      if (next === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      /* not persisted; the page still switches for this visit */
    }
  }

  // --- paint --------------------------------------------------------------
  function resolve(next = mode) {
    if (next === "system") return system && system.matches ? "dark" : "light";
    return next;
  }

  function paint() {
    const theme = resolve();
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-theme-mode", mode);
    syncMeta(theme);
    syncControl(theme);
    return theme;
  }

  // The value of <meta name="theme-color"> is a token (--theme-color-meta) so
  // the browser chrome cannot drift from the palette. The fallback is the same
  // value by hand, for the case where the stylesheet failed to load.
  function syncMeta(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    let value = "";
    try {
      value = getComputedStyle(root).getPropertyValue("--theme-color-meta").trim();
    } catch {
      value = "";
    }
    meta.setAttribute("content", value || (theme === "dark" ? "#191c22" : "#fffdf8"));
  }

  // --- the control --------------------------------------------------------
  const ICONS = {
    light:
      '<svg data-icon="light" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="3.6"/><path d="M10 2.3v1.7M10 16v1.7M2.3 10h1.7M16 10h1.7M4.6 4.6l1.2 1.2M14.2 14.2l1.2 1.2M15.4 4.6l-1.2 1.2M5.8 14.2l-1.2 1.2"/></svg>',
    dark:
      '<svg data-icon="dark" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M15.7 12.3A6.2 6.2 0 0 1 7.7 4.3a6.3 6.3 0 1 0 8 8Z"/></svg>',
    system:
      '<svg data-icon="system" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="6.4"/><path d="M10 3.6a6.4 6.4 0 0 1 0 12.8Z" fill="currentColor" stroke="none"/></svg>',
  };

  let button = null;
  let live = null;

  // Cycle: system -> the opposite of what you are looking at -> the other
  // explicit mode -> back to system. A fixed three-step rotation would make the
  // first click out of "system" a no-op whenever the OS already matched it
  // (system + light OS -> "light" looks like nothing happened). This order
  // always changes what you see, and still lets you return to "system".
  function nextMode() {
    if (mode === "system") return resolve() === "dark" ? "light" : "dark";
    if (mode === "dark") return "light";
    return "system";
  }

  function label(theme) {
    const current = mode === "system" ? `system, currently ${theme}` : mode;
    return `Colour theme: ${current}. Switch to ${nextMode()}.`;
  }

  function syncControl(theme = resolve()) {
    if (!button) return;
    button.dataset.mode = mode;
    button.setAttribute("aria-label", label(theme));
    button.setAttribute("title", mode === "system" ? `Colour theme: system (${theme})` : `Colour theme: ${mode}`);
  }

  function announce(theme) {
    if (!live) return;
    live.textContent =
      mode === "system" ? `Colour theme: system, now ${theme}` : `Colour theme: ${mode}`;
  }

  function build() {
    if (button) return;
    const actions = document.querySelector(".nav__actions");
    if (!actions) return;

    button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.dataset.themeToggle = "";
    button.dataset.mode = mode;
    button.innerHTML = ICONS.light + ICONS.dark + ICONS.system;

    // The polite status node is the part a screen reader actually hears: the
    // accessible name changes silently when it is not focused.
    live = document.createElement("span");
    live.className = "sr-only";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");

    // Sit with the other nav controls, before the menu button, so the tab order
    // reads: sign in, get started, theme, menu.
    const menu = actions.querySelector("[data-nav-toggle]");
    if (menu) actions.insertBefore(button, menu);
    else actions.append(button);
    actions.append(live);

    // The reserved footprint and the real control swap in the same task.
    root.removeAttribute("data-theme-pending");
    syncControl();

    button.addEventListener("click", () => {
      mode = nextMode();
      writeMode(mode);
      const theme = paint();
      announce(theme);
    });
  }

  // Paint before the observer is installed. Everything above is synchronous, so
  // this still runs before the first frame; it has to come after the control's
  // state (`button`) is declared, or `paint()` would read a binding that is
  // still in its temporal dead zone and abort the rest of this file.
  paint();

  // Reserve the control's footprint from the first frame. See theme.css: the
  // attribute is removed in the same task that inserts the button, so the nav's
  // other controls cannot move either way.
  root.setAttribute("data-theme-pending", "");

  // Inject as soon as .nav__actions exists in the parse stream. Waiting for
  // DOMContentLoaded would move the nav's other controls sideways after paint
  // (a preventable layout shift); the observer lands the button during parsing,
  // which is before the first frame.
  if (document.readyState === "loading" && "MutationObserver" in window) {
    const observer = new MutationObserver(() => {
      if (!document.querySelector(".nav__actions")) return;
      observer.disconnect();
      build();
    });
    observer.observe(root, { childList: true, subtree: true });
  } else {
    build();
  }

  // Fail-safe: if this page has no .nav__actions at all, do not leave a
  // reserved gap behind.
  if (!button) {
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        if (!button) root.removeAttribute("data-theme-pending");
      },
      { once: true }
    );
  }

  // --- reaction to the system --------------------------------------------
  function onSystemChange() {
    if (mode !== "system") return; // an explicit choice outranks the OS
    const theme = paint();
    announce(theme);
  }

  if (system) {
    if (system.addEventListener) system.addEventListener("change", onSystemChange);
    else if (system.addListener) system.addListener(onSystemChange); // Safari < 14
  }

  // Two tabs, one choice: keep them in step without a reload.
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY && event.key !== null) return;
    mode = readMode();
    paint();
  });

  window.applywrightTheme = {
    mode: () => mode,
    theme: () => resolve(),
    set(next) {
      mode = MODES.includes(next) ? next : "system";
      writeMode(mode);
      return paint();
    },
  };
})();
