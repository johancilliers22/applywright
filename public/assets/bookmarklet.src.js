// Applywright — LinkedIn capture bookmarklet, readable source.
//
// WHAT THIS IS
//   A click-to-run bookmarklet. The user opens their own profile page (or a job
//   advert) in their own signed-in browser, clicks the bookmark, and this script
//   reads the text that is already on the page, puts it on the clipboard, and
//   sends the user to Applywright's import screen. The user pastes; the user's
//   own session submits. Everything is user-initiated, twice over.
//
// WHAT THIS IS NOT
//   - Not an OAuth client. LinkedIn's member APIs give a third-party app an
//     identifier, a name, an email address and a photo. There is no scope that
//     returns a career history, so there is no consent screen to build and no
//     token to store. This file therefore holds no credential of any kind.
//   - Not a scraper. Nothing here runs on a timer, nothing runs on a page the
//     user is not looking at, nothing is fetched, and nothing is stored on
//     LinkedIn's side beyond one remembered app address (localStorage for that
//     site only, and only after the user answers a prompt).
//   - Not a network client. There is no fetch, no XMLHttpRequest, no beacon and
//     no third-party script. The only absolute URL in this file is the
//     Applywright address the user supplies.
//
// BUILD
//   public/assets/bookmarklet.js is generated from this file — do not edit it by
//   hand. The build drops whole-line comments, trims each line and joins the rest
//   into one line, because a bookmarklet must be a single javascript: URL. The
//   exact command is in docs/LINKEDIN-CAPTURE.md.
//
// HOUSE RULES THIS FILE OBEYS
//   - ES5 syntax only (var, function, no arrows, no template literals), so it
//     runs in any browser a bookmark can be installed in.
//   - No percent signs and no hash characters in the built output: a javascript:
//     URL is percent-decoded before it runs, and a hash would start a fragment.
//     That is why there is no modulo and no numeric HTML entity here.
//   - Whole-line comments only. The build is a mechanical line join, and a line
//     that starts with two slashes is the only thing it drops.

(function () {
  "use strict";

  // ================================================================== //
  // Configuration
  // ================================================================== //

  var CONFIG = {
    version: 1,
    // The app address. When the install link is rendered by the app itself this
    // token is replaced with that page's origin, so the user configures nothing.
    // Left as a token, the bookmarklet asks for the address once per site.
    origin: "__ORIGIN__",
    cvPath: "/app/cv?import=1",
    jobsPath: "/app/jobs?capture=1",
    storageKey: "applywright.capture.v1",
    originKey: "applywright.origin",
    maxChars: 60000,
    minProfileChars: 120,
    // The visible advert body, not the title block: a body this short is not a
    // posting worth capturing.
    minPostingChars: 200,
    // A schema.org description shorter than this is usually a summary, so the
    // visible advert text on the page is preferred when it is longer.
    minJsonLdDescription: 300,
    // Hosts Applywright's own capture endpoint refuses by design. The bookmarklet
    // still takes the text — it is useful for scoring — but it does not hand the
    // app a source URL that is guaranteed to be rejected. Mirrors
    // BLOCKED_CAPTURE_HOSTS in server/app.js; if the server grows a host and this
    // list does not, the only effect is the older behaviour (the app shows the
    // server's own policy message), never a wrong import.
    blockedCaptureHosts: ["linkedin.com", "indeed.com", "glassdoor."]
  };

  // ================================================================== //
  // Text helpers
  // ================================================================== //

  // Lowercase, letters and digits only — the comparison key for echo checks.
  function fold(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  // LinkedIn renders some text twice: once visibly, once in a clipped span for
  // screen readers. The second copy is a suffix of the first, not new
  // information, so a line that echoes one of the last few lines is dropped.
  function isEcho(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var x = fold(a);
    var y = fold(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.length < 8 || y.length < 8) return false;
    var short = x.length <= y.length ? x : y;
    var long = x.length <= y.length ? y : x;
    return long.indexOf(short) >= 0 && short.length * 10 >= long.length * 6;
  }

  // Page chrome that LinkedIn prints around the content. Dropping it here keeps
  // the pasted text clean, even though the server's parser also drops some of it.
  var NOISE = [
    /^show all(?:\s+\d+)?\s+[a-z ]+$/i,
    /^show fewer$/i,
    /^show less$/i,
    /^see more$/i,
    /^see less$/i,
    /^\u2026\s*see more$/i,
    /^open to work$/i,
    /^provide services$/i,
    /^follow$/i,
    /^following$/i,
    /^message$/i,
    /^connect$/i,
    /^pending$/i,
    /^more$/i,
    /^contact info$/i,
    /^report this profile$/i,
    /^show credential$/i,
    /^show all credentials$/i,
    /^\d+ endorsements?$/i,
    /^\u00b7?\s*\d+(?:st|nd|rd)$/i,
    /^\d[\d,.]*\+?\s+(?:connections?|followers?)$/i,
    /^page \d+ of \d+$/i
  ];

  function isNoise(line) {
    var value = String(line == null ? "" : line).trim();
    if (!value) return true;
    for (var i = 0; i < NOISE.length; i++) {
      if (NOISE[i].test(value)) return true;
    }
    return false;
  }

  // ================================================================== //
  // DOM reading
  // ================================================================== //

  // innerText respects visibility and keeps block boundaries as newlines, which
  // is exactly the shape needed. textContent is the fallback for detached nodes
  // and for engines where innerText is missing.
  function rawText(node) {
    if (!node) return "";
    var value = typeof node.innerText === "string" ? node.innerText : node.textContent;
    return value == null ? "" : String(value);
  }

  // Visible lines of a node: normalised whitespace, no blank lines, no noise.
  function linesOf(node) {
    var text = rawText(node);
    if (!text) return [];
    text = text.replace(/\u00a0|\u2007|\u202f/g, " ");
    text = text.replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, "");
    var parts = text.split(/\r\n|\r|\n/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var line = parts[i].replace(/[ \t]+/g, " ").replace(/^\s+|\s+$/g, "");
      if (!line) continue;
      if (isNoise(line)) continue;
      out.push(line);
    }
    return dedupe(out);
  }

  function dedupe(lines) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      var echo = false;
      var back = out.length > 3 ? 3 : out.length;
      for (var j = 1; j <= back; j++) {
        if (isEcho(line, out[out.length - j])) {
          echo = true;
          break;
        }
      }
      if (!echo) out.push(line);
    }
    return out;
  }

  function firstLine(node) {
    var lines = linesOf(node);
    return lines.length ? lines[0] : "";
  }

  // Walk up to the first SECTION ancestor: the profile's cards are sections, and
  // the class names inside them are cosmetic and change often.
  function upToSection(node) {
    var current = node;
    var depth = 0;
    while (current && depth < 8) {
      if (current.tagName === "SECTION") return current;
      current = current.parentElement;
      depth += 1;
    }
    return null;
  }

  // ================================================================== //
  // Section labels
  // ================================================================== //

  // LinkedIn prints these headings and Applywright's parser reads them back. An
  // empty string means "this is a profile section, deliberately not imported".
  var HEADINGS = {
    about: "About",
    summary: "About",
    experience: "Experience",
    "work experience": "Experience",
    education: "Education",
    skills: "Top Skills",
    "top skills": "Top Skills",
    "licenses and certifications": "Certifications",
    "licenses certifications": "Certifications",
    "licences and certifications": "Certifications",
    certifications: "Certifications",
    languages: "Languages",
    "volunteer experience": "",
    projects: "",
    "honors and awards": "",
    "honours and awards": "",
    publications: "",
    recommendations: "",
    courses: "",
    organizations: "",
    organisations: ""
  };

  function normaliseLabel(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/^\s+|\s+$/g, "");
  }

  // The capture heading for a label, "" for a recognised-but-skipped section, or
  // null when the label is not a section heading at all.
  function headingValue(label) {
    var key = normaliseLabel(label);
    if (!key) return null;
    if (typeof HEADINGS[key] === "string") return HEADINGS[key];
    return null;
  }

  function headingFor(section) {
    var nodes = section.querySelectorAll("h2, h3, [role='heading']");
    for (var i = 0; i < nodes.length; i++) {
      var value = headingValue(linesOf(nodes[i]).join(" "));
      if (value !== null) return value;
    }
    var id = headingValue(section.id || "");
    if (id !== null) return id;
    var label = headingValue(section.getAttribute("aria-label") || "");
    if (label !== null) return label;
    return null;
  }

  // ================================================================== //
  // Profile extraction
  // ================================================================== //

  function topCard(doc) {
    var heading = doc.querySelector("main h1") || doc.querySelector("h1");
    if (!heading) return null;
    var section = upToSection(heading);
    if (section) return section;
    return heading.parentElement || heading;
  }

  // The card's own text is name, headline, location and a pile of buttons. The
  // name comes from the h1; the next surviving lines are the headline and then
  // the location, in LinkedIn's print order.
  function readHeader(doc) {
    var card = topCard(doc);
    var head = { name: "", headline: "", location: "" };
    if (!card) return head;

    var h1 = card.querySelector("h1") || doc.querySelector("h1");
    var name = h1 ? firstLine(h1) : "";
    head.name = name;

    var rest = [];
    var lines = linesOf(card);
    for (var i = 0; i < lines.length && i < 12; i++) {
      var line = lines[i];
      if (isEcho(line, name)) continue;
      if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(line)) continue;
      rest.push(line);
    }
    head.headline = rest[0] || "";
    for (var j = 1; j < rest.length && j < 5; j++) {
      if (looksMeta(rest[j]) && !DATE_RE.test(rest[j])) {
        head.location = rest[j];
        break;
      }
    }
    return head;
  }

  // One entry per list item inside a section. The class lookups are only a
  // fallback for builds that swap the element type.
  function sectionEntries(section) {
    var items = section.querySelectorAll("li");
    if (!items.length) items = section.querySelectorAll("[class*='list__item']");
    var entries = [];
    var i;
    for (i = 0; i < items.length; i++) {
      var lines = linesOf(items[i]);
      if (lines.length) entries.push(lines);
    }
    if (!entries.length) {
      var block = linesOf(section);
      var kept = [];
      for (var b = 0; b < block.length; b++) {
        if (headingValue(block[b]) !== null) continue;
        kept.push(block[b]);
      }
      if (kept.length) entries.push(kept);
    }
    return entries;
  }

  function extractProfile(doc, loc) {
    var parts = { name: "", headline: "", location: "", url: "", sections: {} };
    var found = false;
    var head = readHeader(doc);
    parts.name = head.name;
    parts.headline = head.headline;
    parts.location = head.location;
    parts.url = profileUrl(loc);

    var sections = doc.querySelectorAll("section, div.artdeco-card");
    for (var i = 0; i < sections.length; i++) {
      var heading = headingFor(sections[i]);
      if (!heading) continue;
      found = true;
      if (heading === "") continue;
      var entries = sectionEntries(sections[i]);
      if (!entries.length) continue;
      if (!parts.sections[heading]) parts.sections[heading] = [];
      var target = parts.sections[heading];
      for (var j = 0; j < entries.length; j++) {
        var entry = entries[j];
        var key = fold(entry.join(" "));
        if (!key) continue;
        if (key === fold(heading)) continue;
        var duplicate = false;
        for (var k = 0; k < target.length; k++) {
          if (fold(target[k].join(" ")) === key) {
            duplicate = true;
            break;
          }
        }
        if (!duplicate) target.push(entry);
      }
    }

    return { text: composeProfile(parts), parts: parts, recognised: found };
  }

  // The canonical profile URL, without the query junk LinkedIn adds for
  // subdomains and tracking.
  function profileUrl(loc) {
    var origin = String(loc.origin || "");
    var path = String(loc.pathname || "");
    return (origin + path).replace(/\/+$/, "");
  }

  var MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
  var DATE_RE = new RegExp(
    "(?:" + MONTH + "[\\s,]*)?(?:19|20)\\d{2}\\s*(?:-|\\u2013|\\u2014|to)\\s*(?:(?:" + MONTH + "[\\s,]*)?(?:19|20)\\d{2}|present|current)",
    "i"
  );
  var YEAR_RE = new RegExp("^(?:" + MONTH + "\\s*)?(?:19|20)\\d{2}$", "i");
  var TYPE_RE =
    /\b(?:full-?time|part-?time|contract|freelance|internship|self-?employed|seasonal|apprenticeship|temporary)\b/i;
  var BULLET_RE = /^(?:[\u2022\u25aa\u25e6\u2023\u00b7*\-\u2013\u2014]\s|\d{1,2}[.)]\s)/;

  // A line that describes the entry rather than its prose: dates, an employment
  // type, a "Company · Full-time" line, or "London, England, United Kingdom".
  function looksMeta(line) {
    var value = String(line == null ? "" : line);
    if (!value) return false;
    if (DATE_RE.test(value) || YEAR_RE.test(value)) return true;
    if (value.indexOf("\u00b7") >= 0) return true;
    if (TYPE_RE.test(value)) return true;
    if (value.length <= 80 && !/\d/.test(value)) {
      var commas = value.split(",").length;
      if (commas >= 2 && commas <= 4) return true;
    }
    return false;
  }

  // Mark the description lines of an experience entry as bullets. Without this a
  // description line that happens not to end in a full stop is read as a new job
  // title by the server's parser, which splits one role into two.
  function bulletise(lines) {
    if (lines.length < 2) return lines;
    var cut = 1;
    for (var i = 1; i < lines.length && i <= 3; i++) {
      if (looksMeta(lines[i])) cut = i;
    }
    var out = [lines[0]];
    for (var j = 1; j < lines.length; j++) {
      var line = lines[j];
      if (j <= cut) {
        out.push(line);
        continue;
      }
      out.push(BULLET_RE.test(line) ? line : "\u2022 " + line);
    }
    return out;
  }

  // Skills print one per line, usually with an endorsement count underneath.
  function skillLines(entries) {
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry.length) continue;
      out.push(BULLET_RE.test(entry[0]) ? entry[0].replace(BULLET_RE, "") : entry[0]);
    }
    return dedupe(out);
  }

  function joinSentences(lines) {
    return lines.join(" ").replace(/\s+/g, " ").replace(/\s+$/, "");
  }

  // LinkedIn's own clipboard layout: name, headline, location, then the section
  // headings Applywright's parser looks for, with a blank line between entries.
  function composeProfile(parts) {
    var blocks = [];
    var head = [];
    if (parts.name) head.push(parts.name);
    if (parts.headline && !isEcho(parts.headline, parts.name)) head.push(parts.headline);
    if (parts.location && !isEcho(parts.location, parts.headline) && !isEcho(parts.location, parts.name)) {
      head.push(parts.location);
    }
    if (head.length) blocks.push(head.join("\n"));
    if (parts.url) blocks.push("Contact\n" + parts.url);

    var order = ["About", "Top Skills", "Experience", "Education", "Certifications", "Languages"];
    for (var i = 0; i < order.length; i++) {
      var heading = order[i];
      var entries = parts.sections[heading];
      if (!entries || !entries.length) continue;
      var body = "";
      if (heading === "About") {
        var paragraphs = [];
        for (var p = 0; p < entries.length; p++) paragraphs.push(joinSentences(entries[p]));
        body = paragraphs.join(" ");
      } else if (heading === "Top Skills") {
        body = skillLines(entries).join("\n");
      } else if (heading === "Languages") {
        var spoken = [];
        for (var s = 0; s < entries.length; s++) spoken.push(entries[s].join(" "));
        body = spoken.join("\n");
      } else if (heading === "Experience") {
        var roles = [];
        for (var r = 0; r < entries.length; r++) roles.push(bulletise(entries[r]).join("\n"));
        body = roles.join("\n\n");
      } else {
        var groups = [];
        for (var g = 0; g < entries.length; g++) groups.push(entries[g].join("\n"));
        body = groups.join("\n\n");
      }
      if (body) blocks.push(heading + "\n" + body);
    }

    return tidyBlocks(blocks);
  }

  function tidyBlocks(blocks) {
    var text = blocks.join("\n\n");
    text = text.replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
    if (text.length > CONFIG.maxChars) {
      var cut = text.lastIndexOf("\n\n", CONFIG.maxChars);
      text = (cut > 0 ? text.slice(0, cut) : text.slice(0, CONFIG.maxChars)).replace(/\s+$/, "");
    }
    return text;
  }

  // ================================================================== //
  // Job advert extraction
  // ================================================================== //

  // Named entities only. A numeric entity such as the one for an apostrophe would
  // need a hash character, which a javascript: URL cannot carry safely.
  var ENTITIES = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&nbsp;": " "
  };

  function decodeEntities(value) {
    return String(value == null ? "" : value).replace(/&[a-z]+;/gi, function (match) {
      var found = ENTITIES[match.toLowerCase()];
      return typeof found === "string" ? found : match;
    });
  }

  function stripTags(value) {
    return decodeEntities(
      String(value == null ? "" : value)
        .replace(/<\s*(?:br|\/p|\/li|\/div)\s*\/?\s*>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
    );
  }

  // Enough sites publish schema.org JobPosting markup that this is the cheapest
  // honest source of title, employer and location — and it is the site's own
  // markup, not something this script reaches for.
  function readJsonLd(doc) {
    var scripts = doc.querySelectorAll("script[type='application/ld+json']");
    for (var i = 0; i < scripts.length; i++) {
      var data = null;
      try {
        data = JSON.parse(String(scripts[i].textContent || ""));
      } catch (error) {
        data = null;
      }
      var posting = findJobPosting(data, 0);
      if (!posting) continue;
      var out = { title: "", company: "", location: "", description: "" };
      if (typeof posting.title === "string") out.title = posting.title;
      else if (typeof posting.name === "string") out.title = posting.name;
      if (posting.hiringOrganization && typeof posting.hiringOrganization.name === "string") {
        out.company = posting.hiringOrganization.name;
      }
      out.location = jsonLdLocation(posting.jobLocation);
      if (typeof posting.description === "string") {
        out.description = joinSentences(stripTags(posting.description).split(/\r\n|\r|\n/));
      }
      return out;
    }
    return null;
  }

  function findJobPosting(value, depth) {
    if (!value || depth > 3) return null;
    if (Object.prototype.toString.call(value) === "[object Array]") {
      for (var i = 0; i < value.length; i++) {
        var found = findJobPosting(value[i], depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof value !== "object") return null;
    var type = value["@type"];
    if (typeof type === "string" && /JobPosting/i.test(type)) return value;
    if (Object.prototype.toString.call(type) === "[object Array]") {
      for (var t = 0; t < type.length; t++) {
        if (typeof type[t] === "string" && /JobPosting/i.test(type[t])) return value;
      }
    }
    var keys = ["@graph", "mainEntity", "itemListElement", "item"];
    for (var k = 0; k < keys.length; k++) {
      if (value[keys[k]]) {
        var nested = findJobPosting(value[keys[k]], depth + 1);
        if (nested) return nested;
      }
    }
    return null;
  }

  function jsonLdLocation(value) {
    var place = value;
    if (Object.prototype.toString.call(place) === "[object Array]") place = place[0];
    if (!place || typeof place !== "object") return "";
    var address = place.address || place;
    if (typeof address === "string") return address;
    if (typeof address !== "object") return "";
    var bits = [];
    var names = ["addressLocality", "addressRegion", "addressCountry"];
    for (var i = 0; i < names.length; i++) {
      var part = address[names[i]];
      if (typeof part === "string") bits.push(part);
      else if (part && typeof part.name === "string") bits.push(part.name);
    }
    return bits.join(", ");
  }

  // Site-specific containers first; page-level containers only when they hold a
  // full advert, because they also carry the heading and the page chrome.
  var SPECIFIC_DESCRIPTION_SELECTORS = [
    "[id='job-details']",
    "[class*='jobs-description-content']",
    "[class*='jobs-box__html-content']",
    "[id='jobDescriptionText']",
    "[data-automation-id='jobPostingDescription']",
    "[class*='jobDescription']",
    "[class*='job-description']",
    "[class*='posting-body']"
  ];
  var GENERIC_DESCRIPTION_SELECTORS = ["article", "main"];

  // The first candidate that carries a real advert wins, rather than the
  // longest: a longer string is not a better one.
  function descriptionFromDom(doc) {
    var groups = [
      { selectors: SPECIFIC_DESCRIPTION_SELECTORS, enough: 80 },
      { selectors: GENERIC_DESCRIPTION_SELECTORS, enough: 300 }
    ];
    var longest = "";
    for (var g = 0; g < groups.length; g++) {
      for (var i = 0; i < groups[g].selectors.length; i++) {
        var nodes = doc.querySelectorAll(groups[g].selectors[i]);
        for (var j = 0; j < nodes.length; j++) {
          var text = joinSentences(linesOf(nodes[j]));
          if (text.length >= groups[g].enough) return text;
          if (text.length > longest.length) longest = text;
        }
      }
    }
    return longest;
  }

  var COMPANY_SELECTORS = [
    "[data-company-name]",
    "[class*='topcard__org-name']",
    "[class*='topcard__flavor']",
    "[class*='InlineCompanyRating'] a",
    "[class*='company-name']",
    "[class*='employer']"
  ];

  function firstSelectorText(doc, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var node = doc.querySelector(selectors[i]);
      var text = node ? firstLine(node) : "";
      if (text) return text;
    }
    return "";
  }

  function documentTitle(doc) {
    var title = String(doc.title || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    if (!title) return "";
    var parts = title.split(/\s+[|\u2013\u2014-]\s+/);
    return parts[0].replace(/^\s+|\s+$/g, "");
  }

  function extractJob(doc, loc) {
    var job = { title: "", company: "", location: "", description: "" };
    var markup = readJsonLd(doc);
    if (markup) {
      job.title = markup.title || "";
      job.company = markup.company || "";
      job.location = markup.location || "";
      job.description = markup.description || "";
    }
    if (!job.title) {
      var heading = doc.querySelector("main h1") || doc.querySelector("h1");
      job.title = heading ? firstLine(heading) : documentTitle(doc);
    }
    if (!job.company) job.company = firstSelectorText(doc, COMPANY_SELECTORS);
    if (!job.location) {
      job.location = firstSelectorText(doc, [
        "[class*='topcard__flavor--bullet']",
        "[class*='jobsearch-JobInfoHeader-subtitle']",
        "[class*='location']"
      ]);
    }
    if (!job.description) job.description = descriptionFromDom(doc);
    // The visible advert is what the user is looking at; a schema.org description
    // is only trusted when it is long enough to be the whole advert.
    if (job.description.length < CONFIG.minJsonLdDescription) {
      var visible = descriptionFromDom(doc);
      if (visible.length > job.description.length) job.description = visible;
    }
    job.description = joinSentences(String(job.description).split(/\r\n|\r|\n/));
    job.source = String(loc.href || "");
    return job;
  }

  function clip(value, max) {
    var text = String(value == null ? "" : value).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    if (text.length <= max) return text;
    return text.slice(0, max).replace(/\s+\S*$/, "");
  }

  // First line is the title, second the employer, third the location, then the
  // advert body. That is the order POST /api/jobs/capture's pasted-text reader
  // takes, and the advert body is what the scorer needs.
  function composeJob(job) {
    var head = [];
    if (job.title) head.push(clip(job.title, 140));
    if (job.company) head.push(clip(job.company, 90));
    if (job.location) head.push(clip(job.location, 120));
    var body = clip(job.description, 20000);
    if (!body) return "";
    var text = head.join("\n") + "\n\n" + body;
    return text.replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
  }

  // ================================================================== //
  // Clipboard and storage
  // ================================================================== //

  // Synchronous and permission-free: a hidden textarea plus execCommand. The
  // async Clipboard API is only the fallback, because it needs a permission.
  function copyText(text) {
    var area = null;
    var copied = false;
    try {
      area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "readonly");
      area.setAttribute("aria-hidden", "true");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      area.style.left = "-1000px";
      area.style.width = "1px";
      area.style.height = "1px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      area.setSelectionRange(0, text.length);
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    if (area && area.parentNode) area.parentNode.removeChild(area);
    return copied === true;
  }

  function copyThen(text, next) {
    if (copyText(text)) {
      next(true);
      return;
    }
    var board = typeof navigator !== "undefined" ? navigator.clipboard : null;
    if (board && typeof board.writeText === "function") {
      board.writeText(text).then(
        function () {
          next(true);
        },
        function () {
          next(false);
        }
      );
      return;
    }
    next(false);
  }

  function store() {
    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function readStore(key) {
    var space = store();
    if (!space) return "";
    try {
      var value = space.getItem(key);
      return value == null ? "" : String(value);
    } catch (error) {
      return "";
    }
  }

  function writeStore(key, value) {
    var space = store();
    if (!space) return false;
    try {
      space.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ================================================================== //
  // App address
  // ================================================================== //

  function isHttpUrl(value) {
    return /^https?:\/\/[^\s\/]+(?:\/[^\s]*)?$/i.test(String(value == null ? "" : value));
  }

  function stripSlash(value) {
    return String(value == null ? "" : value).replace(/\/+$/, "");
  }

  function onOurApp(loc) {
    var path = String(loc.pathname || "");
    if (path.indexOf("/app") !== 0) return false;
    return /applywright/i.test(String(document.title || ""));
  }

  // Where the user's Applywright lives. In order: the build-time address, the
  // page itself when the bookmark is clicked on our own origin, the address the
  // user gave this site before, and finally one prompt that is then remembered.
  function resolveOrigin() {
    var fixed = String(CONFIG.origin || "");
    if (fixed && !/^__.*__$/.test(fixed) && isHttpUrl(fixed)) return stripSlash(fixed);
    if (onOurApp(location)) return stripSlash(String(location.origin || ""));
    var saved = stripSlash(readStore(CONFIG.originKey));
    if (saved && isHttpUrl(saved)) return saved;
    var answer = "";
    try {
      answer = window.prompt(
        "Applywright address, for example https://applywright.example.com",
        saved || "https://"
      );
    } catch (error) {
      answer = "";
    }
    answer = stripSlash(String(answer == null ? "" : answer).replace(/\s+/g, ""));
    if (!isHttpUrl(answer)) return "";
    writeStore(CONFIG.originKey, answer);
    return answer;
  }

  function sameSite(left, right) {
    return stripSlash(String(left || "")) === stripSlash(String(right || ""));
  }

  // ================================================================== //
  // Delivery
  // ================================================================== //

  // The envelope the app reads back from localStorage on its own origin.
  function envelope(capture) {
    return JSON.stringify({
      version: CONFIG.version,
      kind: capture.kind,
      text: capture.text,
      sourceUrl: capture.sourceUrl,
      title: capture.title || null,
      company: capture.company || null,
      capturedAt: new Date().toISOString()
    });
  }

  function shortHost() {
    return String(location.hostname || "").toLowerCase();
  }

  // Does the capture endpoint refuse this host? A rule ending in a dot is a domain
  // family ("glassdoor."); otherwise the rule matches the host or a subdomain of it.
  function hostBlocked(host) {
    var value = String(host == null ? "" : host).toLowerCase();
    var rules = CONFIG.blockedCaptureHosts;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.charAt(rule.length - 1) === ".") {
        if (value.indexOf(rule) >= 0) return true;
      } else if (value === rule || value.slice(-(rule.length + 1)) === "." + rule) {
        return true;
      }
    }
    return false;
  }

  // What the user is told, in plain words, including what did not happen.
  function describe(capture, copied, openedUrl) {
    var count = String(capture.text.length);
    var lines = [];
    if (copied) {
      lines.push("Applywright: " + count + " characters are on your clipboard.");
    } else {
      lines.push(
        "Applywright: the browser refused the clipboard copy. Select the text in the box Applywright opens and copy it by hand."
      );
    }
    if (capture.kind === "profile") {
      lines.push("Open " + openedUrl + " and paste it (Ctrl+V) into the LinkedIn import box.");
    } else {
      lines.push("Open " + openedUrl + " and paste it into the job capture box.");
      if (capture.blocked) {
        lines.push(
          "Applywright does not store postings from " +
            shortHost() +
            " — its terms do not permit re-publishing them — so put this text in the score or tailor box instead. The source URL is left blank on purpose: paste the employer's own careers address if you want to track the job."
        );
      }
    }
    lines.push("Nothing was sent anywhere and nothing was saved on this site.");
    return lines.join("\n\n");
  }

  function deliver(capture) {
    var origin = resolveOrigin();
    if (!origin) {
      alert("Applywright: I need your Applywright address before I can open it. Nothing was copied.");
      return;
    }
    var path = capture.kind === "profile" ? CONFIG.cvPath : CONFIG.jobsPath;
    var url = origin + path;

    // On our own origin the app can collect the text itself. From anywhere else
    // it cannot: localStorage is per-origin, a cross-site POST is refused by
    // SameSite=Lax plus the server's same-origin check, and our COOP header
    // severs opener messaging. So the clipboard carries the text and the user
    // pastes it — no credential is involved at any point.
    if (sameSite(origin, location.origin)) {
      if (!writeStore(CONFIG.storageKey, envelope(capture))) {
        alert(
          "Applywright: this browser would not let me store the text locally. Nothing was saved — copy the profile by hand."
        );
        return;
      }
      location.href = url;
      return;
    }

    copyThen(capture.text, function (copied) {
      var opened = null;
      try {
        opened = window.open(url, "_blank");
      } catch (error) {
        opened = null;
      }
      var messageText = describe(capture, copied, url);
      if (!opened) messageText = messageText + "\n\nThe new tab was blocked, so open that address yourself.";
      alert(messageText);
    });
  }

  // ================================================================== //
  // Entry
  // ================================================================== //

  function classify(loc) {
    var host = String(loc.hostname || "").toLowerCase();
    var path = String(loc.pathname || "");
    if (/(^|\.)linkedin\.com$/.test(host)) {
      if (path.indexOf("/in/") === 0) return "profile";
      if (path.indexOf("/jobs/view/") === 0 || path.indexOf("/jobs/collections/") === 0) return "posting";
      return null;
    }
    return "posting";
  }

  function message(error) {
    if (!error) return "unknown error";
    if (typeof error.message === "string" && error.message) return error.message;
    return String(error);
  }

  function buildProfileCapture() {
    // A details page ("/in/name/details/experience") has no name, headline or
    // location, so the capture would be half a CV. Ask for the main page.
    if (/\/details\//.test(String(location.pathname || ""))) {
      alert(
        "Applywright: this is a LinkedIn details page. Open your main profile (linkedin.com/in/your-name) and click the bookmark there."
      );
      return null;
    }
    var result = extractProfile(document, location);
    var text = result.text || "";
    if (!result.recognised || text.replace(/\s+/g, "").length < CONFIG.minProfileChars) {
      alert(
        "Applywright could not read this profile page — LinkedIn's markup here is not one this bookmarklet knows.\n\n" +
          "Nothing was sent. Copy the profile by hand (click the page, Ctrl+A then Ctrl+C) and paste it into Applywright's import box, or use LinkedIn's Save to PDF."
      );
      return null;
    }
    return {
      kind: "profile",
      text: text,
      sourceUrl: String(location.href || ""),
      title: result.parts.name || null,
      company: null
    };
  }

  function buildPostingCapture() {
    var job = extractJob(document, location);
    var text = composeJob(job);
    if (!text || !job.description || job.description.length < CONFIG.minPostingChars) {
      alert(
        "Applywright could not find an advert on this page — it is not a job posting this bookmarklet recognises.\n\n" +
          "Nothing was sent. Open the advert itself and click the bookmark again."
      );
      return null;
    }
    // A host the capture endpoint refuses is still worth reading: the text scores
    // and tailors fine. What it must not do is hand the app a source URL that is
    // guaranteed to come back as source_not_permitted, so that field stays empty.
    var blocked = hostBlocked(location.hostname);
    return {
      kind: "posting",
      text: text,
      sourceUrl: blocked ? "" : String(location.href || ""),
      title: job.title || null,
      company: job.company || null,
      blocked: blocked
    };
  }

  // Runs only because the user clicked the bookmark: there is no load hook, no
  // timer and no listener that could fire it a second time.
  function run() {
    try {
      var kind = classify(location);
      if (!kind) {
        alert(
          "Applywright: this page is not a LinkedIn profile or a job advert.\n\n" +
            "Open your profile (linkedin.com/in/your-name) or a specific advert, then click the bookmark."
        );
        return;
      }
      var capture = kind === "profile" ? buildProfileCapture() : buildPostingCapture();
      if (!capture) return;
      deliver(capture);
    } catch (error) {
      alert("Applywright capture stopped: " + message(error) + ". Nothing was sent anywhere.");
    }
  }

  // Exposed for the node harness this file is tested with, and for anyone
  // debugging in a console. Nothing here fires on its own: the functions only do
  // something when they are called.
  window.__applywrightCapture = {
    version: CONFIG.version,
    config: CONFIG,
    classify: classify,
    extractProfile: extractProfile,
    composeProfile: composeProfile,
    extractJob: extractJob,
    composeJob: composeJob,
    copyText: copyText,
    resolveOrigin: resolveOrigin,
    hostBlocked: hostBlocked,
    buildProfileCapture: buildProfileCapture,
    buildPostingCapture: buildPostingCapture,
    deliver: deliver,
    run: run
  };

  run();
})();
