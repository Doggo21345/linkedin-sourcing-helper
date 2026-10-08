import { extractLocal } from "../lib/extract.js";
import { buildQueries, countOperators, isEarlyCareer } from "../lib/query.js";
import { displayName, normalizeDomain, contactsToCsv, contactsToTsv, VERIFIER_TOOLS } from "../lib/email.js";
import { companyFromHeadline, cleanProfileName, profileUrl } from "../lib/profile.js";
import { buildBoardSearch, filterJobs, ago, DEFAULT_BOARDS, BOARD_SITES, COUNTRIES } from "../lib/boards.js";

const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  const el = $("status");
  el.textContent = text || "";
  el.classList.toggle("error", isError);
  el.hidden = !text;
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(resp);
    });
  });
}

function sendToBg(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(resp);
    });
  });
}

// Self-contained scrape run in the page via chrome.scripting.executeScript.
// Must not reference anything outside its own body (it is serialized).
function scrapePostingInPage() {
  const pick = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return "";
  };
  const meta = (prop) =>
    document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.content?.trim() || "";
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  // True only on a single-posting page. /jobs/search and /jobs/collections show
  // a list, so their page heading and document.title describe the list, not the
  // selected job — the loosest title sources are gated on this.
  const isJobView = /\/jobs\/view\//.test(window.location.pathname);

  // --- Source 1: JSON-LD JobPosting (most reliable; survives CSS churn) -----
  let ld = {};
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(node.textContent);
      const items = Array.isArray(parsed) ? parsed : [parsed, ...(parsed["@graph"] || [])];
      for (const it of items) {
        if (it && /JobPosting/i.test(it["@type"] || "")) {
          const loc = it.jobLocation?.address || it.jobLocation?.[0]?.address || {};
          ld = {
            title: clean(it.title),
            company: clean(it.hiringOrganization?.name),
            location: clean(
              [loc.addressLocality, loc.addressRegion, loc.addressCountry]
                .filter((x) => typeof x === "string")
                .join(", ")
            ),
            // description is HTML — strip tags for text extraction
            description: clean(
              String(it.description || "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ")
            )
          };
          break;
        }
      }
    } catch (e) {
      /* malformed JSON-LD block — ignore and try the next source */
    }
    if (ld.company) break;
  }

  // --- Source 2: og:title / document.title -> "<Company> hiring <Role> in <Loc>"
  let ogCompany = "";
  let ogTitle = "";
  let ogLocation = "";
  for (const raw of [meta("og:title"), document.title]) {
    const s = clean(raw).replace(/\s*\|\s*LinkedIn.*$/i, "");
    const m = s.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+))?$/i);
    if (m) {
      ogCompany = ogCompany || clean(m[1]);
      ogTitle = ogTitle || clean(m[2]);
      ogLocation = ogLocation || clean(m[3] || "");
      break;
    }
  }
  // The "<Company> hiring <Role>" shape is the guest/crawler title. While logged
  // in, LinkedIn uses "<Role> | <Company> | LinkedIn" — sometimes prefixed with
  // an unread count, "(3) Data Scientist 1 | PayPal | LinkedIn". That title is
  // present on every logged-in posting, so it is a better fallback than a DOM
  // class name; without it a logged-in /jobs/view page had no working source
  // once JSON-LD was absent, which reads as "the role isn't detected".
  if (!ogTitle && isJobView) {
    const parts = clean(document.title)
      .replace(/^\(\d+\+?\)\s*/, "")
      .split("|")
      .map(clean)
      .filter((p) => p && !/^linkedin$/i.test(p));
    // Two or more segments means it really is "Role | Company", not a bare
    // page name like "Jobs" that would become a fake role.
    if (parts.length >= 2) {
      ogTitle = parts[0];
      ogCompany = ogCompany || parts[1];
    }
  }

  // --- Source 3: URL slug -> /jobs/view/<role>-at-<company>-<id> ------------
  let slugCompany = "";
  const slug = window.location.pathname.match(/\/jobs\/view\/([^/?]+)/)?.[1] || "";
  if (slug) {
    const m = slug.replace(/-\d+$/, "").split("-at-");
    if (m.length > 1) {
      slugCompany = m[m.length - 1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  // --- Source 4: DOM selectors (current LinkedIn markup) -------------------
  // Title selectors are scoped to the job top card. A bare "h1" is deliberately
  // NOT a fallback: on /jobs/collections and /jobs/search pages the page h1 is
  // the company or a generic heading, which silently became the "role".
  // A bare "h1" is deliberately NOT a fallback, but an h1 *scoped to a top-card
  // container* is safe and is what catches layouts we don't have a class for —
  // without it, title has no generic fallback at all while company has two
  // (the a[href*="/company/"] wildcard and the URL slug), which is why a
  // standalone posting could report the company correctly and no role.
  const domTitle = pick([
    ".job-details-jobs-unified-top-card__job-title h1",
    ".job-details-jobs-unified-top-card__job-title",
    ".jobs-unified-top-card__job-title",
    ".jobs-details-top-card__job-title",
    // Guest / standalone (not-logged-in) layout, newest first.
    ".top-card-layout__title",
    "h1.top-card-layout__title",
    ".topcard__title",
    ".jobs-search__job-details h1",
    "h1.t-24",
    // Scoped last-resort: an h1 inside anything that looks like a job top card.
    ".top-card-layout h1",
    ".topcard h1",
    ".job-details-jobs-unified-top-card h1",
    ".jobs-unified-top-card h1",
    // "main h1" is only safe on a standalone /jobs/view/ page, where the page's
    // single heading IS the role. On /jobs/search and /jobs/collections it is a
    // generic heading ("Recommended for you") or the company.
    ...(isJobView ? ["main h1"] : [])
  ]);

  let domCompany = pick([
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
    ".jobs-search__job-details a[href*='/company/']",
    'a[href*="/company/"]'
  ]);
  domCompany = clean(domCompany.split("\n")[0]);

  // The company's LinkedIn slug, taken from the company link on the posting.
  // This is what lets us use linkedin.com/company/<slug>/people/, which scopes
  // to the company by URL instead of hoping a keyword matches profile text.
  let companySlug = "";
  for (const a of document.querySelectorAll('a[href*="/company/"]')) {
    const m = (a.getAttribute("href") || "").match(/\/company\/([^/?#]+)/);
    // Skip LinkedIn's own marketing/help links, which also live under /company/.
    if (m && !/^(linkedin|admin|setup)$/i.test(m[1])) {
      companySlug = m[1];
      break;
    }
  }

  const domLocation = pick([
    ".job-details-jobs-unified-top-card__primary-description-container",
    ".jobs-unified-top-card__primary-description",
    ".topcard__flavor--bullet",
    ".jobs-unified-top-card__bullet"
  ]);

  // Merge with precedence: structured data > og:title > DOM > URL slug.
  let title = ld.title || ogTitle || domTitle || "";
  const company = ld.company || ogCompany || domCompany || slugCompany || "";
  // A "title" equal to the company is a failed read, not a role. Reporting it
  // empty makes the popup ask for it instead of searching for the company as
  // though it were a job title.
  if (company && title.toLowerCase() === company.toLowerCase()) title = "";
  // Trim trailing bullets/dots LinkedIn appends to the location line.
  const jobLocation = clean((ld.location || ogLocation || domLocation || "").split("·")[0]);

  // innerText, not textContent: textContent concatenates across element
  // boundaries, so "<strong>Reports to:</strong><span>Director of Analytics</span>"
  // collapses to "Reports to:Director of Analytics" and the reporting-line
  // patterns never match. innerText keeps the block break.
  let description = "";
  for (const sel of [
    "#job-details",
    ".jobs-description__content",
    ".jobs-box__html-content",
    ".jobs-description-content__text",
    "article.jobs-description__container"
  ]) {
    const el = document.querySelector(sel);
    const text = clean(el?.innerText || el?.textContent || "");
    if (text.length > description.length) description = text;
  }
  if (!description) description = ld.description || "";
  if (!description) {
    // Fallback: largest visible text block on the page.
    let best = "";
    for (const el of document.querySelectorAll("article, section, div")) {
      const t = (el.innerText || "").trim();
      if (t.length > best.length && t.length < 20000) best = t;
    }
    description = best;
  }

  return {
    title,
    company,
    companySlug,
    location: jobLocation,
    description,
    url: window.location.href,
    // which source won — surfaced in the popup so failures are diagnosable
    companySource: ld.company ? "json-ld" : ogCompany ? "og:title" : domCompany ? "dom" : slugCompany ? "url" : "none",
    titleSource: !title
      ? "none"
      : ld.title
        ? "json-ld"
        : ogTitle
          ? "og:title"
          : domTitle
            ? "dom"
            : "none"
  };
}

function renderLinks(ulId, items) {
  const ul = $(ulId);
  ul.innerHTML = "";
  for (const { label, url } of items) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.textContent = label;
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    li.appendChild(a);
    ul.appendChild(li);
  }
}

// Report what the scrape actually understood, so a bad read is visible rather
// than silently producing a nonsense query.
function renderDetection(q, ext) {
  const bits = [];
  // The head noun is what actually gets searched, so show it next to the phrase
  // it was reduced from — that reduction is the difference between a search that
  // returns people and one that returns nothing.
  if (q.rolePhrase) {
    bits.push(
      q.headNoun && q.headNoun !== q.rolePhrase.toLowerCase()
        ? `role: “${q.rolePhrase}” → searched as “${q.headNoun}”`
        : `role: “${q.rolePhrase}”`
    );
  } else {
    // Naming the source that failed turns "it doesn't work on this page" into a
    // reportable fact: "none" means all four sources missed on this layout.
    bits.push(`role: not detected (source: ${ext.titleSource || "none"}) — type it above`);
  }
  if (ext.description) {
    // What was actually read out of the body, so "it didn't read the posting" is
    // answerable at a glance instead of being a guess.
    if (q.team) bits.push(`team: ${q.team}`);
    if (q.program) bits.push(`program: ${q.program}`);
    if (q.keyPhrases?.length) bits.push(`themes: ${q.keyPhrases.slice(0, 3).join(", ")}`);
    if (!q.team && !q.program && !q.keyPhrases?.length) {
      bits.push("no team/program/themes found in the description");
    }
    bits.push(
      q.reportsTo
        ? `reports to: ${q.reportsTo}`
        : "no reporting line stated — showing entry-level peers instead"
    );
  } else {
    bits.push("description not read — scroll it into view and reopen");
  }
  bits.push(ext.companySlug ? "company page found" : "no company page — using keyword search");
  // LinkedIn links use plain keywords now. Operators are only worth mentioning
  // if the user typed some, since LinkedIn may silently drop the whole query.
  if (q.operatorCount > 0) {
    bits.push(`${q.operatorCount} Boolean operators — LinkedIn may ignore these`);
  }
  $("detect").textContent = bits.join(" · ");
  $("detect").classList.toggle("error", q.operatorCount > q.operatorBudget);
}

// Rebuild the persona link lists from whatever is in the Boolean box.
function renderFromExt(ext) {
  const q = buildQueries(ext);
  $("boolean").value = q.boolean;
  renderLinks("hm-links", q.hiringManager);
  renderLinks("sourcer-links", q.sourcer);
  renderDetection(q, ext);
}

// Rebuild after the user edits the Role/Company fields or the Boolean box.
// Those changes re-derive every query; the edited Boolean is applied only to the
// generic keyword searches, so recruiter/manager searches keep their own
// purpose-built term lists.
function rebuild(ext) {
  ext.company = $("company").value.trim();
  ext.roleName = $("role").value.trim();
  const edited = $("boolean").value.trim();
  const q = buildQueries(ext);
  // Count what the user actually typed, not what we would have generated.
  renderDetection(edited ? { ...q, operatorCount: countOperators(edited) } : q, ext);

  // The edited Boolean drives only the links flagged `editable` by the query
  // builder; every other search keeps its own purpose-built term list.
  const applyEdited = (items) =>
    items.map((item) => {
      if (!item.editable || !edited) return item;
      return {
        label: item.label,
        url: item.url.replace(/keywords=[^&]*/, `keywords=${encodeURIComponent(edited)}`)
      };
    });

  renderLinks("hm-links", applyEdited(q.hiringManager));
  renderLinks("sourcer-links", q.sourcer);
}

// ---- Email waterfall ---------------------------------------------------------

const STATUS_TEXT = {
  valid: "Verified",
  risky: "Risky: catch-all domain",
  unknown: "Unverified",
  invalid: "Invalid",
  not_found: "Not found"
};

// One lookup at a time: the background shares its caches across lookups, and
// providers rate-limit bursts.
let emailQueue = Promise.resolve();
function lookupEmail(person) {
  const run = emailQueue.then(() => sendToBg({ type: "FIND_EMAIL", person }));
  emailQueue = run.catch(() => {});
  return run;
}

function copyButton(text) {
  const b = document.createElement("button");
  b.className = "secondary small";
  b.textContent = "Copy";
  b.addEventListener("click", async () => {
    await navigator.clipboard.writeText(text);
    b.textContent = "Copied";
    setTimeout(() => (b.textContent = "Copy"), 1200);
  });
  return b;
}

function renderEmailResult(container, res) {
  container.innerHTML = "";
  if (!res?.ok) {
    container.textContent = `Lookup failed: ${res?.detail || res?.error || "unknown error"}`;
    return;
  }
  const r = res.result;
  const row = document.createElement("div");
  row.className = "email-row";
  if (r.email) {
    const e = document.createElement("span");
    e.className = "email";
    e.textContent = r.email;
    row.append(e, copyButton(r.email));
  }
  const chip = document.createElement("span");
  chip.className = `chip ${r.status}`;
  chip.textContent = STATUS_TEXT[r.status] + (r.cached ? " (saved earlier)" : "");
  row.appendChild(chip);
  container.appendChild(row);

  // Nothing could be confirmed: offer the next most likely formats too.
  if (r.alternatives?.length) {
    const alt = document.createElement("div");
    alt.className = "alternatives";
    const label = document.createElement("div");
    label.className = "muted";
    label.textContent = "Other common formats:";
    alt.appendChild(label);
    for (const e of r.alternatives) {
      const line = document.createElement("div");
      line.className = "email-row";
      const s = document.createElement("span");
      s.className = "email";
      s.textContent = e;
      line.append(s, copyButton(e));
      alt.appendChild(line);
    }
    container.appendChild(alt);
  }
  if (r.domainGuessed) {
    const note = document.createElement("div");
    note.className = "muted hint";
    note.textContent = `The domain (${r.domain}) came from the company name. If they email from a different one, put it in the domain box and search again.`;
    container.appendChild(note);
  }
  if (r.email && r.status !== "valid") container.appendChild(guessDisclaimer(r.status));

  // Show the steps so "not found" says why: no key, no domain, no match.
  if (r.trace?.length) {
    const d = document.createElement("details");
    d.className = "trace";
    const s = document.createElement("summary");
    s.textContent = "How it was found";
    const ul = document.createElement("ul");
    for (const line of r.trace) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    }
    d.append(s, ul);
    container.appendChild(d);
  }
}

/**
 * Shown on every address that isn't confirmed. Most unverified results are a
 * guess at the company's usual format, and sending to a wrong guess bounces,
 * which hurts the sender's own email reputation.
 */
function guessDisclaimer(status) {
  const box = document.createElement("div");
  box.className = "disclaimer";
  const head = document.createElement("strong");
  head.textContent = status === "risky"
    ? "Can't be confirmed: this company's mail server accepts any address."
    : "This is a guess, not a confirmed address.";
  const body = document.createElement("div");
  body.textContent = status === "risky"
    ? "It's the most common format and often right, but it may bounce. "
    : "It's built from the most common email formats, so it may be wrong. ";
  body.appendChild(document.createTextNode("Check it before you send with a free verifier:"));
  const tools = document.createElement("div");
  tools.className = "tools";
  for (const [name, url] of VERIFIER_TOOLS) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = name;
    tools.appendChild(a);
  }
  const tip = document.createElement("div");
  tip.className = "muted";
  tip.textContent = "Or add a verifier key in ⚙︎ Settings to check automatically.";
  box.append(head, body, tools, tip);
  return box;
}

// ---- Saved contacts ------------------------------------------------------------

async function loadContacts() {
  const { contacts } = await chrome.storage.local.get(["contacts"]);
  return Array.isArray(contacts) ? contacts : [];
}

async function storeContacts(list) {
  await chrome.storage.local.set({ contacts: list });
  renderContacts(list);
}

/**
 * Adds or updates a contact. Works with no email too: saving someone from their
 * profile before (or instead of) looking up their address is the Apollo flow.
 */
async function saveContact(person, result, job) {
  const { first, last } = displayName(person.name);
  const contact = {
    first,
    last,
    email: result?.email || "",
    status: result?.email ? result.status : "",
    title: person.title || "",
    company: person.company || "",
    linkedin: person.linkedin || "",
    job: job?.title || "",
    jobUrl: job?.url || "",
    source: result?.source || "",
    foundOn: new Date().toISOString().slice(0, 10)
  };
  if (!contact.first && !contact.email) return null;
  const list = await loadContacts();
  const same = (c) =>
    (contact.linkedin && c.linkedin === contact.linkedin) || (contact.email && c.email === contact.email);
  const i = list.findIndex(same);
  if (i >= 0) {
    // Never wipe what's already known: a re-save without an email keeps the old one.
    const merged = { ...list[i] };
    for (const [k, v] of Object.entries(contact)) if (v) merged[k] = v;
    list[i] = merged;
  } else {
    list.push(contact);
  }
  await storeContacts(list);
  return i >= 0 ? "updated" : "added";
}

function renderContacts(list) {
  $("contact-count").textContent = String(list.length);
  $("contacts-empty").hidden = list.length > 0;
  const guesses = list.filter((c) => c.email && c.status !== "valid").length;
  $("contacts-guess-note").hidden = !guesses;
  $("contacts-guess-note").textContent = guesses
    ? `${guesses} of these ${guesses === 1 ? "is a guess" : "are guesses"} (not ✓). Verify before sending; the export marks them "unverified guess".`
    : "";
  const ul = $("contacts");
  ul.innerHTML = "";
  list.forEach((c, i) => {
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = [c.first, c.last].filter(Boolean).join(" ") + (c.email ? `: ${c.email}` : "");
    who.title = [c.title, c.company].filter(Boolean).join(" · ");
    if (c.job) {
      const job = document.createElement("span");
      job.className = "job";
      job.textContent = c.job;
      who.appendChild(job);
    }
    if (c.linkedin) {
      who.style.cursor = "pointer";
      who.addEventListener("click", () => chrome.tabs.create({ url: c.linkedin }));
    }
    const chip = document.createElement("span");
    chip.className = `chip ${c.status || "unknown"}`;
    chip.textContent = !c.email ? "no email" : c.status === "valid" ? "✓" : c.status;
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.title = "Remove";
    remove.textContent = "×";
    remove.addEventListener("click", async () => {
      const current = await loadContacts();
      current.splice(i, 1);
      await storeContacts(current);
    });
    li.append(who, chip, remove);
    ul.appendChild(li);
  });
}

function flash(text) {
  $("contacts-status").textContent = text;
  setTimeout(() => ($("contacts-status").textContent = ""), 2500);
}

function wireContacts() {
  $("copy-sheets").addEventListener("click", async () => {
    const list = await loadContacts();
    if (!list.length) return flash("No contacts yet.");
    await navigator.clipboard.writeText(contactsToTsv(list));
    flash(`Copied ${list.length}. Paste into cell A1 of a Google Sheet.`);
  });
  $("export-csv").addEventListener("click", async () => {
    const list = await loadContacts();
    if (!list.length) return flash("No contacts yet.");
    const url = URL.createObjectURL(new Blob([contactsToCsv(list)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  $("clear-contacts").addEventListener("click", async () => {
    if (!confirm("Remove all saved contacts? Export them first if you need them.")) return;
    await storeContacts([]);
  });
  loadContacts().then(renderContacts);
}

// ---- Person tab --------------------------------------------------------------

// Self-contained, like scrapePostingInPage: it's serialized into the page. Reads
// only the profile on screen, only when the popup is opened.
function scrapeProfileInPage() {
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const pick = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = clean(el?.innerText || el?.textContent);
      if (text) return text;
    }
    return "";
  };
  const isProfile = /^\/in\/[^/]+/.test(location.pathname);
  if (!isProfile) return { isProfile: false };

  let name = pick(["main h1", "h1.text-heading-xlarge", ".top-card-layout__title", "h1"]);
  if (!name) {
    // "(3) Jane Doe | LinkedIn" or "Jane Doe - Recruiter - Stripe | LinkedIn"
    name = clean(document.title.replace(/^\(\d+\+?\)\s*/, "").split("|")[0].split(" - ")[0]);
  }
  const headline = pick([
    "main .text-body-medium.break-words",
    ".pv-text-details__left-panel .text-body-medium",
    ".top-card-layout__headline"
  ]);

  // Current company: LinkedIn labels the top-card button "Current company: X".
  let company = "";
  for (const el of document.querySelectorAll('[aria-label^="Current company"]')) {
    company = clean((el.getAttribute("aria-label") || "").replace(/^Current company:?\s*/i, "").split(/\.\s|\. Click/)[0]);
    if (company) break;
  }
  if (!company) {
    company = pick([
      ".top-card-layout__first-subline .top-card-link--link",
      '[data-section="currentPositionsDetails"] .top-card-link__description'
    ]);
  }
  return { isProfile: true, name, headline, company, pathname: location.pathname };
}

async function readProfile(tab) {
  try {
    const [inj] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeProfileInPage });
    return inj?.result || null;
  } catch (e) {
    return null;
  }
}

function personStatus(text, isError = false) {
  const el = $("person-status");
  el.textContent = text || "";
  el.classList.toggle("error", isError);
  el.hidden = !text;
}

// The last posting viewed in the Job tab, so a profile opened from its searches
// is saved against that job. Ignored once it's a few days old.
const LAST_JOB_MAX_AGE_MS = 3 * 864e5;

async function rememberJob(job) {
  if (job?.title) await chrome.storage.local.set({ lastJob: { ...job, at: Date.now() } });
}

async function recentJob() {
  const { lastJob } = await chrome.storage.local.get(["lastJob"]);
  return lastJob && Date.now() - (lastJob.at || 0) < LAST_JOB_MAX_AGE_MS ? lastJob : null;
}

async function wirePerson(tab) {
  let job = await recentJob();
  const showJob = () => {
    $("person-job").hidden = !job;
    if (job) $("person-job-title").textContent = [job.title, job.company].filter(Boolean).join(" · ");
  };
  showJob();
  $("person-job-unlink").addEventListener("click", () => {
    job = null;
    showJob();
  });

  const profile = /linkedin\.com\/in\//.test(tab?.url || "") ? await readProfile(tab) : null;
  if (profile?.isProfile) {
    $("person-name").value = cleanProfileName(profile.name);
    $("person-title").value = profile.headline || "";
    $("person-company").value = profile.company || companyFromHeadline(profile.headline) || "";
    $("person-linkedin").value = profileUrl(profile.pathname);
    const missing = [!profile.name && "name", !$("person-company").value && "company"].filter(Boolean);
    personStatus(missing.length ? `Couldn't read the ${missing.join(" or ")} from this profile. Type it above.` : "");
  } else {
    personStatus("Open someone's LinkedIn profile to fill this in, or type a name and company.");
  }

  // Remembered companies fill in the domain, so the second person at a company
  // skips straight to their known email format.
  const fillDomain = async () => {
    const company = $("person-company").value.trim();
    if (!company || $("person-domain").value.trim()) return;
    const res = await sendToBg({ type: "KNOWN_DOMAIN", company });
    if (res?.domain) $("person-domain").value = res.domain;
  };
  $("person-company").addEventListener("change", fillDomain);
  await fillDomain();

  const readForm = () => ({
    name: $("person-name").value.trim(),
    title: $("person-title").value.trim(),
    company: $("person-company").value.trim(),
    domain: $("person-domain").value.trim(),
    linkedin: $("person-linkedin").value.trim()
  });

  $("person-save").addEventListener("click", async () => {
    const person = readForm();
    if (!person.name) return personStatus("Enter a name first.", true);
    const did = await saveContact(person, null, job);
    personStatus(did === "updated" ? "Updated in Saved." : "Saved.");
  });

  $("person-find").addEventListener("click", async () => {
    const person = readForm();
    const out = $("person-result");
    if (!person.name) return personStatus("Enter a name first.", true);
    if (person.domain && !normalizeDomain(person.domain)) {
      return personStatus("That domain doesn't look right. Try something like stripe.com.", true);
    }
    personStatus("");
    $("person-find").disabled = true;
    out.textContent = "Searching…";
    const res = await lookupEmail(person);
    $("person-find").disabled = false;
    renderEmailResult(out, res);
    if (res?.ok) {
      if (!person.domain && res.result.domain) $("person-domain").value = res.result.domain;
      await saveContact(person, res.result, job);
    }
  });
}

// ---- Find tab --------------------------------------------------------------------

const NEW_MS = 48 * 36e5;
const RECENCY_DAYS = { day: 1, week: 7, month: 31 };

async function boardLines() {
  const { boardList } = await chrome.storage.sync.get(["boardList"]);
  return typeof boardList === "string" && boardList.trim() ? boardList.split("\n") : DEFAULT_BOARDS;
}

function renderBoardJobs(jobs) {
  const ul = $("board-results");
  ul.innerHTML = "";
  for (const j of jobs.slice(0, 150)) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = j.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "name";
    a.textContent = j.title;
    if (j.postedAt && Date.now() - j.postedAt < NEW_MS) {
      const badge = document.createElement("span");
      badge.className = "new";
      badge.textContent = "NEW";
      a.appendChild(badge);
    }
    const role = document.createElement("div");
    role.className = "role";
    role.textContent = [j.company, j.location].filter(Boolean).join(" · ");
    const posted = document.createElement("div");
    posted.className = "posted";
    posted.textContent = [j.postedAt ? `Posted ${ago(j.postedAt)}` : "", j.jobId ? `Job ID ${j.jobId}` : ""]
      .filter(Boolean).join(" · ");
    if (j.deadline) {
      const closes = document.createElement("span");
      closes.className = "closes";
      closes.textContent = ` · Closes ${new Date(j.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      posted.appendChild(closes);
    }
    li.append(a, role, posted);
    ul.appendChild(li);
  }
}

// The five boards that carry most internship postings, picked by default.
const DEFAULT_PICKS = ["Greenhouse", "Lever", "Ashby", "Workday", "Eightfold"];

function wireFind() {
  // Country list: "Any" plus the countries most internships are in.
  const countrySel = $("find-country");
  for (const [code, name] of [["", "Any"], ...COUNTRIES]) {
    const o = document.createElement("option");
    o.value = code;
    o.textContent = name;
    countrySel.appendChild(o);
  }

  // One checkbox per board.
  const picks = $("board-picks");
  for (const b of BOARD_SITES) {
    const label = document.createElement("label");
    label.className = "pick";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = b.label;
    label.append(box, document.createTextNode(b.label));
    picks.appendChild(label);
  }
  const chosen = () => [...picks.querySelectorAll("input:checked")].map((i) => i.value);
  const setChosen = (labels) => picks.querySelectorAll("input").forEach((i) => (i.checked = labels.includes(i.value)));

  const filters = () => ({
    role: $("find-role").value.trim(),
    term: $("find-term").value,
    recency: $("find-recency").value,
    country: countrySel.value,
    boards: chosen()
  });
  const save = () => chrome.storage.sync.set({ findFilters: filters() });

  const updateSearchNote = () => {
    const f = filters();
    const n = buildBoardSearch(f.boards, f).length;
    $("board-search").disabled = !f.boards.length;
    $("board-search").textContent = n > 1 ? `Search on Google (${n} tabs)` : "Search on Google";
    const notes = [];
    if (n > 1) notes.push("Google reads only about 32 words per search, so these boards are split across tabs.");
    if (f.country) notes.push("Google matches pages that mention the country; postings that only list a city may be missed.");
    $("board-search-note").textContent = notes.join(" ");
  };
  const renderSearches = updateSearchNote;

  // Filters persist, so the tab opens the way you left it.
  chrome.storage.sync.get(["findFilters"]).then(({ findFilters }) => {
    const f = findFilters || {};
    $("find-role").value = f.role || "";
    $("find-term").value = f.term ?? "Summer 2027";
    $("find-recency").value = f.recency ?? "week";
    countrySel.value = f.country || "";
    setChosen(Array.isArray(f.boards) ? f.boards : DEFAULT_PICKS);
    updateSearchNote();
  });

  picks.addEventListener("change", () => { save(); updateSearchNote(); });
  $("board-all").addEventListener("click", () => { setChosen(BOARD_SITES.map((b) => b.label)); save(); updateSearchNote(); });
  $("board-none").addEventListener("click", () => { setChosen([]); save(); updateSearchNote(); });
  $("board-search").addEventListener("click", () => {
    const f = filters();
    buildBoardSearch(f.boards, f).forEach((s, i) => chrome.tabs.create({ url: s.url, active: i === 0 }));
  });

  let lastJobs = null;
  const applyFilters = () => {
    if (!lastJobs) return;
    const f = filters();
    // The role box takes comma-separated keywords; any one is a match.
    const shown = filterJobs(lastJobs, {
      keywords: f.role, term: f.term, country: f.country, sinceDays: RECENCY_DAYS[f.recency] || 0
    });
    renderBoardJobs(shown);
    const fresh = shown.filter((j) => Date.now() - j.postedAt < NEW_MS).length;
    $("boards-status").textContent = `${shown.length} internships match${fresh ? `, ${fresh} new` : ""} (of ${lastJobs.length} open across these companies).`;
  };
  for (const id of ["find-role", "find-term", "find-recency", "find-country"]) {
    $(id).addEventListener("change", () => {
      save();
      renderSearches();
      applyFilters();
    });
  }

  const check = async (force) => {
    $("boards-check").disabled = true;
    $("boards-status").textContent = "Checking company boards…";
    const res = await sendToBg({ type: "CHECK_BOARDS", lines: await boardLines(), force });
    $("boards-check").disabled = false;
    if (!res?.ok) {
      $("boards-status").textContent = `Couldn't check the boards: ${res?.detail || res?.error || "unknown error"}`;
      return;
    }
    lastJobs = res.jobs;
    applyFilters();
    const notes = [];
    if (res.unknown.length) notes.push(`Not on Greenhouse, Lever, or Ashby: ${res.unknown.join(", ")}. Try the Google searches for those.`);
    if (res.errors.length) notes.push(`Couldn't read: ${res.errors.join(", ")}.`);
    if (notes.length) $("boards-status").textContent += " " + notes.join(" ");
  };
  $("boards-check").addEventListener("click", () => check(true));

  $("boards-edit").addEventListener("click", async () => {
    const ed = $("boards-editor");
    ed.hidden = !ed.hidden;
    if (!ed.hidden) $("boards-list").value = (await boardLines()).join("\n");
  });
  $("boards-save").addEventListener("click", async () => {
    await chrome.storage.sync.set({ boardList: $("boards-list").value });
    $("boards-editor").hidden = true;
    check(false);
  });
  $("boards-reset").addEventListener("click", async () => {
    await chrome.storage.sync.remove("boardList");
    $("boards-list").value = DEFAULT_BOARDS.join("\n");
  });

  // Results from the last 30 minutes come back instantly from the cache.
  check(false);
}

// ---- Tabs ------------------------------------------------------------------------

function showTab(name) {
  for (const btn of document.querySelectorAll(".tab")) {
    btn.setAttribute("aria-selected", String(btn.dataset.tab === name));
  }
  for (const id of ["job", "person", "find", "saved"]) $(`panel-${id}`).hidden = id !== name;
}

function wireTabs() {
  for (const btn of document.querySelectorAll(".tab")) {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  }
}

function renderPeople(people, ext, job) {
  const ul = $("pdl-results");
  ul.innerHTML = "";
  $("find-all-emails").hidden = !people.length;
  if (!people.length) {
    $("pdl-status").textContent = "No matches returned.";
    return;
  }
  const runners = [];
  for (const p of people) {
    const li = document.createElement("li");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;
    const role = document.createElement("div");
    role.className = "role";
    role.textContent = [p.title, p.company, p.location].filter(Boolean).join(" · ");
    li.append(name, role);
    if (p.linkedin) {
      const a = document.createElement("a");
      a.href = p.linkedin;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "LinkedIn profile ↗";
      li.appendChild(a);
    }

    const find = document.createElement("button");
    find.className = "secondary small";
    find.textContent = "Find email";
    const out = document.createElement("div");
    const person = {
      name: p.name,
      title: p.title,
      company: p.company || ext.company,
      domain: p.domain,
      linkedin: p.linkedin,
      workEmail: p.workEmail
    };
    const run = async () => {
      find.disabled = true;
      out.textContent = "Searching…";
      const res = await lookupEmail(person);
      renderEmailResult(out, res);
      find.disabled = false;
      find.textContent = "Retry";
      if (res?.ok) await saveContact(person, res.result, job);
    };
    find.addEventListener("click", run);
    runners.push(run);
    // PDL withholds names on some plans; there's nothing to build an address from.
    if (p.name === "(name withheld)") find.disabled = true;
    li.append(find, out);
    ul.appendChild(li);
  }

  const all = $("find-all-emails");
  all.onclick = async () => {
    all.disabled = true;
    for (let i = 0; i < runners.length; i++) {
      all.textContent = `Finding ${i + 1} of ${runners.length}…`;
      await runners[i]();
    }
    all.textContent = "Find all emails";
    all.disabled = false;
  };
}

function wirePdl(ext, job) {
  const run = async (mode, label) => {
    const status = $("pdl-status");
    $("pdl-results").innerHTML = "";
    // Honor a company typed into the field even if nothing was scraped.
    ext.company = $("company").value.trim() || ext.company;
    if (!ext.company) {
      status.textContent = "No company detected on this posting.";
      return;
    }
    status.textContent = `Searching ${label} at ${ext.company}…`;
    const res = await sendToBg({
      type: "PDL_SEARCH",
      params: {
        company: ext.company,
        titles: ext.titles,
        mode,
        earlyCareer: isEarlyCareer(ext)
      }
    });
    if (!res?.ok) {
      const hints = {
        "no-key": "Add a People Data Labs API key in ⚙︎ settings.",
        "no-company": "No company detected on this posting.",
        exception: "Request failed — check your connection."
      };
      status.textContent = hints[res?.error] || `PDL error: ${res?.error}${res?.detail ? ` — ${res.detail}` : ""}`;
      return;
    }
    status.textContent = `${res.people.length} shown (of ~${res.total}).`;
    renderPeople(res.people, ext, job);
  };

  const early = isEarlyCareer(ext);
  const recruiterLabel = early ? "university / early-career recruiters" : "recruiters / hiring managers";
  if (early) $("find-recruiters").textContent = "Find university recruiters";
  $("find-recruiters").addEventListener("click", () => run("recruiters", recruiterLabel));
  $("find-peers").addEventListener("click", () => run("peers", "people in this role"));
}

async function initJobTab(tab) {
  setStatus("Reading posting…");

  // Primary: inject the scrape on demand (works regardless of when the
  // extension was loaded). Fallback: message the declared content script.
  let posting = null;
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePostingInPage
    });
    if (inj?.result?.title || inj?.result?.description) posting = inj.result;
  } catch (e) {
    // executeScript can fail on restricted pages; fall through to messaging.
  }
  if (!posting) {
    const scraped = await sendToTab(tab.id, { type: "SCRAPE_POSTING" });
    if (scraped?.ok && scraped.posting) posting = scraped.posting;
  }

  if (!posting || !(posting.title || posting.description)) {
    setStatus(
      "Couldn't read this page. Make sure a job posting is open (URL has /jobs/view/…), " +
        "scroll the description into view, then reopen the extension. If you just installed it, reload the LinkedIn tab first.",
      true
    );
    return;
  }
  // Never substitute a placeholder for the title: "this role" and the company
  // name both end up quoted inside the Boolean as if they were the job title.
  $("job-title").textContent = posting.title || "(role not detected)";
  $("job-company").textContent = [posting.company, posting.location].filter(Boolean).join(" · ");

  const { extractionMode } = await chrome.storage.sync.get(["extractionMode"]);
  let ext = null;

  if (extractionMode === "claude") {
    setStatus("Extracting with Claude…");
    const res = await sendToBg({ type: "EXTRACT_CLAUDE", posting });
    if (res?.ok) {
      ext = res.ext;
    } else {
      setStatus(
        res?.error === "no-key"
          ? "No API key set — using local extraction. Add a key in ⚙︎ settings."
          : `Claude extraction failed (${res?.error}) — using local extraction.`,
        true
      );
    }
  }

  if (!ext) ext = extractLocal(posting);

  // Carry the original posting title and description so "role + hiring" and
  // early-career detection anchor on the real text, not a derived title.
  ext.roleName = posting.title || "";
  ext.description = posting.description || "";
  ext.companySlug = posting.companySlug || "";
  if (!ext.company) ext.company = posting.company || "";

  $("src-badge").textContent = ext.source;
  if (ext.source === "local" && extractionMode !== "claude") setStatus("");
  else if (ext.source === "claude") setStatus("");

  $("posting").hidden = false;
  renderFromExt(ext);

  const job = { title: posting.title || "", url: posting.url || tab.url || "", company: ext.company || posting.company || "" };
  await rememberJob(job);
  wirePdl(ext, job);

  $("company").value = ext.company || "";
  $("role").value = ext.roleName || "";
  if (!ext.company) {
    $("company").placeholder = "Not detected — type the company name";
    setStatus("Company not detected on this page — enter it above to enable company-scoped searches.", true);
  }
  if (!ext.roleName) {
    $("role").placeholder = "Not detected — type the job title";
    setStatus("Role not detected on this page — type it above, or use the broad company-wide searches.", true);
  }
  $("company").addEventListener("change", () => rebuild(ext));
  $("role").addEventListener("change", () => rebuild(ext));
  $("rebuild").addEventListener("click", () => rebuild(ext));
  $("copy-bool").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("boolean").value);
    $("copy-bool").textContent = "Copied";
    setTimeout(() => ($("copy-bool").textContent = "Copy"), 1200);
  });
}

async function main() {
  $("settings-link").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  wireTabs();
  wireContacts();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  const onLinkedIn = /^https:\/\/([\w-]+\.)?linkedin\.com\//.test(url);
  const onProfile = onLinkedIn && /linkedin\.com\/in\//.test(url);

  // Open on the tab that matches the page: a profile goes straight to Person,
  // and anywhere off LinkedIn opens Find.
  showTab(onProfile ? "person" : onLinkedIn ? "job" : "find");
  wireFind();
  await wirePerson(tab);

  if (!onLinkedIn) {
    setStatus("Open a LinkedIn job posting to find the people behind it.", true);
    return;
  }
  if (onProfile) {
    setStatus("This is a profile. Use the Person tab, or open a job posting for this tab.");
    return;
  }
  await initJobTab(tab);
}

main();
