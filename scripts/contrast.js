/**
 * The contrast half of `scripts/check.js`: a bounded, executable gate over the
 * documented foreground/background token pairs.
 *
 * It reads the shipped CSS rather than a table of hexes, resolves the cascade as
 * a browser would for the two schemes this site ships, resolves `var()` aliases,
 * alpha-composites translucent rules on their named surface, and compares WCAG
 * sRGB relative luminance without rounding. Ratios are rounded only when a
 * diagnostic is printed. Empty custom-property overrides are preserved (and fail
 * as a required colour), functional colour syntax is validated before any
 * channel is converted, and legacy comma `rgb()` channels must share one unit
 * type, so a malformed `rgb()` cannot silently become black.
 *
 * What this is not: a rendered-CSS audit or an axe run. It covers the bounded
 * pair list in `PAIRS` — the minimum relationships the current design canon
 * requires — not the historical 66-pair measurement, and not every component,
 * state or opacity in site.css. A ratio here is a statement about a token pair
 * on a named surface, not about how a browser painted a page.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const TEXT_MIN = 4.5;
export const INDICATOR_MIN = 3;

/** The measured contract. Add a pair only when the design canon adds a role. */
export const PAIRS = [
  { foreground: "--text", background: "--paper", min: TEXT_MIN, role: "body text on the page" },
  { foreground: "--text", background: "--bone", min: TEXT_MIN, role: "body text on a recessed band" },
  { foreground: "--text", background: "--bone-2", min: TEXT_MIN, role: "body text on a well" },
  { foreground: "--text-soft", background: "--paper", min: TEXT_MIN, role: "lede and prose on the page" },
  { foreground: "--text-soft", background: "--bone", min: TEXT_MIN, role: "lede and prose on a band" },
  { foreground: "--text-soft", background: "--bone-2", min: TEXT_MIN, role: "lede and prose on a well" },
  { foreground: "--text-muted", background: "--paper", min: TEXT_MIN, role: "labels and metadata on the page" },
  { foreground: "--text-muted", background: "--bone", min: TEXT_MIN, role: "labels and metadata on a band" },
  { foreground: "--text-muted", background: "--bone-2", min: TEXT_MIN, role: "labels and metadata on a well" },
  { foreground: "--text-invert", background: "--ink", min: TEXT_MIN, role: "copy on a frozen band" },
  { foreground: "--text-invert-soft", background: "--ink", min: TEXT_MIN, role: "secondary copy on a frozen band" },
  { foreground: "--text-invert-soft", background: "--ink-3", min: TEXT_MIN, role: "secondary copy on a raised band" },
  { foreground: "--accent", background: "--paper", min: TEXT_MIN, role: "action and link on the page" },
  { foreground: "--accent", background: "--bone", min: TEXT_MIN, role: "action and link on a band" },
  { foreground: "--focus", background: "--paper", min: INDICATOR_MIN, role: "focus ring on the page" },
  { foreground: "--focus", background: "--bone", min: INDICATOR_MIN, role: "focus ring on a band" },
  { foreground: "--accent-ink", background: "--paper", min: TEXT_MIN, role: "prose link on the page" },
  { foreground: "--text", background: "--accent-soft", min: TEXT_MIN, role: "card copy on accent-soft" },
  { foreground: "--on-accent", background: "--accent", min: TEXT_MIN, role: "label on a filled action" },
  { foreground: "--ok", background: "--paper", min: TEXT_MIN, role: "success status on the page" },
  { foreground: "--ok", background: "--bone", min: TEXT_MIN, role: "success status on a band" },
  { foreground: "--warn", background: "--paper", min: TEXT_MIN, role: "warning status on the page" },
  { foreground: "--warn", background: "--bone", min: TEXT_MIN, role: "warning status on a band" },
  { foreground: "--err", background: "--paper", min: TEXT_MIN, role: "error status on the page" },
  { foreground: "--err", background: "--bone", min: TEXT_MIN, role: "error status on a band" },
  { foreground: "--mark", background: "--paper", min: TEXT_MIN, role: "ink-on-paper mark" },
  { foreground: "--line-meaning", background: "--paper", min: INDICATOR_MIN, role: "meaningful rule on the page" },
  { foreground: "--line-meaning", background: "--bone", min: INDICATOR_MIN, role: "meaningful rule on a band" },
  { foreground: "--lime", background: "--ink-2", min: INDICATOR_MIN, role: "gauge fill on ink-2" },
];

const TOKEN_FILES = ["public/assets/tokens.css", "public/assets/theme.css"];

/**
 * Pull top-level `:root` and `:root[data-theme="dark"]` declaration blocks out of
 * one stylesheet. At-rules (including `@media print`) are skipped whole: the
 * print palette is not a screen scheme and must not silently override it.
 */
export function parseTokenBlocks(css) {
  const source = String(css).replace(/\/\*[\s\S]*?\*\//g, "");
  const base = [];
  const dark = [];
  let index = 0;
  let statementStart = 0;

  while (index < source.length) {
    if (source[index] !== "{") {
      index += 1;
      continue;
    }
    const selector = source.slice(statementStart, index).trim();
    const close = matchingBrace(source, index);
    if (close === -1) throw new Error(`unclosed block after "${selector.slice(0, 80)}"`);
    const body = source.slice(index + 1, close);
    if (/^:root$/i.test(selector)) base.push(parseDeclarations(body));
    else if (/^:root\[data-theme\s*=\s*["']?dark["']?\]$/i.test(selector)) dark.push(parseDeclarations(body));
    index = close + 1;
    statementStart = index;
  }

  return { base, dark };
}

function matchingBrace(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parseDeclarations(body) {
  const declarations = new Map();
  for (const piece of body.split(";")) {
    const colon = piece.indexOf(":");
    if (colon === -1) continue;
    const name = piece.slice(0, colon).trim();
    if (!name.startsWith("--")) continue;
    const value = piece.slice(colon + 1).trim();
    // Keep empty values. `--text: ;` is a real custom-property override in CSS:
    // dropping it here would silently resurrect an earlier value instead of
    // letting the required-colour check fail with the scheme and pair.
    declarations.set(name, value);
  }
  return declarations;
}

/** Apply declaration layers in cascade order; later layers win. */
export function layerTokens(layers) {
  const tokens = new Map();
  for (const layer of layers) {
    for (const [name, value] of layer) tokens.set(name, value);
  }
  return tokens;
}

/**
 * Resolve a token to an sRGB colour, following `var()` aliases. A cycle, a
 * missing required token, or an unparseable value throws with enough context
 * for the caller to name the scheme and pair.
 */
export function resolveToken(tokens, name, chain = []) {
  if (chain.includes(name)) throw new Error(`cyclic alias ${[...chain, name].join(" -> ")}`);
  if (!tokens.has(name)) throw new Error(`required token ${name} is missing`);

  const raw = tokens.get(name).trim();
  if (raw === "") throw new Error(`token ${name} has an empty value`);
  const alias = /^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^)]*))?\)$/.exec(raw);
  if (alias) {
    const [, reference, fallback] = alias;
    if (tokens.has(reference)) return resolveToken(tokens, reference, [...chain, name]);
    if (fallback) return parseColor(fallback, name);
    throw new Error(`token ${name} references missing token ${reference}`);
  }

  return parseColor(raw, name);
}

/** CSS number token, deliberately stricter than Number(): no 0x0, 1., Infinity. */
const NUMBER = /^[+-]?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/;

/** Parse the colour forms the shipped tokens use: hex and rgb()/rgba(). */
export function parseColor(value, label = null) {
  const text = String(value).trim();
  const named = label ? `token ${label}` : "colour";

  if (text === "") throw new Error(`${named} has an empty value`);

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text);
  if (hex) {
    const digits = hex[1];
    const short = digits.length === 3 || digits.length === 4;
    const step = short ? 1 : 2;
    const channel = (offset) =>
      parseInt(short ? digits[offset] + digits[offset] : digits.slice(offset, offset + 2), 16);
    return {
      r: channel(0),
      g: channel(step),
      b: channel(step * 2),
      a: digits.length === 4 || digits.length === 8 ? channel(step * 3) / 255 : 1,
    };
  }

  const functional = /^rgba?\(\s*([^()]*?)\s*\)$/i.exec(text);
  if (functional) {
    const body = functional[1];
    if (body.includes(",")) {
      if (body.includes("/")) {
        throw new Error(`${named} has invalid value "${text}" (mixed comma and slash separators)`);
      }
      // Legacy comma syntax. Keep empty pieces: split() must not paper over a
      // missing channel such as rgb(0,,0,0).
      const parts = body.split(",").map((part) => part.trim());
      if (parts.some((part) => part === "")) {
        throw new Error(`${named} has invalid value "${text}" (empty channel)`);
      }
      if (parts.length !== 3 && parts.length !== 4) {
        throw new Error(`${named} has invalid value "${text}" (expected 3 or 4 channels)`);
      }
      // Legacy syntax requires the three colour channels to share one unit type:
      // rgb(0%, 0, 0) is invalid CSS, not black. Alpha stays independent.
      const channels = parts.slice(0, 3).map((part) => parseChannelToken(part, text));
      if (new Set(channels.map((channel) => channel.percent)).size !== 1) {
        throw new Error(
          `${named} has invalid value "${text}" (legacy comma rgb() channels must share one unit type)`
        );
      }
      return {
        r: toChannel(channels[0]),
        g: toChannel(channels[1]),
        b: toChannel(channels[2]),
        a: parts.length === 4 ? parseAlpha(parts[3], text) : 1,
      };
    }

    // Modern space syntax: `rgb(R G B)` or `rgb(R G B / A)`. Alpha is only
    // valid after exactly one slash, and never as a fourth bare channel.
    const tokens = body.replace(/\s*\/\s*/g, " / ").trim().split(/\s+/).filter(Boolean);
    const slashes = tokens.filter((token) => token === "/").length;
    if (slashes > 1) {
      throw new Error(`${named} has invalid value "${text}" (expected one alpha after "/")`);
    }
    if (slashes === 1) {
      const slash = tokens.indexOf("/");
      const channels = tokens.slice(0, slash);
      const alphas = tokens.slice(slash + 1);
      if (channels.length !== 3) {
        throw new Error(
          `${named} has invalid value "${text}" (expected exactly 3 channels before "/")`
        );
      }
      if (alphas.length !== 1) {
        throw new Error(`${named} has invalid value "${text}" (expected one alpha after "/")`);
      }
      return {
        r: parseChannel(channels[0], text),
        g: parseChannel(channels[1], text),
        b: parseChannel(channels[2], text),
        a: parseAlpha(alphas[0], text),
      };
    }
    if (tokens.length !== 3) {
      throw new Error(
        `${named} has invalid value "${text}" (expected exactly 3 channels without an alpha)`
      );
    }
    return {
      r: parseChannel(tokens[0], text),
      g: parseChannel(tokens[1], text),
      b: parseChannel(tokens[2], text),
      a: 1,
    };
  }

  throw new Error(`${named} has invalid value "${text}" (unsupported colour)`);
}

function parseChannelToken(part, text) {
  const token = part.trim();
  const percent = token.endsWith("%");
  const digits = percent ? token.slice(0, -1) : token;
  if (!NUMBER.test(digits)) throw new Error(`invalid channel "${part}" in "${text}"`);
  const number = Number(digits);
  if (!Number.isFinite(number) || number < 0 || number > (percent ? 100 : 255)) {
    throw new Error(`invalid channel "${part}" in "${text}"`);
  }
  return { percent, number };
}

function toChannel({ percent, number }) {
  return percent ? (number / 100) * 255 : number;
}

function parseChannel(part, text) {
  return toChannel(parseChannelToken(part, text));
}

function parseAlpha(part, text) {
  const token = part.trim();
  const percent = token.endsWith("%");
  const digits = percent ? token.slice(0, -1) : token;
  if (!NUMBER.test(digits)) throw new Error(`invalid alpha "${part}" in "${text}"`);
  const number = Number(digits);
  if (!Number.isFinite(number) || number < 0 || number > (percent ? 100 : 1)) {
    throw new Error(`invalid alpha "${part}" in "${text}"`);
  }
  return percent ? number / 100 : number;
}

/** Composite a translucent foreground over an opaque surface, unrounded. */
export function compositeOver(foreground, background) {
  if (background.a !== 1) throw new Error("surface must be opaque before compositing");
  const alpha = foreground.a;
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
    a: 1,
  };
}

/** WCAG 2.x sRGB relative luminance. Channels stay unrounded. */
export function relativeLuminance(color) {
  const linear = (channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

export function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const [lighter, darker] = first >= second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Diagnostic text only: the comparison itself never uses this. */
export function formatRatio(ratio) {
  return ratio.toFixed(2);
}

/**
 * Evaluate one scheme's token map against `PAIRS`. Semantic token problems
 * become per-pair errors rather than exceptions so one bad token cannot hide
 * the rest of the table, and every message names the scheme and the pair.
 */
export function evaluateScheme(scheme, tokens, pairs = PAIRS) {
  const comparisons = [];
  const errors = [];

  for (const pair of pairs) {
    const label = `${pair.foreground} on ${pair.background}`;
    try {
      const foreground = resolveToken(tokens, pair.foreground);
      const background = resolveToken(tokens, pair.background);
      if (background.a !== 1) throw new Error(`surface token ${pair.background} must be opaque`);
      const painted = compositeOver(foreground, background);
      const ratio = contrastRatio(painted, background);
      const pass = ratio >= pair.min;
      comparisons.push({ scheme, ...pair, ratio, pass, foreground: painted, background });
      if (!pass) {
        errors.push(
          `contrast ${scheme}: ${label} is ${formatRatio(ratio)}:1, below ${pair.min}:1 (${pair.role})`
        );
      }
    } catch (error) {
      errors.push(`contrast ${scheme}: ${label} cannot be measured — ${error.message}`);
    }
  }

  return { scheme, comparisons, errors, pairCount: pairs.length, passed: errors.length === 0 };
}

/**
 * Read both shipped token stylesheets, build the light and dark cascade, and
 * evaluate the contract. Throws only for an unreadable/unparseable stylesheet;
 * token-level problems are returned in `errors` so `check.js` can report them
 * alongside its other failures.
 */
export async function checkContrast(root, files = TOKEN_FILES) {
  const lightLayers = [];
  const darkLayers = [];
  const darkBlocks = [];

  for (const relative of files) {
    let css;
    try {
      css = await readFile(join(root, relative), "utf8");
    } catch (error) {
      throw new Error(`cannot read ${relative}: ${error.code ?? error.message}`);
    }
    const parsed = parseTokenBlocks(css);
    if (!parsed.base.length && !parsed.dark.length) {
      throw new Error(`${relative} has no :root token block`);
    }
    // Base `:root` blocks contribute to both schemes. Dark blocks have higher
    // specificity, so they are applied after every base layer regardless of the
    // file they live in.
    lightLayers.push(...parsed.base);
    darkLayers.push(...parsed.base);
    darkBlocks.push(...parsed.dark);
  }
  darkLayers.push(...darkBlocks);

  const lightTokens = layerTokens(lightLayers);
  const darkTokens = layerTokens(darkLayers);
  const light = evaluateScheme("light", lightTokens);
  const dark = evaluateScheme("dark", darkTokens);

  return {
    light,
    dark,
    pairCount: light.pairCount + dark.pairCount,
    errors: [...light.errors, ...dark.errors],
    tokens: { light: lightTokens, dark: darkTokens },
  };
}
