/* Sign-in / sign-up behaviour. No dependencies, no inline handlers. */
(() => {
  "use strict";

  const form = document.querySelector("[data-auth-form]");
  if (!form) return;

  const mode = form.dataset.authForm; // "login" | "register"
  const status = form.querySelector("[data-auth-status]");
  const submit = form.querySelector("button[type=submit]");

  const say = (message, tone = "error") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };

  // Show/hide password
  const toggle = form.querySelector("[data-toggle-password]");
  const password = form.querySelector("input[name=password]");
  if (toggle && password) {
    toggle.addEventListener("click", () => {
      const showing = password.type === "text";
      password.type = showing ? "password" : "text";
      toggle.textContent = showing ? "show" : "hide";
      toggle.setAttribute("aria-pressed", String(!showing));
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (mode === "register" && data.password !== data.confirm) {
      say("Those passwords do not match.");
      return;
    }
    submit.disabled = true;
    say("Working…", "ok");
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = mode === "register"
        ? { email: data.email, password: data.password, name: data.name || undefined }
        : { email: data.email, password: data.password };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = payload?.error?.code;
        if (code === "invalid_credentials") throw new Error("That email and password do not match an account.");
        if (code === "email_taken") throw new Error("An account already exists for that email — sign in instead.");
        if (response.status === 429) throw new Error("Too many attempts. Wait a minute and try again.");
        throw new Error(payload?.error?.message || `Request failed (${response.status})`);
      }
      const next = new URLSearchParams(location.search).get("next");
      location.assign(next && next.startsWith("/") ? next : "/app");
    } catch (error) {
      say(error.message);
      submit.disabled = false;
    }
  });
})();
