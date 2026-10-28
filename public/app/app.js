/**
 * Applywright — the /app workspace.
 *
 * One vanilla ES module, no dependencies, no build step, no inline handlers. It
 * is a client-side routed shell over the JSON API in SPEC section 6: the server
 * sends app.html for /app and every /app/* path, this file decides which screen
 * that path means.
 *
 * House rules this file keeps:
 *   - nothing untrusted is ever parsed as HTML: every node is built with
 *     createElement/createElementNS and user text goes in through textContent;
 *   - every screen has a loading, an empty and an error state;
 *   - 401 redirects to /sign-in?next=…, 402 renders an inline upgrade prompt that
 *     names the plan, 429 renders a countdown, 5xx renders a retry button;
 *   - every number on screen (score, quota, price) comes from the API response
 *     that the server derived it from — nothing here is a decorative figure.
 */

/* ------------------------------------------------------------------------- *
 * 1. DOM builders
 * ------------------------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";

function setProps(node, props) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") Object.assign(node.style, value);
    else if (key === "value") node.value = value;
    else if (key === "checked") node.checked = Boolean(value);
    else if (key === "disabled") node.disabled = Boolean(value);
    else if (key === "html" || key === "innerHTML") {
      throw new Error("raw HTML is never allowed here");
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
}

function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

function el(tag, props, ...children) {
  const node = document.createElement(tag);
  setProps(node, props);
  appendChildren(node, children);
  return node;
}

function svgEl(tag, props, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "text") {
      node.textContent = String(value);
      continue;
    }
    node.setAttribute(key, String(value));
  }
  appendChildren(node, children);
  return node;
}

const byId = (id) => document.getElementById(id);

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

let idCounter = 0;
function uniqueId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/* ------------------------------------------------------------------------- *
 * 2. Formatting
 * ------------------------------------------------------------------------- */

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
const DAY_MS = 86_400_000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return DATE_FORMAT.format(date);
}

/** "today", "3 days ago", or the plain date once it is over a month old. */
function formatWhen(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const days = Math.round((date.getTime() - Date.now()) / DAY_MS);
  if (Math.abs(days) <= 1) return RELATIVE.format(days, "day");
  if (Math.abs(days) < 30) return RELATIVE.format(days, "day");
  return DATE_FORMAT.format(date);
}

/** Pence to "£19" / "£19.50" / "£1,000". null in, null out. */
function money(pence) {
  if (typeof pence !== "number" || !Number.isFinite(pence) || pence < 0) return null;
  const total = Math.round(pence);
  const whole = String(Math.trunc(total / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = total % 100;
  return rest === 0 ? `£${whole}` : `£${whole}.${String(rest).padStart(2, "0")}`;
}

const CURRENCY_SIGNS = { GBP: "£", USD: "$", EUR: "€" };

/** A salary line only when the posting states one; never an estimate. */
function salaryLabel(job) {
  const min = numberOrNull(job.salaryMin ?? job.salary_min);
  const max = numberOrNull(job.salaryMax ?? job.salary_max);
  if (min === null && max === null) return null;
  const currency = (job.currency ?? "").toUpperCase();
  const sign = CURRENCY_SIGNS[currency] ?? (currency ? `${currency} ` : "");
  const group = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (min !== null && max !== null && min !== max) return `${sign}${group(min)} – ${sign}${group(max)}`;
  return `${sign}${group(min ?? max)}`;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function plural(count, one, many = `${one}s`) {
  return count === 1 ? one : many;
}

const SOURCE_LABELS = {
  arbeitnow: "Arbeitnow",
  remotive: "Remotive",
  remoteok: "Remote OK",
  greenhouse: "Greenhouse",
  lever: "Lever",
  workable: "Workable",
  ashby: "Ashby",
  workday: "Workday",
  jsonld: "Page data",
  generic: "Direct posting",
  capture: "Captured posting",
};

function sourceLabel(source) {
  const key = String(source ?? "").trim();
  if (!key) return "Unknown source";
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

const STATUS_LABELS = {
  pack_ready: "Pack ready",
  approved: "Approved",
  submitted: "Submitted",
  interview: "Interview",
  rejected: "Rejected",
  offer: "Offer",
  withdrawn: "Withdrawn",
};

const DEFAULT_STATUSES = ["pack_ready", "approved", "submitted", "interview", "rejected", "offer", "withdrawn"];

function statusLabel(status) {
  return STATUS_LABELS[status] ?? String(status ?? "Unknown").replace(/_/g, " ");
}

const FLAG_LABELS = {
  fullAtsReport: "Full ATS report",
  coverLetter: "Covering letters",
  packHistory: "Pack history",
  dailyDigest: "Daily digest",
  apiAccess: "API access",
  priorityRefresh: "Priority refresh",
  bulkExport: "Export everything",
};

const SUBSCOPE_LABELS = [
  ["keywords", "Job keywords"],
  ["structure", "Structure"],
  ["achievements", "Quantified achievements"],
  ["readability", "Readability"],
  ["formatting", "Formatting risk"],
];

/* ------------------------------------------------------------------------- *
 * 3. API client
 * ------------------------------------------------------------------------- */

class ApiError extends Error {
  constructor({ status, code, message, retryAfter = null, upgrade = null }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.upgrade = upgrade;
  }
}

function abortError() {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

function redirectToSignIn() {
  const next = `${location.pathname}${location.search}`;
  const target = next.startsWith("/app") ? next : "/app";
  location.assign(`/sign-in?next=${encodeURIComponent(target)}`);
}

function parseRetryAfter(message) {
  const match = /retry in (\d+)\s*s/i.exec(String(message ?? ""));
  return match ? Number(match[1]) : null;
}

async function api(path, { method = "GET", body, signal, headers } = {}) {
  const init = {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(headers ?? {}) },
    signal,
  };
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError({
      status: 0,
      code: "network_error",
      message: "The server did not answer. Check your connection, then try again.",
    });
  }

  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const code = payload?.error?.code ?? `http_${response.status}`;
    const message =
      payload?.error?.message ??
      (response.status >= 500
        ? "The server had a problem handling that request."
        : `That request was refused (${response.status}).`);
    if (response.status === 401 && code === "unauthorized") redirectToSignIn();
    // A refused quota means the plan and credit line in the rail are stale.
    if (response.status === 402) refreshSession();
    throw new ApiError({
      status: response.status,
      code,
      message,
      retryAfter:
        Number(response.headers.get("retry-after")) || parseRetryAfter(message) || (response.status === 429 ? 60 : null),
      // The body is authoritative (SPEC section 6); the header is the fallback
      // for an older server that only set it there.
      upgrade: payload?.error?.upgrade ?? response.headers.get("upgrade") ?? null,
    });
  }

  return payload;
}

/* ------------------------------------------------------------------------- *
 * 4. Bookmarklet handoff
 *
 * The LinkedIn capture bookmarklet cannot write to this origin's storage from
 * linkedin.com (storage and cookies are per-origin) and a cross-origin POST is
 * refused by SameSite=Lax + the server's origin check. So the only handoff that
 * can work is: it copies to the clipboard, or — when it runs on our own origin —
 * leaves a capture record in localStorage and navigates here with ?import=1 or
 * ?capture=1. We consume that record once and clear it.
 * ------------------------------------------------------------------------- */

const CAPTURE_KEY = "applywright.capture.v1";

function takeCapture(kind) {
  try {
    const raw = localStorage.getItem(CAPTURE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || record.version !== 1 || record.kind !== kind) return null;
    if (typeof record.text !== "string" || !record.text.trim()) return null;
    localStorage.removeItem(CAPTURE_KEY);
    return record;
  } catch {
    // Storage can be blocked (private mode, policy); a failed handoff is not a
    // page failure — the paste box still works by hand.
    return null;
  }
}

/* ------------------------------------------------------------------------- *
 * 4b. Session state
 * ------------------------------------------------------------------------- */

const state = {
  me: null,
  mePending: null,
  planNames: { free: "Free", pro: "Pro", scale: "Scale" },
  plansLoaded: false,
};

/** Is this error one we can show inline rather than as a dead end? */
function isAbort(error) {
  return error?.name === "AbortError";
}

async function loadMe(signal, { force = false } = {}) {
  if (state.me && !force) return state.me;

  // One in-flight read is shared by the shell and the screen, and it is not
  // bound to any screen's abort signal so a navigation cannot cancel it.
  if (!force) {
    if (!state.mePending) {
      state.mePending = api("/api/auth/me")
        .then((data) => {
          state.me = data;
          if (data?.entitlements?.name && data?.plan) state.planNames[data.plan] = data.entitlements.name;
          updateRail();
          return data;
        })
        .finally(() => {
          state.mePending = null;
        });
    }
    return state.mePending;
  }

  const data = await api("/api/auth/me", { signal });
  state.me = data;
  if (data?.entitlements?.name && data?.plan) state.planNames[data.plan] = data.entitlements.name;
  updateRail();
  return data;
}

/** Plan names/prices for the upgrade prompts; harmless if it never loads. */
async function warmPlanNames() {
  if (state.plansLoaded) return;
  try {
    const data = await api("/api/billing/plans");
    for (const plan of data?.plans ?? []) {
      if (plan?.key && plan?.name) state.planNames[plan.key] = plan.name;
    }
    state.plansLoaded = true;
  } catch {
    /* the fallback names are already in state.planNames */
  }
}

function planName(key) {
  if (!key) return null;
  return state.planNames[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Re-read the session after a quota refusal so the rail's plan and credit line
 * (and every "credits left" label the next screen builds) are current. Never
 * waits, never throws, and collapses concurrent refusals into one request.
 */
let sessionRefreshInFlight = false;
function refreshSession() {
  if (sessionRefreshInFlight) return;
  sessionRefreshInFlight = true;
  loadMe(null, { force: true })
    .catch(() => {
      /* a failed refresh leaves the last known plan on screen */
    })
    .finally(() => {
      sessionRefreshInFlight = false;
    });
}

function quotaInfo(feature) {
  const me = state.me;
  if (!me) return { used: 0, limit: null, unlimited: true, remaining: null };
  const entitlements = me.entitlements ?? {};
  const quotas = entitlements.quotas ?? {};
  const rawLimit = quotas[feature] !== undefined ? quotas[feature] : entitlements[feature];
  const limit = rawLimit === undefined ? null : rawLimit;
  const usedMap = {
    cvs: me.usage?.cvs ?? 0,
    packs: me.usage?.packsThisMonth ?? 0,
    alerts: me.usage?.alerts ?? 0,
    jobResultsPerDay: 0,
  };
  const used = usedMap[feature] ?? 0;
  const unlimited = limit === null;
  return { used, limit, unlimited, remaining: unlimited ? null : Math.max(0, limit - used) };
}

/** Which plan would cover the refused action: header first, then one step up. */
function upgradeTarget(error) {
  const explicit = String(error?.upgrade ?? "").trim();
  if (state.planNames[explicit]) return explicit;
  const order = ["free", "pro", "scale"];
  const current = state.me?.plan ?? "free";
  return order[order.indexOf(current) + 1] ?? null;
}

/* ------------------------------------------------------------------------- *
 * 5. Chrome: toast, banner, rail
 * ------------------------------------------------------------------------- */

let toastTimer = null;

function toast(message, tone = "ok") {
  const node = byId("app-toast");
  if (!node) return;
  node.textContent = String(message);
  node.dataset.tone = tone;
  node.dataset.show = "true";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.dataset.show = "false";
  }, tone === "err" ? 7000 : 5000);
}

/** An aborted request is not a failure the reader caused, so it says nothing. */
function toastError(error) {
  if (isAbort(error)) return;
  toast(error?.message ?? "That did not work.", "err");
}

function setBanner(content) {
  const node = byId("app-banner");
  if (!node) return;
  node.replaceChildren();
  if (!content) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  node.append(content);
}

/** Packs are what a tailoring run costs, so the interface calls them credits. */
function creditsInfo() {
  const packs = quotaInfo("packs");
  const remaining = packs.remaining;
  return {
    unlimited: packs.unlimited,
    used: packs.used,
    limit: packs.limit,
    remaining,
    exhausted: !packs.unlimited && remaining !== null && remaining <= 0,
    label: packs.unlimited ? "Unlimited credits" : `${remaining ?? 0} ${plural(remaining ?? 0, "credit")} left`,
  };
}

/**
 * A tailoring button says what it does; the credit count is stated once, in a
 * single line above the results, so it is not repeated on every card. A
 * disabled button still says why it is disabled.
 */
function tailorLabel(verb = "Tailor and queue") {
  return creditsInfo().exhausted ? "No credits left" : verb;
}

function updateRail() {
  const label = byId("app-plan");
  if (!label) return;
  const me = state.me;
  if (!me) {
    label.textContent = "Loading your plan…";
    return;
  }
  const name = me.entitlements?.name ?? planName(me.plan) ?? "Free";
  const credits = creditsInfo();
  label.textContent = `${name} plan · ${credits.unlimited ? "unlimited credits" : credits.label.toLowerCase()}`;
}

/* ------------------------------------------------------------------------- *
 * 6. Shared components
 * ------------------------------------------------------------------------- */

const disposers = [];
let renderController = null;

function onDispose(fn) {
  disposers.push(fn);
}

function disposeAll() {
  while (disposers.length) {
    const fn = disposers.pop();
    try {
      fn();
    } catch {
      /* a failed cleanup must not stop the next screen rendering */
    }
  }
}

function loadingState(label = "Loading…") {
  return el(
    "div",
    { class: "aw-loading", role: "status", "aria-live": "polite" },
    el("span", { class: "aw-spinner", "aria-hidden": "true" }),
    el("span", { text: label })
  );
}

function emptyState({ title, body, action }) {
  return el(
    "div",
    { class: "aw-empty" },
    el("p", { class: "aw-empty__title", text: title }),
    body ? el("p", { class: "aw-empty__body", text: body }) : null,
    action ?? null
  );
}

function errorState(error, retry) {
  const box = el("div", { class: "aw-error", role: "alert" });
  const status = Number(error?.status ?? 0);
  let title = "That request did not work";
  if (status === 0) title = "The server could not be reached";
  else if (status === 429) title = "Too many requests";
  else if (status >= 500) title = "The server had a problem";
  else if (status === 403) title = "That request was refused";
  else if (status === 404) title = "That record no longer exists";

  box.append(
    el("p", { class: "aw-error__title", text: title }),
    el("p", { class: "aw-error__body", text: error?.message ?? "Something went wrong." })
  );

  if (status === 429) {
    const seconds = clamp(Number(error?.retryAfter ?? 60) || 60, 1, 900);
    const button = el("button", {
      class: "btn btn--primary",
      type: "button",
      disabled: true,
      text: `Try again in ${seconds}s`,
    });
    let left = seconds;
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        button.disabled = false;
        button.textContent = "Try again";
      } else {
        button.textContent = `Try again in ${left}s`;
      }
    }, 1000);
    onDispose(() => clearInterval(timer));
    button.addEventListener("click", () => retry?.());
    box.append(button);
  } else {
    box.append(button("Try again", { onClick: () => retry?.() }));
  }

  return box;
}

function button(label, { variant = "primary", type = "button", onClick, disabled = false, title, size } = {}) {
  const node = el("button", {
    class: classNames("btn", `btn--${variant}`, size === "sm" ? "btn--sm" : null),
    type,
    disabled,
    title,
    text: label,
  });
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

function linkButton(label, href, { variant = "ghost", download = false, target, size, rel } = {}) {
  return el("a", {
    class: classNames("btn", `btn--${variant}`, size === "sm" ? "btn--sm" : null),
    href,
    download: download || undefined,
    target,
    rel: rel ?? (target === "_blank" ? "noopener noreferrer" : undefined),
    text: label,
  });
}

function card({ title, kicker, meta, actions, tone, children }) {
  const metaNode = meta instanceof Node ? meta : meta ? el("p", { class: "aw-note", text: meta }) : null;
  const head =
    title || kicker || meta || actions
      ? el(
          "div",
          { class: "aw-card__head" },
          el(
            "div",
            { class: "aw-stack aw-stack--tight" },
            kicker ? el("p", { class: "aw-kicker", text: kicker }) : null,
            title ? el("h2", { class: "aw-card__title", text: title }) : null,
            metaNode
          ),
          actions ?? null
        )
      : null;
  return el(
    "section",
    { class: classNames("aw-card", tone ? `aw-card--${tone}` : null) },
    head,
    children === undefined ? null : children
  );
}

function section({ title, meta, actions, children }) {
  return el(
    "section",
    { class: "aw-section" },
    el(
      "div",
      { class: "aw-section__head" },
      el("h2", { class: "aw-section__title", text: title }),
      el("div", { class: "aw-row" }, meta ? el("span", { class: "aw-section__meta", text: meta }) : null, actions ?? null)
    ),
    children
  );
}

function field(labelText, control, hint) {
  if (!control.id) control.id = uniqueId("field");
  return el(
    "div",
    { class: "field" },
    el("label", { for: control.id, text: labelText }),
    control,
    hint ? el("p", { class: "hint", text: hint }) : null
  );
}

function textInput(props = {}) {
  return el("input", { class: "input", type: "text", ...props });
}

function textArea(props = {}) {
  return el("textarea", { class: "textarea", rows: 6, ...props });
}

function selectControl({ options, value, onchange, ariaLabel, id }) {
  const node = el("select", { class: "select", id, "aria-label": ariaLabel });
  for (const option of options) {
    const element = el("option", { value: option.value, text: option.label });
    if (String(option.value) === String(value)) element.selected = true;
    node.append(element);
  }
  if (onchange) node.addEventListener("change", onchange);
  return node;
}

function checkField(labelText, checked, onchange) {
  const input = el("input", { type: "checkbox", checked });
  if (onchange) input.addEventListener("change", () => onchange(input.checked));
  return el("label", { class: "aw-check" }, input, el("span", { text: labelText }));
}

function statusPip(status) {
  return el("span", { class: "aw-pip", dataset: { status }, text: statusLabel(status) });
}

function severityBadge(severity) {
  const label = { high: "High", medium: "Medium", low: "Low" }[severity] ?? "Note";
  return el("span", { class: "aw-badge", dataset: { severity }, text: label });
}

function sourceBadge(source, attribution) {
  return el("span", { class: "aw-source", title: attribution ?? undefined, text: sourceLabel(source) });
}

/** Pack text is markdown by contract; read it as plain text, never as markup. */
function plainText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The covering letter, or the plan lock that replaces it. A Free pack comes back
 * with `coverLetterMd: ""` and `coverLetterLocked` set, so this renders the
 * upgrade line where the letter would be rather than an empty box.
 */
function coveringLetterBlock(pack) {
  const letter = plainText(pack?.coverLetterMd);
  const locked = plainText(pack?.coverLetterLocked);
  if (letter) {
    return el(
      "div",
      { class: "aw-card aw-card--flat" },
      el("p", { class: "aw-kicker", text: "Covering letter" }),
      el("p", { class: "aw-prose", text: letter })
    );
  }
  if (locked) {
    return el(
      "div",
      { class: "aw-quota" },
      el("p", { class: "aw-quota__title", text: "This pack carries no covering letter" }),
      el("p", { text: locked }),
      el("div", { class: "aw-actions" }, linkButton("See plans", "/app/billing", { variant: "primary" }))
    );
  }
  return null;
}

/** Common screening answers, straight from the stored pack. */
function screeningBlock(pack) {
  const answers = Array.isArray(pack?.answers)
    ? pack.answers.filter((entry) => entry && (entry.question || entry.answer))
    : [];
  if (!answers.length) return null;
  return el(
    "div",
    { class: "aw-card aw-card--flat" },
    el("p", { class: "aw-kicker", text: "Screening answers" }),
    el(
      "div",
      { class: "aw-list" },
      answers.map((entry) =>
        el(
          "div",
          { class: "aw-list__item" },
          el("p", { class: "aw-list__title", text: String(entry.question ?? "Question") }),
          el("p", { class: "aw-prose", text: plainText(entry.answer) })
        )
      )
    )
  );
}

/** Fetch one application with its stored pack (the list endpoint omits it). */
async function loadApplication(applicationId, signal) {
  const data = await api(`/api/applications/${encodeURIComponent(applicationId)}`, { signal });
  return data?.application ?? null;
}

/* The writing-style signal is advisory: a badge with the reasons behind it in
   the tooltip, never a number to optimise against. */
const styleCache = new Map();

async function loadStyle(cvId, signal) {
  if (!cvId) return null;
  if (styleCache.has(cvId)) return styleCache.get(cvId);
  try {
    const data = await api(`/api/style?cvId=${encodeURIComponent(cvId)}`, { signal });
    const record = {
      ok: true,
      style: data?.style ?? {},
      badge: data?.badge ?? null,
      reasons: Array.isArray(data?.reasons) ? data.reasons : [],
    };
    styleCache.set(cvId, record);
    return record;
  } catch (error) {
    if (!isAbort(error)) styleCache.set(cvId, { ok: false });
    return null;
  }
}

function styleBadge(record) {
  if (!record?.ok) return null;
  const raw = record.badge;
  const hasBadge = raw !== null && raw !== undefined && Number.isFinite(Number(raw));
  const reasons = record.reasons ?? [];
  const title = reasons.length
    ? `Advisory, not a score to game. ${reasons.join(" ")}`
    : "Advisory, not a score to game: how your writing reads.";
  return el(
    "span",
    {
      class: "aw-style",
      title,
      "aria-label": `Sounds like you${hasBadge ? `, ${Math.round(Number(raw))}` : ""}. ${title}`,
    },
    el("span", { text: "Sounds like you" }),
    hasBadge ? el("span", { class: "aw-style__value", text: String(Math.round(Number(raw))) }) : null
  );
}

/** Connection/parse confidence as a label rather than a bare number. */
function confidenceLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const percent = number <= 1 ? Math.round(number * 100) : Math.round(number);
  const label = percent >= 75 ? "High" : percent >= 45 ? "Medium" : "Low";
  return `${label} confidence · ${percent}%`;
}

/** The contact block arrives as an object, a string or not at all. */
function contactSummary(contact) {
  if (!contact) return null;
  if (typeof contact === "string") return contact.trim() || null;
  if (typeof contact !== "object") return null;
  const bits = [contact.email, contact.phone, contact.location]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
  const links = Array.isArray(contact.links) ? contact.links.filter((link) => typeof link === "string" && link.trim()) : [];
  if (!links.length) {
    for (const key of ["url", "website", "linkedin"]) {
      if (typeof contact[key] === "string" && contact[key].trim()) links.push(contact[key].trim());
    }
  }
  if (links.length) bits.push(links.join(", "));
  return bits.length ? bits.join(" · ") : null;
}

function meter({ value, max, label, tone }) {
  const safeMax = Number(max) > 0 ? Number(max) : 0;
  const percent = safeMax ? clamp(Math.round((Number(value) / safeMax) * 100), 0, 100) : 0;
  return el(
    "div",
    {
      class: "aw-meter",
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": String(percent),
      "aria-label": label,
    },
    el("div", { class: "aw-meter__fill", dataset: tone ? { tone } : undefined, style: { width: `${percent}%` } })
  );
}

function scoreRing(score) {
  const value = clamp(Math.round(Number(score) || 0), 0, 100);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const filled = (circumference * value) / 100;
  return el(
    "div",
    { class: "aw-ring", role: "img", "aria-label": `Score ${value} out of 100` },
    svgEl(
      "svg",
      { viewBox: "0 0 108 108", "aria-hidden": "true", focusable: "false" },
      svgEl("circle", { class: "aw-ring__track", cx: 54, cy: 54, r: radius }),
      svgEl("circle", {
        class: "aw-ring__value",
        cx: 54,
        cy: 54,
        r: radius,
        transform: "rotate(-90 54 54)",
        "stroke-dasharray": `${filled.toFixed(2)} ${(circumference - filled).toFixed(2)}`,
      })
    ),
    el(
      "div",
      { class: "aw-ring__label" },
      el("span", { class: "aw-ring__number", text: String(value) }),
      el("span", { class: "aw-ring__of", text: "of 100" })
    )
  );
}

function subscoreBar(key, label, value) {
  const safe = clamp(Math.round(Number(value) || 0), 0, 100);
  return el(
    "div",
    { class: "aw-subscore" },
    el(
      "div",
      { class: "aw-subscore__row" },
      el("span", { text: label }),
      el("span", { class: "aw-subscore__value", text: `${safe}/100` })
    ),
    meter({
      value: safe,
      max: 100,
      label: `${label}: ${safe} of 100`,
      tone: safe >= 70 ? null : safe >= 40 ? "warn" : "err",
    })
  );
}

/** The 402 body: names the plan that covers it and links to billing. */
function quotaPrompt(error) {
  const target = upgradeTarget(error);
  const name = planName(target);
  return el(
    "div",
    { class: "aw-quota", role: "status" },
    el("p", {
      class: "aw-quota__title",
      text: name ? `${name} is the plan that covers this` : "Your plan has no room for that",
    }),
    el("p", { text: error?.message ?? "You have reached this plan's limit." }),
    target
      ? el("div", { class: "aw-actions" }, linkButton(`See ${name}`, "/app/billing", { variant: "primary" }))
      : null
  );
}

/** First click arms, second click acts. No modal, no window.confirm. */
function confirmButton({ label, confirmLabel, onConfirm, variant = "ghost", size }) {
  const node = button(label, { variant, size });
  let armed = false;
  let timer = null;
  const reset = () => {
    armed = false;
    node.textContent = label;
  };
  onDispose(() => {
    if (timer) clearTimeout(timer);
  });
  node.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      node.textContent = confirmLabel ?? `Confirm ${label.toLowerCase()}`;
      if (timer) clearTimeout(timer);
      timer = setTimeout(reset, 6000);
      return;
    }
    armed = false;
    if (timer) clearTimeout(timer);
    node.disabled = true;
    try {
      await onConfirm();
    } finally {
      node.disabled = false;
      reset();
    }
  });
  return node;
}

function statusLine() {
  return el("p", { class: "aw-status", role: "status", "aria-live": "polite" });
}

function say(line, message, tone = "err") {
  if (!line) return;
  line.textContent = message;
  line.dataset.tone = tone;
}

/** Show either an inline quota prompt or a plain error line for a failed action. */
function reportActionError(container, error) {
  if (!container) return;
  container.replaceChildren();
  if (error?.status === 402) container.append(quotaPrompt(error));
  else container.append(el("p", { class: "aw-status", dataset: { tone: "err" }, text: error?.message ?? "That did not work." }));
}

/* ------------------------------------------------------------------------- *
 * 7. Dashboard
 * ------------------------------------------------------------------------- */

function metricCard({ kicker, value, unit, note, action, children, variant }) {
  // Numerals may be display size; a document title is not a metric.
  const valueClass = variant === "doc" ? "aw-value aw-value--doc" : "aw-value aw-value--lg";
  return el(
    "section",
    { class: "aw-card" },
    el("p", { class: "aw-kicker", text: kicker }),
    el("p", { class: valueClass }, el("span", { text: value }), unit ? el("small", { text: unit }) : null),
    note ? el("p", { class: "aw-note", text: note }) : null,
    children ?? null,
    action ? el("div", { class: "aw-actions" }, action) : null
  );
}

function nextActionsFor({ me, cvs, lastReport, applications }) {
  const actions = [];
  const packs = quotaInfo("packs");
  const ready = applications.filter((application) => application.status === "pack_ready");

  if (!cvs.length) {
    actions.push({
      title: "Add your CV",
      body: "Paste the text or upload a .txt, .md or .docx file. Nothing is scored, tailored or queued until there is a CV to start from.",
      href: "/app/cv",
      label: "Add a CV",
    });
  }
  if (cvs.length && !lastReport) {
    actions.push({
      title: "Score your CV against a job",
      body: "Paste a job description and you get a score out of 100, five subscores and the findings behind every point.",
      href: "/app/cv",
      label: "Open the analysis",
    });
  }
  if (ready.length) {
    actions.push({
      title: `${ready.length} ${plural(ready.length, "pack")} ready to send`,
      body: "Tailored packs stop at ready. Apply on the employer's own page, then record the status so the board tells the truth.",
      href: "/app/applications",
      label: "Open the queue",
    });
  }
  if (!(me?.usage?.alerts ?? 0)) {
    actions.push({
      title: "Create a saved search",
      body: "One search plus the RSS feed means the boards keep running while you are not looking.",
      href: "/app/alerts",
      label: "Set up alerts",
    });
  }
  if (!packs.unlimited && packs.remaining === 0) {
    actions.push({
      title: "This month's tailored packs are used",
      body: `You have used all ${packs.limit} packs on the ${planName(me?.plan) ?? "current"} plan this month. Scores and the job feed keep working.`,
      href: "/app/billing",
      label: "Compare plans",
    });
  }
  if (!actions.length) {
    actions.push({
      title: "Nothing outstanding",
      body: "Your CV is scored, the queue is clear and your saved searches are running. The feed and the alerts will tell you when something is worth applying to.",
      href: "/app/jobs",
      label: "Browse the feed",
    });
  }
  return actions.slice(0, 4);
}

function nextActionList(actions) {
  return el(
    "div",
    { class: "aw-list" },
    actions.map((action) =>
      el(
        "div",
        { class: "aw-list__item" },
        el("p", { class: "aw-list__title", text: action.title }),
        el("p", { class: "aw-body-text", text: action.body }),
        el("div", { class: "aw-actions aw-mt-2" }, linkButton(action.label, action.href, { variant: "ghost", size: "sm" }))
      )
    )
  );
}

async function renderDashboard(mount, { signal }) {
  const results = await Promise.allSettled([
    loadMe(signal),
    api("/api/cvs", { signal }),
    api("/api/reports", { signal }),
    api("/api/applications", { signal }),
    api("/api/notifications?unread=1", { signal }),
  ]);
  if (signal.aborted) throw abortError();

  const settled = (index, fallback) => (results[index].status === "fulfilled" ? results[index].value : fallback);
  const me = settled(0, state.me);
  const cvs = settled(1, { cvs: [] }).cvs ?? [];
  const reports = settled(2, { reports: [] }).reports ?? [];
  const applications = settled(3, { applications: [] }).applications ?? [];
  const hits = settled(4, { notifications: [], unread: 0 }).notifications ?? [];

  const failures = [
    ["your CVs", results[1]],
    ["your scores", results[2]],
    ["your applications", results[3]],
    ["your alert hits", results[4]],
  ].filter(([, result]) => result.status === "rejected");

  if (failures.length) {
    setBanner(
      el(
        "div",
        { class: "aw-banner", dataset: { tone: "warn" } },
        el("strong", { text: "Part of this page could not load." }),
        el("span", {
          text: `We could not read ${failures.map(([name]) => name).join(" or ")}. The rest of the page is current; reload to try again.`,
        })
      )
    );
  }

  const primary = cvs.find((cv) => cv.primary) ?? cvs[0] ?? null;
  const lastReport = reports[0] ?? null;
  const packs = quotaInfo("packs");
  const unread = Number(me?.usage?.unreadNotifications ?? hits.length);

  const packsCard = metricCard({
    kicker: "Tailored packs this month",
    value: String(packs.used),
    unit: packs.unlimited ? "no limit" : `of ${packs.limit}`,
    note: packs.unlimited
      ? "Your plan does not cap packs."
      : `${packs.remaining} ${plural(packs.remaining, "credit")} left this month.`,
    children: packs.unlimited ? null : meter({ value: packs.used, max: packs.limit, label: `Packs used: ${packs.used} of ${packs.limit}` }),
    action: packs.unlimited ? null : linkButton("Plans", "/app/billing", { variant: "ghost", size: "sm" }),
  });

  const metrics = el(
    "div",
    { class: "aw-grid aw-grid--metrics" },
    metricCard({
      kicker: "Primary CV",
      value: primary ? primary.name : "None yet",
      variant: "doc",
      note: primary
        ? `${String(primary.format ?? "").toUpperCase()} · added ${formatDate(primary.createdAt) ?? "earlier"}`
        : "Add a CV to score it and to tailor packs from it.",
      action: linkButton(primary ? "Open library" : "Add a CV", "/app/cv", { variant: "ghost", size: "sm" }),
    }),
    metricCard({
      kicker: "Last score",
      value: lastReport ? String(lastReport.score) : "—",
      unit: lastReport ? "of 100" : null,
      note: lastReport
        ? `${lastReport.job_title ?? "Unnamed role"} · ${formatWhen(lastReport.created_at) ?? "recently"}`
        : "No CV has been scored yet.",
      action: linkButton("Score a CV", "/app/cv", { variant: "ghost", size: "sm" }),
    }),
    packsCard,
    metricCard({
      kicker: "Unread alert hits",
      value: String(unread),
      note: unread ? "Saved searches have found postings you have not read." : "No unread hits from your saved searches.",
      action: linkButton("Open alerts", "/app/alerts", { variant: "ghost", size: "sm" }),
    })
  );

  const recentApplications = applications.slice(0, 5);
  const recentBlock = recentApplications.length
    ? el(
        "div",
        { class: "aw-table-wrap" },
        el(
          "table",
          { class: "aw-table" },
          el("caption", { text: `The ${recentApplications.length} most recently updated.` }),
          el(
            "thead",
            null,
            el(
              "tr",
              null,
              el("th", { scope: "col", text: "Role" }),
              el("th", { scope: "col", text: "Company" }),
              el("th", { scope: "col", text: "Status" }),
              el("th", { scope: "col", text: "Score" }),
              el("th", { scope: "col", text: "Updated" })
            )
          ),
          el(
            "tbody",
            null,
            recentApplications.map((application) =>
              el(
                "tr",
                null,
                el("td", { "data-label": "Role" }, el("span", { class: "aw-cell-title", text: application.title })),
                el("td", { "data-label": "Company", text: application.company ?? "Not stated" }),
                el("td", { "data-label": "Status" }, statusPip(application.status)),
                el("td", { class: "aw-cell-num", "data-label": "Score", text: application.score === null ? "—" : String(application.score) }),
                el("td", { class: "aw-cell-num", "data-label": "Updated", text: formatWhen(application.updatedAt) ?? "—" })
              )
            )
          )
        )
      )
    : emptyState({
        title: "No applications yet",
        body: "Tailor a pack for a job and it lands here with its status, score and pack. Nothing is sent from this page: you apply on the employer's site and record what happened.",
        action: el("div", { class: "aw-actions" }, linkButton("Browse jobs", "/app/jobs", { variant: "primary" }), linkButton("Open CV library", "/app/cv")),
      });

  const hitsBlock = hits.length
    ? el(
        "div",
        { class: "aw-list" },
        hits.slice(0, 5).map((notification) => {
          const item = el(
            "div",
            { class: "aw-list__item" },
            el("p", { class: "aw-list__title", text: notification.title }),
            el("p", { class: "aw-list__meta" }, `${notification.body ?? "New match"} · ${formatWhen(notification.created_at) ?? "recently"}`),
            el(
              "div",
              { class: "aw-actions aw-mt-2" },
              button("Mark as read", {
                variant: "ghost",
                onClick: async (event) => {
                  const target = event.currentTarget;
                  target.disabled = true;
                  try {
                    await api(`/api/notifications/${encodeURIComponent(notification.id)}/read`, { method: "POST" });
                    item.remove();
                    await loadMe(signal, { force: true });
                    toast("Marked as read.");
                  } catch (error) {
                    target.disabled = false;
                    toastError(error);
                  }
                },
              })
            )
          );
          return item;
        })
      )
    : emptyState({
        title: "No unread hits",
        body: "Saved searches drop new matches here and into the RSS feed. If you have no searches yet, that is the place to start.",
        action: linkButton("Set up an alert", "/app/alerts", { variant: "primary" }),
      });

  const actions = nextActionsFor({ me, cvs, lastReport, applications });

  mount.replaceChildren(
    metrics,
    section({
      title: "Next actions",
      meta: `${actions.length} worth doing now`,
      children: el("div", { class: "aw-card" }, nextActionList(actions)),
    }),
    section({
      title: "Recent applications",
      actions: linkButton("All applications", "/app/applications", { variant: "ghost" }),
      children: recentBlock,
    }),
    section({
      title: "Unread alert hits",
      actions: linkButton("All alerts", "/app/alerts", { variant: "ghost" }),
      children: hitsBlock,
    })
  );
}

/* ------------------------------------------------------------------------- *
 * 8. CV library and analysis
 * ------------------------------------------------------------------------- */

function readFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma === -1 ? "" : result.slice(comma + 1));
    });
    reader.addEventListener("error", () => reject(new Error("That file could not be read from disk.")));
    reader.readAsDataURL(file);
  });
}

function reportPanel(report, { onTailor, advisory } = {}) {
  const coverage = report?.keywordCoverage ?? {};
  const credits = creditsInfo();
  const matched = Array.isArray(coverage.matched) ? coverage.matched : [];
  const missing = Array.isArray(coverage.missing) ? coverage.missing : [];
  const ratio = Number(coverage.ratio ?? 0);
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const advice = Array.isArray(report?.advice) ? report.advice : [];

  const subscoreNodes = SUBSCOPE_LABELS.filter(([key]) => typeof report?.subscores?.[key] === "number").map(([key, label]) =>
    subscoreBar(key, label, report.subscores[key])
  );

  const coverageBlock =
    matched.length || missing.length
      ? el(
          "div",
          { class: "aw-stack" },
          el(
            "div",
            { class: "aw-subscore__row" },
            el("span", { class: "aw-kicker", text: "Keyword coverage" }),
            el("span", { class: "aw-subscore__value", text: `${ratio}%` })
          ),
          meter({ value: ratio, max: 100, label: `Keyword coverage: ${ratio}%`, tone: ratio >= 70 ? null : ratio >= 40 ? "warn" : "err" }),
          matched.length
            ? el(
                "div",
                { class: "aw-stack aw-stack--tight" },
                el("p", { class: "aw-kicker", text: `In your CV (${matched.length})` }),
                el("div", { class: "aw-chipset" }, matched.map((term) => el("span", { class: "chip aw-chip--match", text: term })))
              )
            : null,
          missing.length
            ? el(
                "div",
                { class: "aw-stack aw-stack--tight" },
                el("p", { class: "aw-kicker", text: `Missing from your CV (${missing.length})` }),
                el("div", { class: "aw-chipset" }, missing.map((term) => el("span", { class: "chip aw-chip--miss", text: term })))
              )
            : null
        )
      : el("p", { class: "aw-note", text: "No job keywords were found in that description, so the keyword section could not be measured." });

  return el(
    "div",
    { class: "aw-stack" },
    el(
      "div",
      { class: "aw-card aw-card--flat" },
      el(
        "div",
        { class: "aw-score" },
        scoreRing(report?.score ?? 0),
        el(
          "div",
          { class: "aw-stack aw-stack--tight aw-grow" },
          el("p", { class: "aw-kicker", text: "Score against this posting" }),
          el("p", { class: "aw-body-text", text: "Five sections, weighted into one total. Every point below has a finding and a fix behind it." }),
          advisory ? el("p", { class: "aw-note", text: advisory }) : null,
          subscoreNodes.length ? el("div", { class: "aw-stack aw-stack--tight" }, subscoreNodes) : null
        )
      )
    ),
    coverageBlock,
    findings.length
      ? el(
          "div",
          { class: "aw-stack" },
          el("h3", { class: "aw-section__title", text: `Findings (${findings.length})` }),
          el(
            "div",
            { class: "aw-findings" },
            findings.map((finding) =>
              el(
                "div",
                { class: "aw-finding", dataset: { severity: finding.severity ?? "low" } },
                el(
                  "div",
                  { class: "aw-finding__head" },
                  severityBadge(finding.severity),
                  el("p", { class: "aw-finding__title", text: finding.title })
                ),
                finding.detail ? el("p", { class: "aw-finding__detail", text: finding.detail }) : null,
                finding.fix ? el("p", { class: "aw-finding__fix" }, el("span", { text: "Fix" }), finding.fix) : null
              )
            )
          )
        )
      : null,
    advice.length
      ? el(
          "div",
          { class: "aw-card aw-card--accent" },
          el("h3", { class: "aw-card__title", text: "What to change first" }),
          el(
            "ol",
            { class: "aw-stack aw-stack--tight aw-advice" },
            advice.map((line) => el("li", { class: "aw-body-text", text: line }))
          )
        )
      : null,
    onTailor
      ? el(
          "div",
          { class: "aw-actions" },
          button(tailorLabel("Create the tailored pack"), {
            onClick: onTailor,
            disabled: credits.exhausted,
          }),
          el("span", {
            class: "aw-note",
            text: credits.unlimited ? "Unlimited credits on your plan." : `${credits.label} this month.`,
          }),
          credits.exhausted ? linkButton("See plans", "/app/billing", { variant: "ghost" }) : null
        )
      : null
  );
}

async function renderCvScreen(mount, { signal }) {
  const results = await Promise.allSettled([loadMe(signal), api("/api/cvs", { signal }), api("/api/connectors", { signal })]);
  if (signal.aborted) throw abortError();
  // The CV list is the screen: without it there is nothing honest to draw.
  if (results[1].status !== "fulfilled") throw results[1].reason;
  const cvResponse = results[1].value;
  // null means the connector route is not available on this server, which is a
  // different thing from "there are no connectors".
  const connectors = results[2].status === "fulfilled" ? (results[2].value?.connectors ?? []) : null;

  let cvs = cvResponse.cvs ?? [];
  const quota = quotaInfo("cvs");
  let selectedCvId = (cvs.find((cv) => cv.primary) ?? cvs[0])?.id ?? "";

  const libraryBox = el("div", { class: "aw-grid aw-grid--2" });
  const selectHost = el("div", { class: "field" });
  const analysisResult = el("div", { class: "aw-stack" });
  const analysisStatus = statusLine();
  const tailorStatus = el("div", { class: "aw-stack" });

  function cvMeta(cv) {
    const bits = [String(cv.format ?? "").toUpperCase() || "TEXT", `added ${formatDate(cv.createdAt) ?? "earlier"}`];
    return bits.join(" · ");
  }

  /** Advisory writing-style badges for the first few CVs (one request each). */
  function loadLibraryStyles() {
    const targets = cvs.slice(0, 5);
    if (!targets.length) return;
    Promise.allSettled(targets.map((cv) => loadStyle(cv.id, signal)))
      .then(() => {
        if (!signal.aborted) renderLibrary();
      })
      .catch(() => {
        /* advisory only: no badge is a valid outcome */
      });
  }

  function renderLibrary() {
    if (!cvs.length) {
      libraryBox.replaceChildren(
        emptyState({
          title: "No CVs yet",
          body: "Import a profile, paste the text or upload a file. The text is what gets scored and tailored — the original file is never kept.",
          action: el("div", { class: "aw-actions" }, el("a", { class: "btn btn--ghost", href: "#cv-add", text: "Add one below" })),
        })
      );
      return;
    }
    libraryBox.replaceChildren(
      ...cvs.map((cv) => {
        const styleRecord = styleCache.get(cv.id);
        return el(
          "article",
          { class: "aw-cv", dataset: { primary: String(Boolean(cv.primary)) } },
          el(
            "div",
            { class: "aw-card__head" },
            el("h3", { class: "aw-card__title", text: cv.name }),
            el(
              "div",
              { class: "aw-row" },
              cv.primary ? el("span", { class: "aw-pip", dataset: { status: "approved" }, text: "Primary" }) : null,
              styleBadge(styleRecord)
            )
          ),
          el("p", { class: "aw-note", text: cvMeta(cv) }),
          cv.preview ? el("p", { class: "aw-cv__preview", text: cv.preview }) : null,
          el(
            "div",
            { class: "aw-actions aw-mt-2" },
            button("Analyse this", {
              variant: "ghost",
              size: "sm",
              onClick: () => {
                selectedCvId = cv.id;
                renderSelect();
                jobText.focus();
                byId("cv-analyse")?.scrollIntoView({ behavior: "smooth", block: "start" });
              },
            }),
            !cv.primary
              ? button("Set as primary", {
                  variant: "ghost",
                  size: "sm",
                  onClick: async (event) => {
                    const target = event.currentTarget;
                    target.disabled = true;
                    try {
                      await api(`/api/cvs/${encodeURIComponent(cv.id)}`, { method: "PATCH", body: { primary: true } });
                      cvs = cvs.map((item) => ({ ...item, primary: item.id === cv.id }));
                      renderLibrary();
                      renderSelect();
                      toast(`${cv.name} is now your primary CV.`);
                    } catch (error) {
                      target.disabled = false;
                      toastError(error);
                    }
                  },
                })
              : null,
            confirmButton({
              label: "Delete",
              confirmLabel: "Confirm delete",
              variant: "ghost",
              size: "sm",
              onConfirm: async () => {
                try {
                  await api(`/api/cvs/${encodeURIComponent(cv.id)}`, { method: "DELETE" });
                  cvs = cvs.filter((item) => item.id !== cv.id);
                  styleCache.delete(cv.id);
                  if (selectedCvId === cv.id) selectedCvId = (cvs.find((item) => item.primary) ?? cvs[0])?.id ?? "";
                  await loadMe(null, { force: true });
                  renderLibrary();
                  renderSelect();
                  refreshCvQuotaNote();
                  updateRail();
                  toast(`${cv.name} deleted.`);
                } catch (error) {
                  toastError(error);
                }
              },
            })
          )
        );
      })
    );
  }

  function renderSelect() {
    selectHost.replaceChildren();
    if (!cvs.length) {
      selectHost.append(
        el("label", { text: "CV" }),
        el("p", { class: "hint", text: "Add a CV first — there is nothing to score." })
      );
      return;
    }
    if (!cvs.some((cv) => cv.id === selectedCvId)) selectedCvId = (cvs.find((cv) => cv.primary) ?? cvs[0]).id;
    const select = selectControl({
      options: cvs.map((cv) => ({ value: cv.id, label: cv.primary ? `${cv.name} (primary)` : cv.name })),
      value: selectedCvId,
      onchange: (event) => {
        selectedCvId = event.currentTarget.value;
      },
    });
    selectHost.append(el("label", { for: select.id }, "CV"), select);
  }

  /* --- create by pasting text ---------------------------------------- */
  const pasteName = textInput({ placeholder: "Engineering CV", autocomplete: "off" });
  const pasteText = textArea({
    rows: 10,
    placeholder: "Paste the whole CV as plain text: contact block, summary, each role with its bullets, education and skills.",
  });
  const pasteStatus = statusLine();
  const pasteForm = el(
    "form",
    { class: "aw-form", novalidate: true },
    field("Name (optional)", pasteName),
    field("CV text", pasteText, "At least 80 characters. Plain text is what gets scored — formatting is read from the text itself."),
    el("div", { class: "aw-form__actions" }, el("button", { class: "btn btn--primary", type: "submit", text: "Add this CV" }), pasteStatus),
    el("div", { class: "aw-form__errors" })
  );

  pasteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = pasteForm.querySelector("button[type=submit]");
    const text = pasteText.value.trim();
    if (text.length < 80) {
      say(pasteStatus, "That CV is too short to analyse — paste the whole text (at least 80 characters).");
      pasteText.focus();
      return;
    }
    submit.disabled = true;
    say(pasteStatus, "Adding…", "ok");
    try {
      const data = await api("/api/cvs", {
        method: "POST",
        body: { name: pasteName.value.trim() || undefined, text },
      });
      cvs = [data.cv, ...cvs];
      selectedCvId = data.cv.id;
      pasteForm.reset();
      say(pasteStatus, "Added.", "ok");
      await loadMe(signal, { force: true });
      renderLibrary();
      renderSelect();
      refreshCvQuotaNote();
      updateRail();
      toast(`${data.cv.name} added.`);
    } catch (error) {
      reportActionError(pasteForm.querySelector(".aw-form__errors"), error);
      say(pasteStatus, error.message);
    } finally {
      submit.disabled = false;
    }
  });

  /* --- create by uploading a file ------------------------------------ */
  const uploadName = textInput({ placeholder: "Take the name from the file", autocomplete: "off" });
  const fileInput = el("input", { type: "file", accept: ".txt,.md,.docx,.pdf,.odt,.rtf,.html,.htm,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff", "aria-describedby": "cv-file-hint" });
  const uploadStatus = statusLine();
  const uploadErrors = el("div", { class: "aw-stack" });
  const uploadForm = el(
    "form",
    { class: "aw-form", novalidate: true },
    field("File", fileInput, "TXT, MD, DOCX, PDF, ODT, RTF, HTML, or an image (PNG/JPG/TIFF/BMP/WebP) read with OCR. Scanned PDFs are not OCRed — export the pages as images first, and check OCR text against the original."),
    field("Name (optional)", uploadName),
    el("div", { class: "aw-form__actions" }, el("button", { class: "btn btn--primary", type: "submit", text: "Upload and add" }), uploadStatus),
    uploadErrors
  );

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = uploadForm.querySelector("button[type=submit]");
    const file = fileInput.files?.[0];
    if (!file) {
      say(uploadStatus, "Choose a file first.");
      return;
    }
    submit.disabled = true;
    say(uploadStatus, "Reading the file…", "ok");
    try {
      const contentBase64 = await readFileBase64(file);
      if (!contentBase64) throw new Error("That file is empty.");
      const data = await api("/api/cvs", {
        method: "POST",
        body: {
          filename: file.name,
          contentBase64,
          name: uploadName.value.trim() || undefined,
        },
      });
      cvs = [data.cv, ...cvs];
      selectedCvId = data.cv.id;
      uploadForm.reset();
      say(uploadStatus, "Added.", "ok");
      uploadErrors.replaceChildren();
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      if (warnings.length) {
        uploadErrors.append(
          el(
            "div",
            { class: "aw-banner", dataset: { tone: "warn" } },
            el("strong", { text: "Read with warnings." }),
            el("span", { text: warnings.join(" ") })
          )
        );
      }
      await loadMe(signal, { force: true });
      renderLibrary();
      renderSelect();
      refreshCvQuotaNote();
      updateRail();
      toast(`${data.cv.name} added.`);
    } catch (error) {
      reportActionError(uploadErrors, error);
      say(uploadStatus, error.message);
    } finally {
      submit.disabled = false;
    }
  });

  /* --- import a profile through a connector -------------------------- */
  const importStatus = statusLine();
  const importErrors = el("div", { class: "aw-stack" });
  const importResult = el("div", { class: "aw-stack" });
  const profileText = textArea({
    rows: 8,
    placeholder: "Paste your LinkedIn profile text: headline, About, each role with its dates, education, skills.",
  });
  const profileName = textInput({ placeholder: "Profile import", autocomplete: "off" });
  let parsedProfile = null;

  const connectorList = el("div", { class: "aw-connectors" });
  // Only the profile connectors belong in this panel: the CV-file, job-paste and
  // job-link connectors are already the upload form and the capture box.
  const profileConnectors = Array.isArray(connectors)
    ? connectors.filter((connector) => String(connector?.kind ?? "profile") === "profile")
    : null;
  if (profileConnectors === null) {
    connectorList.append(el("p", { class: "aw-note", text: "Profile import is not configured on this server yet." }));
  } else if (!profileConnectors.length) {
    connectorList.append(el("p", { class: "aw-note", text: "No profile connectors are configured on this server." }));
  } else {
    for (const connector of profileConnectors) {
      const accepts = connector.accepts;
      connectorList.append(
        el(
          "div",
          { class: "aw-connector" },
          el(
            "div",
            { class: "aw-connector__head" },
            el("span", { class: "aw-connector__name", text: connector.name ?? connector.id ?? "Connector" }),
            connector.kind ? el("span", { class: "aw-source", text: String(connector.kind) }) : null,
            connector.requiresUserAction ? el("span", { class: "aw-badge", text: "You supply the text" }) : null
          ),
          connector.description ? el("p", { class: "aw-connector__desc", text: String(connector.description) }) : null,
          accepts
            ? el("p", {
                class: "aw-connector__meta",
                text: `Accepts: ${Array.isArray(accepts) ? accepts.join(", ") : String(accepts)}`,
              })
            : null,
          connector.notes ? el("p", { class: "aw-connector__desc", text: String(connector.notes) }) : null
        )
      );
    }
    connectorList.append(
      el("p", {
        class: "aw-note",
        text: "A CV file goes through the upload form below, and a job posting goes through the capture box on the Jobs screen.",
      })
    );
  }

  const importForm = el(
    "form",
    { class: "aw-form", novalidate: true },
    connectorList,
    el("p", {
      class: "aw-body-text",
      text: "Copy the text of your own profile from the browser where you are already signed in — or use your own PDF export — and paste it here. Applywright does not sign in to LinkedIn, uses no OAuth, and never fetches the page for you.",
    }),
    field("Profile text", profileText),
    field("Name for the new CV (optional)", profileName),
    el(
      "div",
      { class: "aw-form__actions" },
      el("button", { class: "btn btn--primary", type: "submit", text: "Read this profile" }),
      button("Paste from clipboard", {
        variant: "ghost",
        onClick: async () => {
          // A user gesture is required, and the clipboard is only readable in a
          // secure context (https, or 127.0.0.1 during development).
          try {
            const text = await navigator.clipboard.readText();
            if (!text.trim()) {
              say(importStatus, "The clipboard is empty.");
              return;
            }
            profileText.value = text;
            profileText.focus();
            say(importStatus, "Pasted from the clipboard. Read it when you are ready.", "ok");
          } catch {
            profileText.focus();
            say(importStatus, "The clipboard could not be read — click the box and press Ctrl+V instead.");
          }
        },
      }),
      importStatus
    ),
    importResult,
    importErrors
  );

  // A bookmarklet handoff (or a plain ?import=1) lands here with the text ready.
  const importCapture = takeCapture("profile");
  if (importCapture) {
    profileText.value = importCapture.text;
    say(importStatus, "Profile text captured from the bookmarklet — read it to continue.", "ok");
  } else if (new URLSearchParams(location.search).get("import") === "1") {
    say(importStatus, "Paste the profile text into the box (Ctrl+V), then read it.", "ok");
  }
  if (importCapture || new URLSearchParams(location.search).get("import") === "1") {
    requestAnimationFrame(() => {
      if (signal.aborted) return;
      profileText.focus();
      profileText.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  importForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = importForm.querySelector("button[type=submit]");
    const text = profileText.value.trim();
    if (text.length < 40) {
      say(importStatus, "Paste the profile text first — headline, about and at least one role.");
      profileText.focus();
      return;
    }
    submit.disabled = true;
    say(importStatus, "Reading the profile…", "ok");
    importErrors.replaceChildren();
    importResult.replaceChildren();
    try {
      const data = await api("/api/connectors/linkedin", { method: "POST", body: { text } });
      parsedProfile = data.profile ?? null;
      const profile = parsedProfile ?? {};
      const confidence = confidenceLabel(data.confidence);
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      const experience = Array.isArray(profile.experience) ? profile.experience : [];
      const skills = Array.isArray(profile.skills) ? profile.skills : [];
      const education = Array.isArray(profile.education) ? profile.education : [];
      const certifications = Array.isArray(profile.certifications) ? profile.certifications : [];
      const languages = Array.isArray(profile.languages) ? profile.languages : [];
      const contact = contactSummary(profile.contact);

      say(importStatus, confidence ? `Read with ${confidence.toLowerCase()}.` : "Profile read.", "ok");

      const createFromProfile = async (clickEvent) => {
        const target = clickEvent.currentTarget;
        target.disabled = true;
        target.textContent = "Creating the CV…";
        importErrors.replaceChildren();
        try {
          const created = await api("/api/cvs/from-profile", {
            method: "POST",
            body: { profile: parsedProfile, name: profileName.value.trim() || undefined },
          });
          cvs = [created.cv, ...cvs];
          selectedCvId = created.cv.id;
          await loadMe(null, { force: true });
          renderLibrary();
          renderSelect();
          refreshCvQuotaNote();
          updateRail();
          loadLibraryStyles();
          target.textContent = "CV created";
          toast(`${created.cv.name} created from the profile.`);
          const createdWarnings = Array.isArray(created.warnings) ? created.warnings : [];
          if (createdWarnings.length) {
            importErrors.replaceChildren(
              el("div", { class: "aw-banner", dataset: { tone: "warn" } }, el("span", { text: createdWarnings.join(" ") }))
            );
          }
        } catch (error) {
          target.disabled = false;
          target.textContent = "Create CV from this profile";
          reportActionError(importErrors, error);
        }
      };

      importResult.replaceChildren(
        el(
          "div",
          { class: "aw-card aw-card--flat" },
          el(
            "div",
            { class: "aw-row" },
            el("span", { class: "aw-kicker", text: "Parsed profile" }),
            confidence ? el("span", { class: "aw-badge", text: confidence }) : null
          ),
          el(
            "div",
            { class: "aw-profile-summary" },
            el("p", { class: "aw-card__title", text: profile.name ?? "Name not found" }),
            profile.headline ? el("p", { class: "aw-note", text: String(profile.headline) }) : null,
            profile.location ? el("p", { class: "aw-note", text: String(profile.location) }) : null,
            contact ? el("p", { class: "aw-note", text: contact }) : null,
            el("p", {
              class: "aw-note",
              text: `${experience.length} ${plural(experience.length, "role")} · ${skills.length} ${plural(skills.length, "skill")} · ${education.length} ${plural(education.length, "qualification")} · ${certifications.length} ${plural(certifications.length, "certification")} · ${languages.length} ${plural(languages.length, "language")}`,
            })
          ),
          warnings.length
            ? el("div", { class: "aw-banner", dataset: { tone: "warn" } }, el("span", { text: warnings.join(" ") }))
            : null,
          el(
            "div",
            { class: "aw-actions" },
            button("Create CV from this profile", {
              disabled: !parsedProfile,
              onClick: createFromProfile,
            })
          ),
          el("p", {
            class: "aw-note",
            text: "The CV is built from this profile only. Check the text before you score it — the parser reports what it could not read in the warnings above.",
          })
        )
      );
    } catch (error) {
      reportActionError(importErrors, error);
      say(importStatus, error.message);
    } finally {
      submit.disabled = false;
    }
  });

  /* --- analyse against a job description ----------------------------- */
  const jobTitleInput = textInput({ placeholder: "Senior platform engineer", autocomplete: "off" });
  const jobText = textArea({ rows: 9, placeholder: "Paste the job description, or the posting text." });
  const analyseStatus = statusLine();
  const analyseErrors = el("div", { class: "aw-stack" });
  const analyseForm = el(
    "form",
    { class: "aw-form", novalidate: true },
    el("div", { class: "aw-form__row aw-form__row--2" }, field("Role title (optional)", jobTitleInput), selectHost),
    field("Job description", jobText, "The keyword section is measured against this text, so paste the posting rather than a summary of it."),
    el(
      "div",
      { class: "aw-form__actions" },
      el("button", { class: "btn btn--primary", type: "submit", text: "Score this CV" }),
      analyseStatus
    ),
    analyseErrors
  );

  analyseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = analyseForm.querySelector("button[type=submit]");
    const description = jobText.value.trim();
    if (!selectedCvId) {
      say(analyseStatus, "Add a CV before scoring one.");
      return;
    }
    if (!description) {
      say(analyseStatus, "Paste the job description — the keyword section needs it.");
      jobText.focus();
      return;
    }
    submit.disabled = true;
    say(analyseStatus, "Scoring…", "ok");
    analyseErrors.replaceChildren();
    tailorStatus.replaceChildren();
    try {
      const data = await api("/api/analyse", {
        method: "POST",
        body: { cvId: selectedCvId, jobText: description, title: jobTitleInput.value.trim() || undefined },
      });
      say(analyseStatus, `Scored ${data.report?.score ?? 0} of 100.`, "ok");
      const styleRecord = await loadStyle(selectedCvId, signal);
      if (styleRecord?.ok) renderLibrary();
      analysisResult.replaceChildren(
        styleRecord?.ok ? el("div", { class: "aw-row" }, styleBadge(styleRecord)) : null,
        reportPanel(data.report ?? {}, {
          advisory: typeof data.advisory === "string" && data.advisory.trim() ? data.advisory.trim() : null,
          onTailor: async () => {
            tailorStatus.replaceChildren(loadingState("Tailoring the pack…"));
            try {
              const created = await api("/api/tailor", {
                method: "POST",
                body: {
                  cvId: selectedCvId,
                  jobText: description,
                  title: jobTitleInput.value.trim() || undefined,
                  company: data.job?.company ?? undefined,
                  url: data.job?.url ?? undefined,
                },
              });
              await loadMe(signal, { force: true });
              updateRail();
              // Read the stored pack: it carries the covering letter, or the
              // plan lock that replaced it, which the tailor response omits.
              let storedPack = null;
              try {
                storedPack = (await loadApplication(created.application?.id, signal))?.pack ?? null;
              } catch (error) {
                if (isAbort(error)) return;
                storedPack = null;
              }
              const packBlocks = [coveringLetterBlock(storedPack), screeningBlock(storedPack)].filter(Boolean);
              tailorStatus.replaceChildren(
                el(
                  "div",
                  { class: "aw-card aw-card--accent" },
                  el("h3", { class: "aw-card__title", text: "Pack ready" }),
                  el("p", {
                    class: "aw-body-text",
                    text: `${created.application?.title ?? "The pack"} scored ${created.application?.score ?? "—"} of 100 when it was built. It is in the queue as “pack ready”.`,
                  }),
                  el(
                    "div",
                    { class: "aw-actions" },
                    linkButton("Open the queue", "/app/applications", { variant: "primary" }),
                    created.application?.id
                      ? linkButton("View the CV pack", `/api/applications/${encodeURIComponent(created.application.id)}/cv`, {
                          variant: "ghost",
                          target: "_blank",
                        })
                      : null
                  )
                ),
                ...packBlocks
              );
              toast("Pack created and queued.");
            } catch (error) {
              if (error?.status === 402) tailorStatus.replaceChildren(quotaPrompt(error));
              else tailorStatus.replaceChildren(el("p", { class: "aw-status", dataset: { tone: "err" }, text: error.message }));
            }
          },
        })
      );
      analysisResult.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      reportActionError(analyseErrors, error);
      say(analyseStatus, error.message);
    } finally {
      submit.disabled = false;
    }
  });

  renderLibrary();
  renderSelect();
  loadLibraryStyles();

  // The CV allowance is re-read after every add or delete, so this line can
  // never show a stale count.
  const cvQuotaNote = el("p", { class: "aw-note" });
  const refreshCvQuotaNote = () => {
    const current = quotaInfo("cvs");
    cvQuotaNote.textContent = current.unlimited
      ? "Your plan does not cap CVs."
      : `${current.used} of ${current.limit} ${plural(current.limit, "CV", "CVs")} used on this plan.`;
  };
  refreshCvQuotaNote();

  const addSection = el(
    "div",
    { class: "aw-grid aw-grid--2", id: "cv-add" },
    card({
      kicker: "Add a CV",
      title: "Paste the text",
      meta: cvQuotaNote,
      children: pasteForm,
    }),
    card({ kicker: "Add a CV", title: "Upload a file", children: uploadForm })
  );

  // Every route into a CV sits in one drawer, so an account that already has a
  // CV lands on the library and the score panel instead of a long import form.
  const wantsImport = Boolean(importCapture) || new URLSearchParams(location.search).get("import") === "1";
  const ingest = el(
    "details",
    { class: "aw-ingest", id: "cv-ingest", open: cvs.length === 0 || wantsImport },
    el(
      "summary",
      null,
      el("span", { text: "Add or import a CV" }),
      el("span", { class: "aw-note", text: "paste · upload · import a profile" })
    ),
    el(
      "div",
      { class: "aw-ingest__body" },
      card({
        kicker: "Import a profile",
        title: "From your own profile text",
        meta: "You paste the text; nothing is fetched for you",
        children: importForm,
      }),
      addSection
    )
  );

  const librarySection = section({
    title: "Your CVs",
    meta: cvs.length ? `${cvs.length} on file` : null,
    children: libraryBox,
  });

  const analyseSection = el(
    "div",
    { id: "cv-analyse" },
    section({
      title: "Analyse against a job",
      meta: "Score, subscores and findings",
      children: el(
        "div",
        { class: "aw-stack" },
        el("div", { class: "aw-card" }, analyseForm),
        analyseErrors,
        analysisResult,
        tailorStatus
      ),
    })
  );

  // An empty account gets the drawer first (and open); one with a CV gets the
  // library and the score panel first, with ingestion folded away.
  mount.replaceChildren(...(cvs.length ? [librarySection, analyseSection, ingest] : [ingest, librarySection]));
}

/* ------------------------------------------------------------------------- *
 * 9. Jobs
 * ------------------------------------------------------------------------- */

/** The feed is camelCase; capture and /api/jobs/:id hand back the raw row. */
function normaliseJob(raw) {
  const job = raw ?? {};
  return {
    id: job.id ?? null,
    source: job.source ?? "unknown",
    title: job.title ?? "Untitled role",
    company: job.company ?? null,
    location: job.location ?? null,
    remote: Boolean(job.remote),
    salaryMin: job.salaryMin ?? job.salary_min ?? null,
    salaryMax: job.salaryMax ?? job.salary_max ?? null,
    currency: job.currency ?? null,
    url: job.url ?? null,
    postedAt: job.postedAt ?? job.posted_at ?? null,
    tags: Array.isArray(job.tags) ? job.tags : [],
    description: job.description ?? null,
    attribution: job.attribution ?? null,
  };
}

function jobCard(job, { canQueue, registerCreditButton, afterQueue }) {
  const salary = salaryLabel(job);
  // The salary appears once, in the head. Repeating it in the meta line read as
  // two different facts about the same posting.
  const meta = el(
    "p",
    { class: "aw-job__meta" },
    el("span", { text: job.company ?? "Company not stated" }),
    el("span", { class: "dot-sep", "aria-hidden": "true", text: "·" }),
    el("span", { text: job.location ?? "Location not stated" }),
    job.remote ? el("span", { class: "aw-pip", dataset: { status: "active" }, text: "Remote" }) : null
  );

  const title = job.url
    ? el("a", { class: "aw-job__title", href: job.url, target: "_blank", rel: "noopener noreferrer", text: job.title })
    : el("span", { class: "aw-job__title", text: job.title });

  const foot = el("div", { class: "aw-job__foot" });
  const queueSlot = el("div", { class: "aw-actions" });

  if (canQueue) {
    const credits = creditsInfo();
    const queueButton = button(tailorLabel(), {
      variant: "primary",
      size: "sm",
      disabled: credits.exhausted,
      onClick: async () => {
        queueButton.disabled = true;
        queueButton.textContent = "Tailoring…";
        try {
          const created = await api("/api/tailor", { method: "POST", body: { jobId: job.id } });
          await loadMe(null, { force: true });
          updateRail();
          afterQueue?.();
          queueSlot.replaceChildren(
            el("span", { class: "aw-save-note", text: `Queued · scored ${created.application?.score ?? "—"}` }),
            linkButton("Open queue", "/app/applications", { variant: "ghost", size: "sm" })
          );
          toast(`Pack created for ${created.application?.title ?? job.title}.`);
        } catch (error) {
          queueButton.disabled = creditsInfo().exhausted;
          queueButton.textContent = tailorLabel();
          if (error?.status === 402) queueSlot.replaceChildren(quotaPrompt(error));
          else toastError(error);
        }
      },
    });
    registerCreditButton?.(queueButton, "Tailor and queue");
    queueSlot.append(queueButton);
  } else {
    queueSlot.append(linkButton("Add a CV first", "/app/cv", { variant: "ghost", size: "sm" }));
  }

  foot.append(
    el(
      "div",
      { class: "aw-row" },
      sourceBadge(job.source, job.attribution),
      job.postedAt ? el("span", { class: "aw-note", text: `Posted ${formatWhen(job.postedAt) ?? "recently"}` }) : null
    ),
    queueSlot
  );

  return el(
    "article",
    { class: "aw-job" },
    el("div", { class: "aw-job__head" }, title, salary ? el("span", { class: "aw-source aw-nowrap", text: salary }) : null),
    meta,
    job.tags.length
      ? el("div", { class: "aw-chipset" }, job.tags.slice(0, 6).map((tag) => el("span", { class: "chip", text: String(tag) })))
      : null,
    foot
  );
}

async function renderJobsScreen(mount, { signal }) {
  const params = new URLSearchParams(location.search);
  const [, cvResponse] = await Promise.all([loadMe(signal), api("/api/cvs", { signal })]);
  if (signal.aborted) throw abortError();
  const cvs = cvResponse.cvs ?? [];
  const primary = cvs.find((cv) => cv.primary) ?? cvs[0] ?? null;

  // Every tailor button on this screen states the same credit count, so one
  // successful run updates them all.
  const creditButtons = [];
  function syncCreditButtons() {
    const credits = creditsInfo();
    for (const entry of creditButtons) {
      entry.node.textContent = tailorLabel(entry.verb);
      entry.node.disabled = credits.exhausted;
    }
  }

  const filters = {
    query: params.get("q") ?? "",
    location: params.get("location") ?? "",
    remote: params.get("remote") === "1",
  };

  const queryInput = textInput({ value: filters.query, placeholder: "platform engineer", autocomplete: "off" });
  const locationInput = textInput({ value: filters.location, placeholder: "London", autocomplete: "off" });
  let remoteOnly = filters.remote;
  const remoteCheck = checkField("Remote only", filters.remote, (checked) => {
    remoteOnly = checked;
  });

  const resultsBox = el("div", { class: "aw-stack" });
  const filterStatus = statusLine();
  const filterForm = el(
    "form",
    { class: "aw-form", novalidate: true },
    el(
      "div",
      { class: "aw-form__row aw-form__row--3" },
      field("Keywords", queryInput),
      field("Location", locationInput),
      el("div", { class: "field" }, el("span", { class: "legend", text: "Options" }), remoteCheck)
    ),
    el(
      "div",
      { class: "aw-form__actions" },
      el("button", { class: "btn btn--primary", type: "submit", text: "Search the boards" }),
      button("Clear", {
        variant: "ghost",
        onClick: () => {
          queryInput.value = "";
          locationInput.value = "";
          remoteOnly = false;
          remoteCheck.querySelector("input").checked = false;
          loadFeed();
        },
      }),
      filterStatus
    )
  );

  async function loadFeed() {
    const next = new URLSearchParams();
    if (queryInput.value.trim()) next.set("q", queryInput.value.trim());
    if (locationInput.value.trim()) next.set("location", locationInput.value.trim());
    if (remoteOnly) next.set("remote", "1");
    const search = next.toString();
    history.replaceState(history.state, "", `${location.pathname}${search ? `?${search}` : ""}`);

    resultsBox.replaceChildren(loadingState("Reading the job boards…"));
    filterStatus.textContent = "";
    const request = new URLSearchParams({ limit: "40" });
    if (queryInput.value.trim()) request.set("query", queryInput.value.trim());
    if (locationInput.value.trim()) request.set("location", locationInput.value.trim());
    if (remoteOnly) request.set("remote", "1");

    try {
      const data = await api(`/api/jobs?${request.toString()}`, { signal });
      const jobs = (data.jobs ?? []).map(normaliseJob);
      const sources = Array.isArray(data.sources) ? data.sources : [];
      const daily = quotaInfo("jobResultsPerDay");
      // `remaining` is what the server has left after this batch was counted, so
      // it is the only honest number to print next to a batch already on screen.
      const remaining = typeof data.remaining === "number" ? data.remaining : null;
      let limitText;
      if (daily.unlimited) limitText = "no daily cap on this plan";
      else if (remaining === null) limitText = `${daily.limit ?? 40} results a day on this plan`;
      else if (remaining > 0) limitText = `${remaining} ${plural(remaining, "result")} left today`;
      else if (jobs.length) limitText = `this batch used the last of today's ${daily.limit ?? 40}`;
      else limitText = "today's feed allowance is used up";

      const head = el(
        "div",
        { class: "aw-row" },
        el("span", { class: "aw-section__meta" }, `${jobs.length} ${plural(jobs.length, "role")} · ${data.cached ? "from the shared cache" : "refreshed just now"} · ${limitText}`)
      );

      const exhaustedNote =
        !daily.unlimited && remaining === 0
          ? el("p", {
              class: "aw-note",
              text: jobs.length
                ? "These results stay on screen and your queue is unaffected. The feed's daily allowance resets at midnight UTC."
                : "Nothing was fetched because the daily allowance is spent. It resets at midnight UTC.",
            })
          : null;

      const sourceNotices = sources.length
        ? el(
            "div",
            { class: "aw-banner", dataset: { tone: "warn" } },
            el("strong", { text: "One source did not answer." }),
            el(
              "span",
              { text: sources.map((source) => `${sourceLabel(source.source)}: ${source.message}`).join(" ") }
            )
          )
        : null;

      const queueCapable = Boolean(primary);
      // One statement of what tailoring costs, for the whole list — not a nag on
      // every card.
      const credits = creditsInfo();
      const creditLine = !queueCapable
        ? null
        : credits.unlimited
          ? el(
              "div",
              { class: "aw-creditline" },
              el("strong", { text: "Unlimited credits" }),
              el("span", { text: "Your plan does not charge per tailored pack." })
            )
          : el(
              "div",
              { class: "aw-creditline", dataset: credits.exhausted ? { tone: "warn" } : undefined },
              el("strong", {
                text: credits.exhausted
                  ? "No credits left this month"
                  : `${credits.remaining} ${plural(credits.remaining, "credit")} left`,
              }),
              el("span", {
                text: credits.exhausted
                  ? "Scoring and the feed keep working. Tailoring resumes next month, or sooner on a bigger plan."
                  : "One tailored pack costs one credit.",
              }),
              credits.exhausted ? linkButton("See plans", "/app/billing", { variant: "ghost", size: "sm" }) : null
            );

      const list = jobs.length
        ? el(
            "div",
            { class: "aw-grid aw-grid--2" },
            jobs.map((job) =>
              jobCard(job, {
                canQueue: queueCapable,
                registerCreditButton: (node, verb) => creditButtons.push({ node, verb }),
                afterQueue: syncCreditButtons,
              })
            )
          )
        : emptyState({
            title: "No roles matched those filters",
            body: "The boards answered, but nothing matched. Widen the keywords, drop the location, or capture a posting you have already found.",
          });

      resultsBox.replaceChildren(
        ...(sourceNotices ? [sourceNotices] : []),
        head,
        ...(exhaustedNote ? [exhaustedNote] : []),
        ...(creditLine ? [creditLine] : []),
        list,
        el("p", {
          class: "aw-note",
          text: "Listings come from Arbeitnow, Remotive and Remote OK, with each posting linked back to its source. Apply on the employer's own page — nothing here submits an application for you.",
        })
      );
    } catch (error) {
      if (isAbort(error)) return;
      if (error?.status === 402) {
        resultsBox.replaceChildren(quotaPrompt(error));
        return;
      }
      resultsBox.replaceChildren(
        emptyState({
          title: "The feed could not be read",
          body: error?.message ?? "The job boards did not answer.",
          action: button("Try again", { onClick: () => loadFeed() }),
        })
      );
    }
  }

  filterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadFeed();
  });

  /* --- capture box ---------------------------------------------------- */
  const captureUrl = textInput({ placeholder: "https://boards.greenhouse.io/acme/jobs/123", autocomplete: "off" });
  const captureText = textArea({
    rows: 7,
    placeholder: "Paste the posting text from that page — title, company, location and the description.",
  });
  const captureStatus = statusLine();
  const captureResult = el("div", { class: "aw-stack" });
  const captureForm = el(
    "form",
    { class: "aw-form", novalidate: true },
    field("Posting URL", captureUrl, "Greenhouse, Lever, Workable, Ashby and Workday are recognised by name; any other page is read through its structured data. LinkedIn, Indeed and Glassdoor URLs are refused by policy — use the employer's own posting."),
    field("Posting text", captureText, "The server does not fetch the page for you, so the text has to come from your browser."),
    el(
      "div",
      { class: "aw-form__actions" },
      el("button", { class: "btn btn--primary", type: "submit", text: "Capture this posting" }),
      button("Paste from clipboard", {
        variant: "ghost",
        onClick: async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (!text.trim()) {
              say(captureStatus, "The clipboard is empty.");
              return;
            }
            captureText.value = text;
            captureText.focus();
            say(captureStatus, "Pasted from the clipboard. Capture it when you are ready.", "ok");
          } catch {
            captureText.focus();
            say(captureStatus, "The clipboard could not be read — click the box and press Ctrl+V instead.");
          }
        },
      }),
      captureStatus
    ),
    captureResult
  );

  // Bookmarklet handoff for a posting, or a plain ?capture=1 landing.
  const postingCapture = takeCapture("posting");
  if (postingCapture) {
    captureUrl.value = postingCapture.sourceUrl ?? "";
    captureText.value = postingCapture.text;
    say(captureStatus, "Posting text captured from the bookmarklet — capture it to add it to the feed.", "ok");
  } else if (new URLSearchParams(location.search).get("capture") === "1") {
    say(captureStatus, "Paste the posting text (Ctrl+V) and its URL, then capture it.", "ok");
  }
  if (postingCapture || new URLSearchParams(location.search).get("capture") === "1") {
    requestAnimationFrame(() => {
      if (signal.aborted) return;
      (postingCapture ? captureText : captureUrl).focus();
      captureText.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  captureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = captureForm.querySelector("button[type=submit]");
    const url = captureUrl.value.trim();
    const text = captureText.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      say(captureStatus, "The URL must start with http:// or https://");
      captureUrl.focus();
      return;
    }
    if (!text) {
      say(captureStatus, "Paste the posting text as well — that is what gets parsed.");
      captureText.focus();
      return;
    }
    submit.disabled = true;
    say(captureStatus, "Capturing…", "ok");
    captureResult.replaceChildren();
    try {
      const data = await api("/api/jobs/capture", { method: "POST", body: { url, text } });
      const job = normaliseJob(data.job);
      const confidence = typeof data.confidence === "number" ? Math.round(data.confidence * 100) : null;
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      say(captureStatus, "Captured.", "ok");
      captureResult.replaceChildren(
        el(
          "div",
          { class: "aw-card aw-card--flat" },
          el(
            "div",
            { class: "aw-row" },
            sourceBadge(job.source, job.attribution),
            el("span", {
              class: "aw-note",
              text: data.supported ? `Recognised board: ${sourceLabel(data.supported)}` : "Not a recognised board — read with the generic parser",
            }),
            confidence !== null ? el("span", { class: "aw-note", text: `Confidence ${confidence}%` }) : null
          ),
          el("p", { class: "aw-card__title", text: job.title }),
          el("p", { class: "aw-note", text: [job.company, job.location, salaryLabel(job)].filter(Boolean).join(" · ") || "No company or location found" }),
          warnings.length ? el("div", { class: "aw-banner", dataset: { tone: "warn" } }, el("span", { text: warnings.join(" ") })) : null,
          el(
            "div",
            { class: "aw-actions" },
            primary
              ? button(tailorLabel(), {
                  disabled: creditsInfo().exhausted,
                  onClick: async (event2) => {
                    const target = event2.currentTarget;
                    target.disabled = true;
                    target.textContent = "Tailoring…";
                    try {
                      const created = await api("/api/tailor", { method: "POST", body: { jobId: job.id } });
                      await loadMe(null, { force: true });
                      updateRail();
                      syncCreditButtons();
                      toast(`Pack created for ${created.application?.title ?? job.title}.`);
                      target.replaceWith(linkButton("Open queue", "/app/applications", { variant: "ghost" }));
                    } catch (error) {
                      target.disabled = creditsInfo().exhausted;
                      target.textContent = tailorLabel();
                      if (error?.status === 402) captureResult.prepend(quotaPrompt(error));
                      else toastError(error);
                    }
                  },
                })
              : linkButton("Add a CV first", "/app/cv", { variant: "ghost" }),
            job.url ? linkButton("Open the posting", job.url, { variant: "ghost", target: "_blank" }) : null
          )
        )
      );
      captureForm.reset();
    } catch (error) {
      if (error?.status === 402) {
        captureResult.replaceChildren(quotaPrompt(error));
      } else if (error?.code === "source_not_permitted") {
        // Refused by policy, not by a bug: say which site and why, in the server's
        // own words, and leave the form usable.
        captureResult.replaceChildren(
          el(
            "div",
            { class: "aw-banner", dataset: { tone: "warn" } },
            el("strong", { text: "That site cannot be captured." }),
            el("span", { text: error.message })
          )
        );
      } else {
        captureResult.replaceChildren(
          el("p", { class: "aw-status", dataset: { tone: "err" }, text: error?.message ?? "That posting could not be read." })
        );
      }
      say(captureStatus, error?.message ?? "Could not capture that posting.");
    } finally {
      submit.disabled = false;
    }
  });

  mount.replaceChildren(
    section({ title: "Search the feed", children: el("div", { class: "aw-card" }, filterForm) }),
    section({ title: "Results", children: resultsBox }),
    section({
      title: "Capture a posting",
      meta: "User-initiated, one at a time",
      children: el(
        "div",
        { class: "aw-stack" },
        el("div", { class: "aw-card" }, captureForm),
        el("p", {
          class: "aw-note",
          text: "Capture is how a posting you are already looking at gets into your queue. There is no background scraping and no automated submission.",
        })
      ),
    })
  );

  loadFeed();
}

/* ------------------------------------------------------------------------- *
 * 10. Applications
 * ------------------------------------------------------------------------- */

async function renderApplicationsScreen(mount, { signal }) {
  const data = await api("/api/applications", { signal });
  if (signal.aborted) throw abortError();
  const applications = data.applications ?? [];
  const statuses = Array.isArray(data.statuses) && data.statuses.length ? data.statuses : DEFAULT_STATUSES;

  if (!applications.length) {
    mount.replaceChildren(
      section({
        title: "The queue",
        children: emptyState({
          title: "No packs in the queue",
          body: "A pack is created when you tailor your CV for a job. It arrives here as “pack ready”; you approve it, apply on the employer's page, then record the status as it moves.",
          action: el(
            "div",
            { class: "aw-actions" },
            linkButton("Browse the feed", "/app/jobs", { variant: "primary" }),
            linkButton("Score a CV first", "/app/cv")
          ),
        }),
      })
    );
    return;
  }

  let activeStatus = "all";

  const countsRow = el("div", { class: "aw-row" });
  const tableHost = el("div");

  function countFor(status) {
    return applications.filter((application) => application.status === status).length;
  }

  function renderCounts() {
    countsRow.replaceChildren();
    const chips = [{ value: "all", label: `All (${applications.length})`, count: applications.length }].concat(
      statuses.map((status) => ({
        value: status,
        label: `${statusLabel(status)} (${countFor(status)})`,
        count: countFor(status),
      }))
    );
    for (const chip of chips) {
      const isActive = activeStatus === chip.value;
      // An empty status is dimmed and inert until it has something in it.
      const empty = chip.value !== "all" && chip.count === 0;
      const node = el("button", {
        class: `chip${isActive ? " aw-chip--match" : ""}${empty ? " aw-chip--empty" : ""}`,
        type: "button",
        "aria-pressed": isActive ? "true" : "false",
        disabled: empty,
        text: chip.label,
      });
      node.addEventListener("click", () => {
        activeStatus = chip.value;
        renderCounts();
        renderTable();
      });
      countsRow.append(node);
    }
  }

  function visibleApplications() {
    return activeStatus === "all"
      ? applications
      : applications.filter((application) => application.status === activeStatus);
  }

  function notesRow(application) {
    const note = textArea({ rows: 3, value: application.notes ?? "", placeholder: "What you sent, who you spoke to, what happens next." });
    const line = statusLine();

    /* --- the stored pack: covering letter or the plan lock ------------- */
    const packBox = el("div", { class: "aw-stack" });
    let packLoaded = false;
    async function revealPack(force = false) {
      if (packLoaded && !force) return;
      packBox.replaceChildren(loadingState("Reading the stored pack…"));
      try {
        const full = await loadApplication(application.id, signal);
        const pack = full?.pack ?? null;
        const blocks = [coveringLetterBlock(pack), screeningBlock(pack)].filter(Boolean);
        packBox.replaceChildren(
          ...(blocks.length
            ? blocks
            : [el("p", { class: "aw-note", text: "This pack has no covering letter or screening answers stored." })])
        );
        packLoaded = true;
      } catch (error) {
        if (isAbort(error)) return;
        packBox.replaceChildren(
          el("p", { class: "aw-status", dataset: { tone: "err" }, text: error?.message ?? "The stored pack could not be read." })
        );
      }
    }

    /* --- refine the pack with one instruction ------------------------- */
    const instruction = textInput({
      placeholder: "shorter summary, less formal, lead with the payments work",
      autocomplete: "off",
    });
    const refineStatus = statusLine();
    const refineResult = el("div", { class: "aw-stack" });

    const refineForm = el(
      "div",
      { class: "aw-form" },
      field(
        "Refine this pack",
        instruction,
        "One instruction at a time. The pack is rewritten in place and every change is listed with its reason."
      ),
      el(
        "div",
        { class: "aw-form__actions" },
        button("Refine pack", {
          onClick: async (event) => {
            const target = event.currentTarget;
            const text = instruction.value.trim();
            if (!text) {
              say(refineStatus, "Write the instruction first — what should change?");
              instruction.focus();
              return;
            }
            target.disabled = true;
            target.textContent = "Refining…";
            say(refineStatus, "Working…", "ok");
            refineResult.replaceChildren();
            try {
              const data = await api(`/api/applications/${encodeURIComponent(application.id)}/refine`, {
                method: "POST",
                body: { instruction: text },
              });
              const changes = Array.isArray(data.changes) ? data.changes : [];
              const warnings = Array.isArray(data.warnings) ? data.warnings : [];
              const mode = data.mode === "model" ? "Model rewrite" : "Rules-based rewrite";
              const refined = data.refined ?? {};
              application.updatedAt = data.application?.updatedAt ?? application.updatedAt;
              say(refineStatus, `${changes.length} ${plural(changes.length, "change")} made.`, "ok");

              refineResult.replaceChildren(
                el(
                  "div",
                  { class: "aw-row" },
                  el("span", { class: "aw-badge", text: mode }),
                  el("span", {
                    class: "aw-note",
                    text:
                      data.mode === "model"
                        ? "A language model rewrote this pack; the grounding check still applies."
                        : "No model was configured, so the deterministic rewriter ran instead.",
                  })
                ),
                changes.length
                  ? el(
                      "div",
                      { class: "aw-diff" },
                      changes.map((change) =>
                        el(
                          "div",
                          { class: "aw-diff__item" },
                          el("p", { class: "aw-diff__field", text: String(change.field ?? "change") }),
                          el(
                            "div",
                            { class: "aw-diff__pair" },
                            el(
                              "div",
                              null,
                              el("p", { class: "aw-diff__tag", text: "Before" }),
                              el("p", { class: "aw-prose", text: change.before ?? "—" })
                            ),
                            el(
                              "div",
                              { class: "aw-diff__after" },
                              el("p", { class: "aw-diff__tag", text: "After" }),
                              el("p", { class: "aw-prose", text: change.after ?? "—" })
                            )
                          ),
                          change.reason ? el("p", { class: "aw-diff__reason", text: `Why: ${change.reason}` }) : null
                        )
                      )
                    )
                  : el("p", { class: "aw-note", text: "Nothing needed rewriting for that instruction." }),
                refined.summary
                  ? el(
                      "div",
                      { class: "aw-card aw-card--flat" },
                      el("p", { class: "aw-kicker", text: "Rewritten summary" }),
                      el("p", { class: "aw-prose", text: String(refined.summary) })
                    )
                  : null,
                refined.coverLetter && plainText(refined.coverLetter)
                  ? el(
                      "div",
                      { class: "aw-card aw-card--flat" },
                      el("p", { class: "aw-kicker", text: "Rewritten covering letter" }),
                      el("p", { class: "aw-prose", text: plainText(refined.coverLetter) })
                    )
                  : null,
                warnings.length
                  ? el("div", { class: "aw-banner", dataset: { tone: "warn" } }, el("span", { text: warnings.join(" ") }))
                  : null,
                el(
                  "div",
                  { class: "aw-actions" },
                  linkButton("Open the refined CV pack", `/api/applications/${encodeURIComponent(application.id)}/cv`, {
                    variant: "ghost",
                    target: "_blank",
                  })
                )
              );
              // The stored pack was rebuilt, so the cover letter block is stale.
              await revealPack(true);
            } catch (error) {
              if (error?.status === 402) refineResult.replaceChildren(quotaPrompt(error));
              else refineResult.replaceChildren(el("p", { class: "aw-status", dataset: { tone: "err" }, text: error?.message ?? "That refinement failed." }));
              say(refineStatus, error?.message ?? "That refinement failed.");
            } finally {
              target.disabled = false;
              target.textContent = "Refine pack";
            }
          },
        }),
        refineStatus
      ),
      refineResult
    );

    // The printable pack is the deliverable, so it gets a named action at the
    // top of the panel rather than hiding behind a ghost pill.
    const packActions = application.hasPack
      ? el(
          "div",
          { class: "aw-actions" },
          el("a", {
            class: "btn btn--outline btn--sm",
            href: `/api/applications/${encodeURIComponent(application.id)}/cv`,
            target: "_blank",
            rel: "noopener noreferrer",
            text: "Print CV",
          }),
          el("span", {
            class: "aw-note",
            text: "Opens the print-ready CV in its own tab — print it or save it as PDF from there. The covering letter is part of the same document.",
          })
        )
      : null;

    const row = el(
      "tr",
      { class: "aw-row-notes", hidden: true },
      el(
        "td",
        { colspan: "6" },
        el(
          "div",
          { class: "aw-form" },
          packActions,
          packBox,
          el("hr", { class: "aw-divider" }),
          refineForm,
          el("hr", { class: "aw-divider" }),
          field(`Notes for ${application.title}`, note),
          el(
            "div",
            { class: "aw-form__actions" },
            button("Save notes", {
              size: "sm",
              onClick: async () => {
                try {
                  const updated = await api(`/api/applications/${encodeURIComponent(application.id)}`, {
                    method: "PATCH",
                    body: { notes: note.value },
                  });
                  application.notes = updated.application?.notes ?? note.value;
                  say(line, "Saved.", "ok");
                  toast("Notes saved.");
                } catch (error) {
                  say(line, error.message);
                }
              },
            }),
            line
          )
        )
      )
    );
    return { row, revealPack };
  }

  function renderTable() {
    const rows = visibleApplications();
    if (!rows.length) {
      tableHost.replaceChildren(
        emptyState({
          title: `Nothing in “${statusLabel(activeStatus)}”`,
          body: "Pick another status, or show everything.",
          action: button("Show all", {
            variant: "ghost",
            onClick: () => {
              activeStatus = "all";
              renderCounts();
              renderTable();
            },
          }),
        })
      );
      return;
    }

    const tbody = el("tbody");
    for (const application of rows) {
      const detail = notesRow(application);
      const select = selectControl({
        options: statuses.map((status) => ({ value: status, label: statusLabel(status) })),
        value: application.status,
        ariaLabel: `Status for ${application.title}`,
        onchange: async (event) => {
          const next = event.currentTarget.value;
          const previous = application.status;
          event.currentTarget.disabled = true;
          try {
            const updated = await api(`/api/applications/${encodeURIComponent(application.id)}`, {
              method: "PATCH",
              body: { status: next },
            });
            application.status = updated.application?.status ?? next;
            application.updatedAt = updated.application?.updatedAt ?? application.updatedAt;
            renderCounts();
            renderTable();
            toast(`${application.title} moved to ${statusLabel(application.status)}.`);
          } catch (error) {
            event.currentTarget.value = previous;
            event.currentTarget.disabled = false;
            toastError(error);
          }
        },
      });

      const statusField = el(
        "span",
        { class: "aw-status-field", dataset: { status: application.status } },
        el("span", { class: "aw-status-dot", "aria-hidden": "true" }),
        select
      );

      // "Open pack" is the deliverable action: it reveals the printable CV, the
      // covering letter, the grounding diff and the notes in one place.
      const closedLabel = application.hasPack ? "Open pack" : "Notes";
      const openLabel = application.hasPack ? "Close pack" : "Hide notes";
      const packToggle = button(closedLabel, { variant: application.hasPack ? "outline" : "ghost", size: "sm" });
      packToggle.setAttribute("aria-expanded", "false");
      packToggle.addEventListener("click", () => {
        const showing = detail.row.hidden;
        detail.row.hidden = !showing;
        packToggle.setAttribute("aria-expanded", showing ? "true" : "false");
        packToggle.textContent = showing ? openLabel : closedLabel;
        if (showing) {
          detail.revealPack();
          detail.row.querySelector("textarea")?.focus();
        }
      });

      tbody.append(
        el(
          "tr",
          null,
          el("td", { "data-label": "Role" }, el("span", { class: "aw-cell-title", text: application.title })),
          el("td", { "data-label": "Company", text: application.company ?? "Not stated" }),
          el("td", { class: "aw-cell-num", "data-label": "Score", text: application.score === null || application.score === undefined ? "—" : String(application.score) }),
          el("td", { "data-label": "Status" }, statusField),
          el("td", { class: "aw-cell-num", "data-label": "Updated", text: formatWhen(application.updatedAt) ?? "—" }),
          el(
            "td",
            { class: "aw-cell-actions", "data-label": "Actions" },
            el(
              "div",
              { class: "aw-actions aw-actions--end" },
              packToggle,
              application.url
                ? el("a", {
                    class: "btn btn--ghost btn--sm",
                    href: application.url,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    text: "Posting",
                  })
                : null
            )
          )
        ),
        detail.row
      );
    }

    tableHost.replaceChildren(
      el(
        "div",
        { class: "aw-table-wrap" },
        el(
          "table",
          { class: "aw-table" },
          el("caption", {
            text: "Change a status here when you have actually done it. A pack leaves this queue only when you submit it on the employer's site.",
          }),
          el(
            "thead",
            null,
            el(
              "tr",
              null,
              el("th", { scope: "col", text: "Role" }),
              el("th", { scope: "col", text: "Company" }),
              el("th", { scope: "col", text: "Score" }),
              el("th", { scope: "col", text: "Status" }),
              el("th", { scope: "col", text: "Updated" }),
              el("th", { scope: "col", text: "Actions" })
            )
          ),
          tbody
        )
      )
    );
  }

  renderCounts();
  renderTable();

  mount.replaceChildren(
    section({
      title: "The queue",
      meta: `${applications.length} ${plural(applications.length, "pack")}`,
      children: el("div", { class: "aw-stack" }, countsRow, tableHost),
    }),
    el("p", {
      class: "aw-note",
      text: "Statuses run pack ready → approved → submitted → interview → offer, with rejected and withdrawn available at any point. Nothing here sends an application: it records what you did on the employer's own page.",
    })
  );
}

/* ------------------------------------------------------------------------- *
 * 11. Alerts
 * ------------------------------------------------------------------------- */

async function renderAlertsScreen(mount, { signal }) {
  const [, alertResponse, notificationResponse] = await Promise.all([
    loadMe(signal),
    api("/api/alerts", { signal }),
    api("/api/notifications", { signal }),
  ]);
  if (signal.aborted) throw abortError();

  const alerts = alertResponse.alerts ?? [];
  const notifications = notificationResponse.notifications ?? [];
  const feedToken = notificationResponse.feedToken ?? null;
  const quota = quotaInfo("alerts");

  const runStatus = el("div", { class: "aw-stack" });

  function alertCard(alert) {
    const active = Boolean(alert.active);
    const keywords = String(alert.keywords ?? "");
    const locations = String(alert.locations ?? "");
    const lastRun = formatWhen(alert.last_run_at);

    return el(
      "article",
      { class: "aw-card" },
      el(
        "div",
        { class: "aw-card__head" },
        el("h3", { class: "aw-card__title", text: alert.name }),
        el("span", { class: "aw-pip", dataset: { status: active ? "active" : "paused" }, text: active ? "Active" : "Paused" })
      ),
      el("p", { class: "aw-note", text: keywords ? `Keywords: ${keywords}` : "No keywords set" }),
      el("p", {
        class: "aw-note",
        text: [
          locations ? `Locations: ${locations}` : "Any location",
          alert.remote_only ? "Remote only" : "On-site or remote",
          alert.min_salary ? `At least ${alert.min_salary}` : "Any salary",
          `${String(alert.cadence ?? "daily")} check`,
        ].join(" · "),
      }),
      el("p", { class: "aw-note", text: lastRun ? `Last run ${lastRun}.` : "Has not run yet." }),
      el(
        "div",
        { class: "aw-actions aw-mt-2" },
        button(active ? "Pause" : "Resume", {
          variant: "ghost",
          size: "sm",
          onClick: async (event) => {
            const target = event.currentTarget;
            target.disabled = true;
            try {
              await api(`/api/alerts/${encodeURIComponent(alert.id)}`, { method: "PATCH", body: { active: !active } });
              toast(active ? `${alert.name} paused.` : `${alert.name} resumed.`);
              await renderRoute({ focus: false });
            } catch (error) {
              target.disabled = false;
              toastError(error);
            }
          },
        }),
        confirmButton({
          label: "Delete",
          confirmLabel: "Confirm delete",
          variant: "ghost",
          size: "sm",
          onConfirm: async () => {
            try {
              await api(`/api/alerts/${encodeURIComponent(alert.id)}`, { method: "DELETE" });
              toast(`${alert.name} deleted.`);
              await renderRoute({ focus: false });
            } catch (error) {
              toastError(error);
            }
          },
        })
      )
    );
  }

  /* --- create --------------------------------------------------------- */
  const nameInput = textInput({ placeholder: "Backend roles, UK remote" });
  const keywordsInput = textInput({ placeholder: "node, typescript, postgres" });
  const locationsInput = textInput({ placeholder: "London, Manchester" });
  const minSalaryInput = el("input", { class: "input", type: "number", min: "0", step: "1000", placeholder: "45000" });
  let remoteOnly = false;
  let cadence = "daily";
  const createStatus = statusLine();
  const createErrors = el("div", { class: "aw-stack" });

  const createForm = el(
    "form",
    { class: "aw-form", novalidate: true },
    el(
      "div",
      { class: "aw-form__row aw-form__row--2" },
      field("Name", nameInput),
      field("Keywords", keywordsInput, "Comma separated; a posting matches when it carries these terms.")
    ),
    el(
      "div",
      { class: "aw-form__row aw-form__row--2" },
      field("Locations (optional)", locationsInput, "Comma separated. Leave blank for anywhere."),
      field(
        "Minimum salary (optional)",
        minSalaryInput,
        "Only matches when the posting states a number at or above it — an unstated salary does not match."
      )
    ),
    el(
      "div",
      { class: "aw-form__row aw-form__row--2" },
      el("div", { class: "field" }, el("span", { class: "legend", text: "Options" }), checkField("Remote only", false, (checked) => { remoteOnly = checked; })),
      field(
        "Cadence",
        selectControl({
          options: [
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
            { value: "manual", label: "Only when I run it" },
          ],
          value: cadence,
          onchange: (event) => {
            cadence = event.currentTarget.value;
          },
        })
      )
    ),
    el(
      "div",
      { class: "aw-form__actions" },
      el("button", { class: "btn btn--primary", type: "submit", text: "Create alert" }),
      createStatus
    ),
    createErrors
  );

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = createForm.querySelector("button[type=submit]");
    const name = nameInput.value.trim();
    const keywords = keywordsInput.value.trim();
    if (!name) {
      say(createStatus, "Give the alert a name so you can tell it apart later.");
      nameInput.focus();
      return;
    }
    if (!keywords) {
      say(createStatus, "At least one keyword is needed — that is what the alert matches on.");
      keywordsInput.focus();
      return;
    }
    submit.disabled = true;
    say(createStatus, "Creating…", "ok");
    createErrors.replaceChildren();
    try {
      await api("/api/alerts", {
        method: "POST",
        body: {
          name,
          keywords,
          locations: locationsInput.value.trim() || undefined,
          remoteOnly,
          minSalary: minSalaryInput.value ? Number(minSalaryInput.value) : undefined,
          cadence,
        },
      });
      toast(`${name} created.`);
      await renderRoute({ focus: false });
    } catch (error) {
      if (error?.status === 402) createErrors.replaceChildren(quotaPrompt(error));
      else createErrors.replaceChildren(el("p", { class: "aw-status", dataset: { tone: "err" }, text: error.message }));
      say(createStatus, error.message);
    } finally {
      submit.disabled = false;
    }
  });

  /* --- run now -------------------------------------------------------- */
  const runButton = button("Run all alerts now", {
    onClick: async () => {
      runButton.disabled = true;
      runButton.textContent = "Running…";
      runStatus.replaceChildren(loadingState("Checking the boards against every active alert…"));
      try {
        const result = await api("/api/alerts/run", { method: "POST" });
        const failed = Array.isArray(result.sources) ? result.sources : [];
        runStatus.replaceChildren(
          el(
            "div",
            { class: "aw-banner" },
            el("strong", { text: `${result.created ?? 0} new ${plural(result.created ?? 0, "hit")}.` }),
            el("span", {
              text: `${result.alerts ?? 0} ${plural(result.alerts ?? 0, "alert")} checked ${result.checked ?? 0} ${plural(result.checked ?? 0, "posting")}: ${result.matched ?? 0} matched.`,
            }),
            failed.length
              ? el("span", {
                  text: `Sources that failed: ${failed.map((source) => `${sourceLabel(source.source)} (${source.message})`).join("; ")}`,
                })
              : null
          )
        );
        runButton.disabled = false;
        runButton.textContent = "Run all alerts now";
      } catch (error) {
        runStatus.replaceChildren(el("p", { class: "aw-status", dataset: { tone: "err" }, text: error.message }));
        runButton.disabled = false;
        runButton.textContent = "Run all alerts now";
      }
    },
  });

  /* --- RSS feed ------------------------------------------------------- */
  const feedUrl = feedToken ? `${location.origin}/feed/${feedToken}.rss` : null;
  const feedBlock = feedUrl
    ? el(
        "div",
        { class: "aw-stack" },
        el(
          "div",
          { class: "aw-copy-row" },
          el("input", { class: "input", type: "text", readonly: true, value: feedUrl, "aria-label": "RSS feed URL" }),
          button("Copy", {
            variant: "ghost",
            onClick: async (event) => {
              const target = event.currentTarget;
              try {
                await navigator.clipboard.writeText(feedUrl);
                target.textContent = "Copied";
                setTimeout(() => {
                  target.textContent = "Copy";
                }, 2000);
              } catch {
                const input = target.previousElementSibling;
                input?.focus();
                input?.select();
                toast("Select the URL and copy it — the clipboard is not available here.", "err");
              }
            },
          }),
          el("a", { class: "btn btn--ghost", href: feedUrl, target: "_blank", rel: "noopener noreferrer", text: "Open feed" })
        ),
        el("p", {
          class: "aw-note",
          text: "The token in that URL is the only thing protecting the feed, so treat it like a password. It returns the last 50 hits, unread or not.",
        })
      )
    : emptyState({
        title: "No feed token yet",
        body: "The token is created the first time this account reads its notifications, so reload if this stays empty.",
      });

  const hitsBlock = notifications.length
    ? el(
        "div",
        { class: "aw-list" },
        notifications.slice(0, 10).map((notification) =>
          el(
            "div",
            { class: "aw-list__item" },
            el("p", { class: "aw-list__title", text: notification.title }),
            el("p", { class: "aw-list__meta" }, `${notification.body ?? "New match"} · ${formatWhen(notification.created_at) ?? "recently"}`),
            notification.read_at
              ? el("p", { class: "aw-note", text: "Read" })
              : el(
                  "div",
                  { class: "aw-actions aw-mt-2" },
                  button("Mark as read", {
                    variant: "ghost",
                    onClick: async (event) => {
                      const target = event.currentTarget;
                      target.disabled = true;
                      try {
                        await api(`/api/notifications/${encodeURIComponent(notification.id)}/read`, { method: "POST" });
                        await renderRoute({ focus: false });
                      } catch (error) {
                        target.disabled = false;
                        toastError(error);
                      }
                    },
                  })
                )
          )
        )
      )
    : emptyState({
        title: "No hits yet",
        body: "Hits appear when a saved search matches a posting on one of the boards. Run the alerts once to fill the list.",
      });

  mount.replaceChildren(
    section({
      title: "Saved searches",
      meta: quota.unlimited ? "Unlimited on your plan" : `${quota.used} of ${quota.limit} used`,
      actions: el(
        "div",
        { class: "aw-actions" },
        alerts.length ? runButton : null
      ),
      children: el(
        "div",
        { class: "aw-stack" },
        alerts.length
          ? el("div", { class: "aw-grid aw-grid--2" }, alerts.map((alert) => alertCard(alert)))
          : emptyState({
              title: "No saved searches",
              body: "A saved search watches the same three boards on a cadence and drops matches into an inbox and an RSS feed. It is the part of the search that keeps running when you stop.",
              action: linkButton("Create one below", "#alert-create", { variant: "primary" }),
            }),
        runStatus
      ),
    }),
    section({ title: "Create an alert", children: el("div", { class: "aw-card", id: "alert-create" }, createForm) }),
    section({ title: "RSS feed", meta: "Same hits, in a reader", children: el("div", { class: "aw-card" }, feedBlock) }),
    section({ title: "Recent hits", children: hitsBlock })
  );
}

/* ------------------------------------------------------------------------- *
 * 12. Billing
 * ------------------------------------------------------------------------- */

function planFeatureLines(plan) {
  const quotas = plan?.quotas ?? {};
  const lines = [];
  lines.push(quotas.cvs === null || quotas.cvs === undefined ? "Unlimited CVs" : `${quotas.cvs} ${plural(quotas.cvs, "CV")}`);
  lines.push(
    quotas.packs === null || quotas.packs === undefined
      ? "Unlimited tailored packs"
      : `${quotas.packs} tailored ${plural(quotas.packs, "pack")} a month`
  );
  lines.push(quotas.alerts === null || quotas.alerts === undefined ? "Unlimited alerts" : `${quotas.alerts} ${plural(quotas.alerts, "alert")}`);
  lines.push(
    quotas.jobResultsPerDay === null || quotas.jobResultsPerDay === undefined
      ? "Job feed without a daily cap"
      : `Job feed: ${quotas.jobResultsPerDay} results a day`
  );
  for (const flag of plan?.flags ?? []) {
    if (FLAG_LABELS[flag]) lines.push(FLAG_LABELS[flag]);
  }
  return lines;
}

async function renderBillingScreen(mount, { signal }) {
  const [data] = await Promise.all([api("/api/billing/plans", { signal }), loadMe(signal)]);
  if (signal.aborted) throw abortError();

  state.plansLoaded = true;
  for (const plan of data.plans ?? []) {
    if (plan?.key && plan?.name) state.planNames[plan.key] = plan.name;
  }
  updateRail();

  const plans = data.plans ?? [];
  const current = data.current ?? state.me?.plan ?? "free";
  const stripeReady = Boolean(data.stripeConfigured);
  let interval = new URLSearchParams(location.search).get("interval") === "year" ? "year" : "month";

  const checkoutStatus = el("div", { class: "aw-stack" });
  const planGrid = el("div", { class: "aw-grid aw-grid--3" });

  function priceFor(plan) {
    const pence = plan?.prices?.[interval] ?? plan?.price?.[interval];
    if (typeof pence !== "number") return { label: "—", note: null };
    if (pence === 0) return { label: "Free", note: "No card needed" };
    const label = money(pence) ?? "—";
    const per = interval === "year" ? "a year" : "a month";
    const monthly = plan?.prices?.month ?? plan?.price?.month ?? null;
    const yearly = plan?.prices?.year ?? plan?.price?.year ?? null;
    let note = `${label} ${per}, excluding VAT`;
    if (interval === "year" && typeof monthly === "number" && typeof yearly === "number") {
      const saving = monthly * 12 - yearly;
      if (saving > 0) note = `${label} a year, excluding VAT · ${money(saving)} less than twelve monthly payments`;
    }
    return { label, note };
  }

  function renderPlans() {
    planGrid.replaceChildren();
    for (const plan of plans) {
      const isCurrent = plan.key === current;
      const price = priceFor(plan);
      const isFeatured = plan.key === "pro";
      const actions = el("div", { class: "aw-actions" });

      if (isCurrent) {
        actions.append(el("span", { class: "aw-save-note", text: "Your current plan" }));
      } else if (plan.key === "free") {
        actions.append(el("span", { class: "aw-note", text: "Downgrades take effect at the end of the billing period." }));
      } else {
        const choose = button(isFeatured ? `Choose ${plan.name}` : `Choose ${plan.name}`, {
          variant: isFeatured ? "primary" : "ghost",
          disabled: !stripeReady,
          onClick: async () => {
            choose.disabled = true;
            choose.textContent = "Opening Stripe…";
            checkoutStatus.replaceChildren();
            try {
              const result = await api("/api/billing/checkout", { method: "POST", body: { plan: plan.key, interval } });
              if (result?.url) {
                location.assign(result.url);
                return;
              }
              throw new Error("Stripe did not return a checkout URL.");
            } catch (error) {
              choose.disabled = false;
              choose.textContent = `Choose ${plan.name}`;
              checkoutStatus.replaceChildren(
                el(
                  "div",
                  { class: "aw-banner", dataset: { tone: "err" } },
                  el("strong", { text: "Checkout could not start." }),
                  el("span", { text: error?.message ?? "That request failed." })
                )
              );
            }
          },
        });
        actions.append(choose);
      }

      planGrid.append(
        el(
          "section",
          { class: "aw-plan", dataset: { current: String(isCurrent) } },
          isCurrent ? el("span", { class: "aw-plan__flag", text: "Current" }) : null,
          el("p", { class: "aw-kicker", text: plan.key }),
          el("h2", { class: "aw-plan__name", text: plan.name }),
          el(
            "p",
            { class: "aw-plan__price" },
            price.label,
            interval === "month" && plan.key !== "free" ? el("small", { text: "/month" }) : null,
            interval === "year" && plan.key !== "free" ? el("small", { text: "/year" }) : null
          ),
          price.note ? el("p", { class: "aw-note", text: price.note }) : null,
          plan.summary ? el("p", { class: "aw-body-text", text: plan.summary }) : null,
          el("ul", { class: "aw-plan__list" }, planFeatureLines(plan).map((line) => el("li", { text: line }))),
          actions
        )
      );
    }
  }

  const intervalControl = el(
    "div",
    { class: "aw-segmented", role: "group", "aria-label": "Billing interval" },
    ...["month", "year"].map((value) => {
      const radio = el("input", { type: "radio", name: "interval", value, checked: interval === value });
      radio.addEventListener("change", () => {
        interval = value;
        renderPlans();
      });
      return el("label", null, radio, el("span", { text: value === "month" ? "Monthly" : "Annual" }));
    })
  );

  const statusParam = new URLSearchParams(location.search).get("status");
  const statusBanner =
    statusParam === "success"
      ? el(
          "div",
          { class: "aw-banner", dataset: { tone: "ok" } },
          el("strong", { text: "Stripe sent you back after checkout." }),
          el("span", { text: "The plan changes when the payment webhook arrives, which is usually within a minute. Reload if it still shows the old plan." })
        )
      : statusParam === "cancelled"
        ? el(
            "div",
            { class: "aw-banner" },
            el("strong", { text: "Checkout was cancelled." }),
            el("span", { text: "Nothing was charged and your plan is unchanged." })
          )
        : null;

  const notConfigured = stripeReady
    ? null
    : el(
        "div",
        { class: "aw-banner", dataset: { tone: "warn" } },
        el("strong", { text: "Billing is not configured on this server." }),
        el("span", {
          text: "Checkout returns 501 until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set. The plans and quotas below are the ones the entitlement code enforces; nothing here can take a payment yet.",
        })
      );

  renderPlans();

  /* --- the Stripe billing portal: cancel and payment details ---------- */
  const portalStatus = el("div", { class: "aw-stack" });
  const portalButton = button("Open the billing portal", {
    variant: "ghost",
    onClick: async () => {
      portalButton.disabled = true;
      portalButton.textContent = "Opening…";
      portalStatus.replaceChildren(loadingState("Asking Stripe for a portal session…"));
      try {
        const result = await api("/api/billing/portal", { method: "POST" });
        if (result?.url) {
          location.assign(result.url);
          return;
        }
        throw new Error("Stripe did not return a portal URL.");
      } catch (error) {
        portalStatus.replaceChildren(
          el(
            "div",
            { class: "aw-banner", dataset: { tone: error?.status === 501 ? "warn" : "err" } },
            el("strong", {
              text:
                error?.status === 501
                  ? "The billing portal is not available on this server."
                  : "The billing portal could not be opened.",
            }),
            el("span", { text: error?.message ?? "That request failed." })
          )
        );
        portalButton.disabled = false;
        portalButton.textContent = "Open the billing portal";
      }
    },
  });

  const portalCard = card({
    kicker: "Subscription",
    title: "Cancel, or change how you pay",
    meta: "Cancelling and card details live in Stripe's own portal.",
    children: el(
      "div",
      { class: "aw-stack" },
      el("p", {
        class: "aw-body-text",
        text: "We never see or store a card: the portal session is created by the server and handed to Stripe. If this account has never subscribed, or this server has no Stripe credentials, the button says so with the server's own reason rather than failing silently.",
      }),
      el("div", { class: "aw-actions" }, portalButton),
      portalStatus
    ),
  });

  mount.replaceChildren(
    ...(statusBanner ? [statusBanner] : []),
    ...(notConfigured ? [notConfigured] : []),
    section({
      title: "Plans",
      meta: "Cancel anytime; downgrading keeps existing packs readable",
      actions: intervalControl,
      children: el("div", { class: "aw-stack" }, planGrid, checkoutStatus),
    }),
    section({ title: "Your subscription", children: portalCard }),
    el("p", {
      class: "aw-note",
      text: "Prices exclude VAT. Annual billing is ten months for twelve. Your current plan is read from the same entitlement code that enforces the quotas, so what you see here is what the API applies.",
    })
  );
}

/* ------------------------------------------------------------------------- *
 * 13. Settings
 * ------------------------------------------------------------------------- */

/**
 * The bookmarklet install block, cloned once from the inert `<template>` in
 * app.html. That template ships a paste box and two buttons that act on it; the
 * CV drawer owns paste → parse → create, so this clone drops the box and those
 * buttons and keeps the part only it can do: the bookmark's address and a copy
 * button. The literal token __ORIGIN__ becomes this page's origin, so the
 * install needs no setup.
 */
async function bookmarkletInstallBlock() {
  const template = byId("tpl-linkedin-capture");
  if (!(template instanceof HTMLTemplateElement)) return null;

  const fragment = template.content.cloneNode(true);
  const block = fragment.querySelector("[data-linkedin-capture]");
  if (!block) return null;

  for (const selector of [
    "[data-linkedin-capture-text]",
    'label[for="linkedin-capture-text"]',
    "[data-linkedin-capture-clipboard]",
    "[data-linkedin-capture-parse]",
  ]) {
    block.querySelectorAll(selector).forEach((node) => node.remove());
  }

  // The last instruction pointed at the box this clone removed.
  const steps = block.querySelectorAll("ol.prose li");
  const lastStep = steps[steps.length - 1];
  if (lastStep) {
    lastStep.textContent = "Open the CV library, paste the text there, and choose “Read this profile”.";
  }

  // So did the closing note: it says "nothing is sent until you choose Read my
  // profile", which this block no longer offers.
  const note = block.querySelector(".note");
  if (note) {
    note.textContent =
      "The bookmarklet copies the profile text inside your own browser. Paste it in the CV library and choose “Read this profile”: the text then goes to POST /api/connectors/linkedin with your session and nowhere else, and you can edit or delete the CV afterwards.";
  }

  const source = block.querySelector("[data-bookmarklet-source]");
  const copyButton = block.querySelector("[data-bookmarklet-copy]");
  if (!source || !copyButton) return block;

  try {
    const response = await fetch("/assets/bookmarklet.js", { cache: "no-store", credentials: "same-origin" });
    if (response.ok) {
      const text = (await response.text()).trim();
      // Exactly one __ORIGIN__, in the bookmarklet's CONFIG.origin.
      let address = text.replace("__ORIGIN__", location.origin);
      // Defensive, not a decoration: a usable address must begin with the
      // scheme. Today's artifact starts with its provenance comment and carries
      // `javascript:` at index 186, so this branch is what makes it installable;
      // if the build ever moves the scheme to index 0, this becomes a no-op.
      if (!address.startsWith("javascript:")) address = `javascript:${address}`;
      source.value = address;
    }
  } catch {
    /* the copy button explains itself once the address is missing */
  }

  onDispose(() => {
    /* the clone goes with the screen; nothing else to release */
  });
  copyButton.addEventListener("click", async () => {
    if (!source.value) {
      toast("The bookmarklet text could not be read from this server.", "err");
      return;
    }
    try {
      await navigator.clipboard.writeText(source.value);
      copyButton.textContent = "Copied";
      setTimeout(() => {
        copyButton.textContent = "Copy bookmarklet";
      }, 2000);
    } catch {
      source.focus();
      source.select();
      toast("Select the address and copy it — the clipboard is not available here.", "err");
    }
  });

  return block;
}

async function renderSettingsScreen(mount, { signal }) {
  const me = await loadMe(signal, { force: true });
  if (signal.aborted) throw abortError();
  const user = me?.user ?? {};
  const plan = me?.entitlements ?? {};

  const logoutStatus = statusLine();

  const accountCard = card({
    kicker: "Account",
    title: user.email ?? "Signed in",
    meta: [user.name ?? null, `${plan.name ?? planName(user.plan) ?? "Free"} plan`].filter(Boolean).join(" · "),
    children: el(
      "div",
      { class: "aw-stack" },
      el(
        "div",
        { class: "kv" },
        el("div", null, el("span", { text: "Email" }), el("span", { text: user.email ?? "—" })),
        el("div", null, el("span", { text: "Name" }), el("span", { text: user.name ?? "Not set" })),
        el("div", null, el("span", { text: "Plan" }), el("span", { text: plan.name ?? planName(user.plan) ?? "Free" })),
        el("div", null, el("span", { text: "Planning renews" }), el("span", { text: formatDate(user.planRenewsAt) ?? "—" })),
        el("div", null, el("span", { text: "Member since" }), el("span", { text: formatDate(user.createdAt) ?? "—" }))
      ),
      el(
        "div",
        { class: "aw-actions" },
        button("Sign out", {
          variant: "ghost",
          onClick: async () => {
            try {
              await api("/api/auth/logout", { method: "POST" });
              location.assign("/sign-in");
            } catch (error) {
              say(logoutStatus, error.message);
            }
          },
        }),
        logoutStatus
      )
    ),
  });

  const exportCard = card({
    kicker: "Your data",
    title: "Export everything",
    meta: "One JSON file: CVs, scores, applications, packs, alerts, notifications and usage.",
    children: el(
      "div",
      { class: "aw-stack" },
      el("p", {
        class: "aw-body-text",
        text: "The export is generated from the database at the moment you ask for it, so it is never stale. Download it before deleting the account — deletion is immediate and cannot be undone.",
      }),
      el(
        "div",
        { class: "aw-actions" },
        el("a", { class: "btn btn--primary", href: "/api/export", download: "", text: "Download export (JSON)" })
      )
    ),
  });

  const passwordInput = el("input", {
    class: "input",
    type: "password",
    autocomplete: "current-password",
    placeholder: "Your password",
  });
  const confirmCheck = el("input", { type: "checkbox" });
  const deleteStatus = statusLine();
  const deleteButton = button("Delete my account", {
    variant: "ghost",
    onClick: async () => {
      const password = passwordInput.value;
      if (!password) {
        say(deleteStatus, "Enter your password to confirm.");
        passwordInput.focus();
        return;
      }
      if (!confirmCheck.checked) {
        say(deleteStatus, "Tick the box to confirm you understand this cannot be undone.");
        return;
      }
      if (deleteButton.dataset.armed !== "true") {
        deleteButton.dataset.armed = "true";
        deleteButton.textContent = "Click again to delete everything";
        setTimeout(() => {
          deleteButton.dataset.armed = "false";
          deleteButton.textContent = "Delete my account";
        }, 6000);
        return;
      }
      deleteButton.disabled = true;
      say(deleteStatus, "Deleting…", "ok");
      try {
        await api("/api/account", { method: "DELETE", body: { password } });
        location.assign("/");
      } catch (error) {
        deleteButton.disabled = false;
        deleteButton.dataset.armed = "false";
        deleteButton.textContent = "Delete my account";
        say(deleteStatus, error.message);
      }
    },
  });

  const dangerCard = card({
    kicker: "Delete",
    title: "Delete this account",
    meta: "Removes the account, its sessions, CVs, reports, applications, alerts, notifications and usage.",
    children: el(
      "div",
      { class: "aw-form" },
      field("Password", passwordInput, "The password you signed up with."),
      el("label", { class: "aw-check" }, confirmCheck, el("span", { text: "I understand this cannot be undone." })),
      el("div", { class: "aw-form__actions" }, deleteButton, deleteStatus)
    ),
  });

  // Distribution for the browser capture, cloned once from the inert template.
  const bookmarkletBlock = await bookmarkletInstallBlock().catch(() => null);
  if (signal.aborted) throw abortError();

  mount.replaceChildren(
    section({ title: "Account", children: el("div", { class: "aw-grid aw-grid--2" }, accountCard, exportCard) }),
    ...(bookmarkletBlock
      ? [section({ title: "Browser capture", meta: "Install once; no sign-in", children: bookmarkletBlock })]
      : []),
    section({ title: "Danger zone", children: el("div", { class: "aw-card" }, dangerCard) })
  );
}

/* ------------------------------------------------------------------------- *
 * 14. Not found
 * ------------------------------------------------------------------------- */

function notFoundState() {
  return emptyState({
    title: "That page does not exist",
    body: "The workspace has seven screens: dashboard, CV library, jobs, applications, alerts, billing and settings.",
    action: el(
      "div",
      { class: "aw-actions" },
      linkButton("Go to the dashboard", "/app", { variant: "primary" }),
      linkButton("Open the CV library", "/app/cv")
    ),
  });
}

/* ------------------------------------------------------------------------- *
 * 15. Router
 * ------------------------------------------------------------------------- */

const ROUTES = [
  {
    path: "/app",
    title: "Dashboard",
    lede: "Your CV, the score it last earned, and what is worth doing next.",
    loading: "Reading your workspace…",
    render: renderDashboard,
  },
  {
    path: "/app/cv",
    title: "CV library",
    lede: "Every CV on file, and the score it earns against a specific job description.",
    loading: "Reading your CVs…",
    render: renderCvScreen,
  },
  {
    path: "/app/jobs",
    title: "Jobs",
    lede: "A live feed from three public job boards, plus any posting you capture yourself.",
    loading: "Reading the job boards…",
    render: renderJobsScreen,
  },
  {
    path: "/app/applications",
    title: "Applications",
    lede: "Every tailored pack, where it has got to, and the notes you keep on it.",
    loading: "Reading the queue…",
    render: renderApplicationsScreen,
  },
  {
    path: "/app/alerts",
    title: "Alerts",
    lede: "Saved searches that poll the boards on a schedule, and the RSS feed that carries their hits.",
    loading: "Reading your alerts…",
    render: renderAlertsScreen,
  },
  {
    path: "/app/billing",
    title: "Billing",
    lede: "Three plans, monthly or annual, cancel anytime. Prices exclude VAT.",
    loading: "Reading the plans…",
    render: renderBillingScreen,
  },
  {
    path: "/app/settings",
    title: "Settings",
    lede: "Export everything you have, or delete the account and its data for good.",
    loading: "Reading your account…",
    render: renderSettingsScreen,
  },
];

const ROUTE_BY_PATH = new Map(ROUTES.map((route) => [route.path, route]));

function normalisePath(pathname) {
  const cleaned = String(pathname ?? "/").replace(/\/+$/, "");
  return cleaned === "" ? "/" : cleaned;
}

function applyChrome(route) {
  const title = route?.title ?? "Not found";
  const heading = byId("app-title");
  const lede = byId("app-lede");
  if (heading) heading.textContent = title;
  if (lede) lede.textContent = route?.lede ?? "That page is not part of the workspace.";
  document.title = `${title} · Applywright`;

  const path = normalisePath(location.pathname);
  for (const link of document.querySelectorAll("#app-nav a[data-nav]")) {
    const target = link.dataset.nav;
    const isCurrent = path === target || (target !== "/app" && path.startsWith(`${target}/`));
    if (isCurrent) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }

  const shell = byId("app");
  if (shell) shell.dataset.open = "false";
  const menu = byId("app-menu");
  if (menu) menu.setAttribute("aria-expanded", "false");
}

async function renderRoute({ focus = true } = {}) {
  if (renderController) renderController.abort();
  disposeAll();
  renderController = new AbortController();
  const { signal } = renderController;

  const path = normalisePath(location.pathname);
  const route = ROUTE_BY_PATH.get(path) ?? null;
  applyChrome(route);
  setBanner(null);

  // The plan and credit line belong to the shell, so it is loaded for every
  // route rather than only the screens that happen to read the account.
  loadMe().catch((error) => {
    if (!isAbort(error)) updateRail();
  });

  const mount = byId("app-view");
  if (!mount) return;

  if (!route) {
    mount.replaceChildren(notFoundState());
    return;
  }

  mount.replaceChildren(loadingState(route.loading));
  try {
    await route.render(mount, { signal, path });
  } catch (error) {
    if (isAbort(error) || signal.aborted) return;
    mount.replaceChildren(errorState(error, () => renderRoute()));
  }

  if (focus && !signal.aborted) {
    const main = byId("app-main");
    if (main) main.focus({ preventScroll: true });
  }
}

function navigate(href) {
  const url = new URL(href, location.href);
  const next = `${url.pathname}${url.search}`;
  const current = `${location.pathname}${location.search}`;
  if (next !== current) history.pushState(null, "", next);
  renderRoute();
}

/* ------------------------------------------------------------------------- *
 * 16. Boot
 * ------------------------------------------------------------------------- */

function installChrome() {
  document.documentElement.classList.remove("no-js");

  const menu = byId("app-menu");
  const shell = byId("app");
  if (menu && shell) {
    menu.addEventListener("click", () => {
      const open = shell.dataset.open !== "true";
      shell.dataset.open = open ? "true" : "false";
      menu.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) document.querySelector("#app-nav a")?.focus();
    });
  }

  const signOut = byId("app-signout");
  if (signOut) {
    signOut.addEventListener("click", async () => {
      signOut.disabled = true;
      try {
        await api("/api/auth/logout", { method: "POST" });
      } catch {
        /* an already-dead session is still a signed-out session */
      }
      location.assign("/sign-in");
    });
  }

  // Client-side routing: intercept same-origin /app links only.
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    if (!anchor) return;
    if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;
    if (!url.pathname.startsWith("/app")) return;
    event.preventDefault();
    navigate(`${url.pathname}${url.search}`);
  });

  window.addEventListener("popstate", () => renderRoute({ focus: false }));

  // Escape closes the mobile rail.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!shell || shell.dataset.open !== "true") return;
    shell.dataset.open = "false";
    menu?.setAttribute("aria-expanded", "false");
    menu?.focus();
  });
}

function boot() {
  installChrome();
  const path = normalisePath(location.pathname);
  if (!ROUTE_BY_PATH.has(path)) applyChrome(null);
  warmPlanNames();
  renderRoute({ focus: false });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}


