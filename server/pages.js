/** Minimal page renderer: include partials, substitute tokens, mark the active nav link. */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const INCLUDE = /<!--#include\s+([\w.-]+)\s*-->/g;
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createPageRenderer({ publicDir, site }) {
  const cache = new Map();

  async function readCached(path) {
    const info = await stat(path);
    const hit = cache.get(path);
    if (hit && hit.mtimeMs === info.mtimeMs) return hit.content;
    const content = await readFile(path, "utf8");
    cache.set(path, { mtimeMs: info.mtimeMs, content });
    return content;
  }

  async function expand(html, depth = 0) {
    if (depth > 3 || !html.includes("<!--#include")) return html;
    let out = html;
    for (const match of html.matchAll(INCLUDE)) {
      const name = match[1];
      if (!/^[\w.-]+\.html$/.test(name) || name.includes("..")) continue;
      try {
        out = out.replace(match[0], await expand(await readCached(join(publicDir, "partials", name)), depth + 1));
      } catch {
        out = out.replace(match[0], "");
      }
    }
    return out;
  }

  function tokens(html) {
    return html
      .replaceAll("{{YEAR}}", String(site.year))
      .replaceAll("{{CONTACT_EMAIL}}", site.contactEmail)
      .replaceAll("{{BRAND}}", site.brand);
  }

  function markCurrent(html, route) {
    const start = html.indexOf('<nav class="nav__links"');
    if (start === -1) return html;
    const end = html.indexOf("</nav>", start);
    if (end === -1) return html;
    const segment = html.slice(start, end);
    if (segment.includes('aria-current="page"')) return html;
    const needle = new RegExp(`<a href="${escapeRe(route)}">`);
    if (!needle.test(segment)) return html;
    return html.slice(0, start) + segment.replace(needle, `<a href="${route}" aria-current="page">`) + html.slice(end);
  }

  return {
    async render(file, route) {
      let source;
      try {
        source = await readCached(join(publicDir, file));
      } catch {
        return null;
      }
      return markCurrent(tokens(await expand(source)), route);
    },
  };
}
