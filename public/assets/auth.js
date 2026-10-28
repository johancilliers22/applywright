/* Sign-in, sign-up and account-recovery behaviour. No dependencies, no inline handlers. */
(() => {
  "use strict";

  const statusIn = (container) => container.querySelector("[data-auth-status]");

  const say = (container, message, tone = "error") => {
    const node = statusIn(container);
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
  };

  /** API error codes are stable; the wording a person reads is chosen here. */
  const explain = (response, payload) => {
    const code = payload?.error?.code;
    if (code === "invalid_credentials") return "That email and password do not match an account.";
    if (code === "email_taken") return "An account already exists for that email — sign in instead.";
    if (code === "registration_closed") return "Sign-up is closed on this server. Ask the operator for an account.";
    if (code === "invalid_recovery_code") {
      return "That email and recovery code do not match an unused code. Check the codes you saved at sign-up.";
    }
    if (response.status === 429) return "Too many attempts. Wait a minute and try again.";
    // invalid_reset_token already says whether the link expired or was used.
    return payload?.error?.message || `Request failed (${response.status})`;
  };

  const request = async (path, body) => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(explain(response, payload));
    return payload;
  };

  const goNext = () => {
    const next = new URLSearchParams(location.search).get("next");
    location.assign(next && next.startsWith("/") ? next : "/app");
  };

  const wirePasswordToggle = (form) => {
    const toggle = form.querySelector("[data-toggle-password]");
    const password = form.querySelector("input[name=password]");
    if (!toggle || !password) return;
    toggle.addEventListener("click", () => {
      const showing = password.type === "text";
      password.type = showing ? "password" : "text";
      toggle.textContent = showing ? "show" : "hide";
      toggle.setAttribute("aria-pressed", String(!showing));
    });
  };

  // ------------------------------------------------ recovery codes (sign-up)
  // The codes exist in readable form exactly once. They are shown here, with a
  // copy and a download, and the page does not move on until the person says so.

  const recoveryPanel = document.querySelector("[data-recovery-panel]");
  const recoveryList = document.querySelector("[data-recovery-list]");

  const codesToText = (codes, email) =>
    [
      `Applywright recovery codes${email ? ` for ${email}` : ""}`,
      "",
      "Each code can be used once, to set a new password on this account.",
      "Keep this file somewhere other than this browser: it is the only way back in without email.",
      "This build sends no email. If these are lost along with the password, the operator has to issue a reset link.",
      "",
      ...codes,
      "",
    ].join("\r\n");

  const downloadCodes = (codes, email) => {
    const blob = new Blob([codesToText(codes, email)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "applywright-recovery-codes.txt";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyCodes = async (codes, email) => {
    try {
      await navigator.clipboard.writeText(codesToText(codes, email));
      return true;
    } catch {
      return false;
    }
  };

  const showRecoveryCodes = (payload) => {
    const codes = Array.isArray(payload?.recoveryCodes) ? payload.recoveryCodes : [];
    if (!recoveryPanel || !recoveryList || !codes.length) {
      goNext();
      return;
    }

    const email = payload?.user?.email ?? "";
    const shell = document.querySelector("[data-register-shell]");
    if (shell) shell.hidden = true;

    const title = document.querySelector("[data-auth-title]");
    if (title) title.textContent = "Save your recovery codes";
    const sub = document.querySelector("[data-auth-sub]");
    if (sub) sub.textContent = "Copy these, or download them. They are the only way back in without email.";

    recoveryList.replaceChildren();
    for (const code of codes) {
      const item = document.createElement("li");
      item.textContent = code;
      recoveryList.append(item);
    }
    recoveryPanel.hidden = false;

    const copyButton = recoveryPanel.querySelector("[data-recovery-copy]");
    if (copyButton) {
      copyButton.addEventListener("click", async () => {
        if (await copyCodes(codes, email)) say(recoveryPanel, "Codes copied.", "ok");
        else say(recoveryPanel, "Could not copy automatically — select the codes above and copy them.");
      });
    }

    const downloadButton = recoveryPanel.querySelector("[data-recovery-download]");
    if (downloadButton) {
      downloadButton.addEventListener("click", () => {
        downloadCodes(codes, email);
        say(recoveryPanel, "Saved as applywright-recovery-codes.txt.", "ok");
      });
    }

    const next = recoveryPanel.querySelector("[data-recovery-continue]");
    if (next) {
      const query = new URLSearchParams(location.search).get("next");
      next.href = query && query.startsWith("/") ? query : "/app";
    }
  };

  // ------------------------------------------------------- reset page (?token)

  const resetToken = new URLSearchParams(location.search).get("token");
  if (resetToken) {
    const tokenPanel = document.querySelector('[data-reset-panel="token"]');
    const requestPanel = document.querySelector('[data-reset-panel="request"]');
    if (tokenPanel) tokenPanel.hidden = false;
    if (requestPanel) requestPanel.hidden = true;
    const sub = document.querySelector("[data-reset-sub]");
    if (sub) sub.textContent = "Choose a new password. This link works once and expires an hour after it was issued.";
  }

  // --------------------------------------------------------------- the forms

  const forms = document.querySelectorAll("[data-auth-form]");
  for (const form of forms) {
    const mode = form.dataset.authForm;
    wirePasswordToggle(form);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const confirms = mode === "register" || mode === "reset" || mode === "recover";
      if (confirms && data.password !== data.confirm) {
        say(form, "Those passwords do not match.");
        return;
      }

      const submit = form.querySelector("button[type=submit]");
      if (submit) submit.disabled = true;
      say(form, "Working…", "ok");
      try {
        if (mode === "login") {
          await request("/api/auth/login", { email: data.email, password: data.password });
          goNext();
        } else if (mode === "register") {
          const payload = await request("/api/auth/register", {
            email: data.email,
            password: data.password,
            name: data.name || undefined,
          });
          showRecoveryCodes(payload);
        } else if (mode === "recover") {
          await request("/api/auth/recover", { email: data.email, code: data.code, password: data.password });
          form.reset();
          say(form, "Password changed and every other session signed out. Sign in with the new password.", "ok");
        } else if (mode === "forgot") {
          await request("/api/auth/forgot", { email: data.email });
          say(
            form,
            "If that address has an account, a reset link has been issued to the operator. In this build it is not emailed: the operator passes it on by hand.",
            "ok"
          );
        } else if (mode === "forgot-username") {
          await request("/api/auth/forgot-username", { email: data.email });
          say(form, "If that address has an account, the operator has been notified.", "ok");
        } else if (mode === "reset") {
          await request("/api/auth/reset", { token: resetToken, password: data.password });
          form.reset();
          say(form, "Password set and every other session signed out. Sign in with the new password.", "ok");
        }
      } catch (error) {
        say(form, error.message);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }
})();
