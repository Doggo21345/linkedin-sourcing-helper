// Service worker: proxies Claude extraction, People Data Labs search, and the
// email waterfall so API keys and CORS handling stay out of page context.
// Claude falls back to null on any failure (popup then uses local extraction).

import { findEmail, DEFAULT_STEPS, normalizeDomain } from "./lib/email.js";
import { BOARD_API, normalizeJobs, isInternship, parseBoardEntry, slugsFor } from "./lib/boards.js";
import { dueFollowUps } from "./lib/crm.js";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

// The reader is a job seeker trying to find the right humans to talk to, so the
// fields asked for here are the ones that name humans: the team, the program,
// the reporting line. Titles/skills alone produced generic searches.
const SYSTEM_PROMPT = `You extract structured signals from a job posting for a job seeker who wants to find the right people to contact.
Return ONLY minified JSON matching:
{"titles":[string],"skills":[string],"team":string,"program":string,"reportsTo":string,"keyPhrases":[string],"company":string,"location":string}
- titles: 3-6 likely job titles a matching candidate would use, including seniority and common synonyms/abbreviations (e.g. "Senior Software Engineer","SDE").
- skills: up to 10 concrete skills/technologies/domain competencies named or strongly implied. For non-technical roles use the domain terms the posting actually uses (e.g. "media relations","earned media"), not technologies.
- team: the specific team/org/group/division the role sits in, exactly as named in the posting (e.g. "Earned Media","Payments Platform"). "" if not stated. Do NOT guess from the title.
- program: the named early-career/internship program, if any (e.g. "State Farm University Internship Program"). "" otherwise.
- reportsTo: the job title this role reports to, if the posting states one (e.g. "Director of Analytics"). "" otherwise. Never invent one.
- keyPhrases: up to 5 short phrases that are the recurring themes of the responsibilities/qualifications, in the posting's own words.
- company/location: as stated, else "".
Anything not actually stated in the posting must be "" or []. No prose, no markdown fences.`;

async function extractWithClaude(posting) {
  const { anthropicApiKey, model } = await chrome.storage.sync.get(["anthropicApiKey", "model"]);
  if (!anthropicApiKey) return { ok: false, error: "no-key" };

  const userContent = `TITLE: ${posting.title}
COMPANY: ${posting.company}
LOCATION: ${posting.location}
DESCRIPTION:
${(posting.description || "").slice(0, 8000)}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }]
    })
  });

  if (!resp.ok) {
    const body = await resp.text();
    return { ok: false, error: `api-${resp.status}`, detail: body.slice(0, 500) };
  }

  const data = await resp.json();
  const raw = (data.content?.[0]?.text || "").trim().replace(/^```(json)?|```$/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "parse", detail: raw.slice(0, 300) };
  }

  return {
    ok: true,
    ext: {
      titles: Array.isArray(parsed.titles) ? parsed.titles : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      keyPhrases: Array.isArray(parsed.keyPhrases) ? parsed.keyPhrases : [],
      team: typeof parsed.team === "string" ? parsed.team.trim() : "",
      program: typeof parsed.program === "string" ? parsed.program.trim() : "",
      // Claude's reading of the reporting line, used only when the regex in
      // lib/query.js finds nothing in the raw text.
      reportsToHint: typeof parsed.reportsTo === "string" ? parsed.reportsTo.trim() : "",
      company: parsed.company || posting.company || "",
      location: parsed.location || posting.location || "",
      source: "claude"
    }
  };
}

// ---- People Data Labs person search ----------------------------------------
// mode "recruiters": people in HR/recruiting/hiring-manager roles at the company
//   (who a job seeker would contact). mode "peers": people already in the role.

const RECRUITER_TITLE_TERMS = [
  "recruiter", "technical recruiter", "talent acquisition",
  "hiring manager", "talent partner", "sourcer", "people operations"
];

// At tech companies the people who own intern/new-grad pipelines are often
// titled "technical sourcer" / "engineering recruiter", not "university".
const EARLY_CAREER_RECRUITER_TERMS = [
  "university recruiter", "university recruiting", "campus recruiter",
  "campus recruiting", "early career recruiter", "early careers",
  "early talent", "emerging talent", "student programs", "intern program",
  "new grad recruiter", "technical recruiter", "technical sourcer",
  "engineering recruiter"
];

function pdlQuery({ company, titles, location, mode, earlyCareer }) {
  const should = [];
  if (mode === "recruiters") {
    const terms = earlyCareer ? EARLY_CAREER_RECRUITER_TERMS : RECRUITER_TITLE_TERMS;
    for (const t of terms) should.push({ match: { job_title: t } });
    should.push({ term: { job_title_role: "human_resources" } });
  } else {
    for (const t of (titles || []).slice(0, 6)) should.push({ match: { job_title: t } });
  }

  // Company only. A location filter here excluded too many valid people
  // (remote recruiters, HQ-based staff) for the value it added.
  const must = [{ match: { job_company_name: company } }];

  return {
    bool: {
      must,
      should,
      minimum_should_match: should.length ? 1 : 0
    }
  };
}

async function pdlSearch(params) {
  const { pdlApiKey } = await chrome.storage.sync.get(["pdlApiKey"]);
  if (!pdlApiKey) return { ok: false, error: "no-key" };
  if (!params.company) return { ok: false, error: "no-company" };

  const resp = await fetch("https://api.peopledatalabs.com/v5/person/search", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Api-Key": pdlApiKey },
    body: JSON.stringify({ query: pdlQuery(params), size: 10, pretty: false })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false, error: `api-${resp.status}`, detail: (data?.error?.message || "").slice(0, 300) };
  }

  const people = (data.data || []).map((p) => ({
    name: p.full_name || "(name withheld)",
    title: p.job_title || "",
    company: p.job_company_name || "",
    location: p.location_name || "",
    linkedin: p.linkedin_url ? (/^https?:\/\//.test(p.linkedin_url) ? p.linkedin_url : `https://www.${p.linkedin_url}`) : "",
    // Paid plans return the address; free plans return `true`. The waterfall
    // only uses it when it's a string.
    workEmail: typeof p.work_email === "string" ? p.work_email : "",
    domain: p.job_company_website || ""
  }));
  return { ok: true, people, total: data.total ?? people.length };
}

// ---- Email waterfall -----------------------------------------------------------

async function http(url, opts = {}) {
  // A hung provider would otherwise stall every step behind it.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const resp = await fetch(url, { ...opts, signal: ctrl.signal });
    const json = await resp.json().catch(() => null);
    return { status: resp.status, json };
  } catch (e) {
    return { status: 0, json: { error: e.name === "AbortError" ? "timed out" : String(e) } };
  } finally {
    clearTimeout(timer);
  }
}

// "Stripe, Inc." and "stripe" are one company for the domain lookup.
function companyKey(company) {
  return String(company || "").toLowerCase().replace(/\b(inc|llc|ltd|corp|corporation|co)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
}

async function knownDomain(company) {
  const { companyDomains } = await chrome.storage.local.get(["companyDomains"]);
  return (companyDomains || {})[companyKey(company)] || "";
}

function cacheKey(person) {
  return (person.linkedin || `${person.name}@${person.domain || person.company}`).toLowerCase().trim();
}

async function emailLookup(person, force) {
  const sync = await chrome.storage.sync.get([
    "hunterApiKey", "pdlApiKey", "zerobounceApiKey", "millionverifierApiKey",
    "emailVerifier", "emailSteps", "maxVerifications", "maxGuesses"
  ]);
  const local = await chrome.storage.local.get(["emailCache", "emailPatterns", "catchAllDomains", "companyDomains"]);
  const companyDomains = local.companyDomains || {};
  const cache = local.emailCache || {};
  // Keyed on what was asked, before the domain is filled in below, so the same
  // lookup always hits the same cache entry.
  const key = cacheKey(person);
  // A domain learned from an earlier lookup at this company lets the waterfall
  // start from the company's known email format instead of a finder call.
  if (!person.domain && person.company) person = { ...person, domain: companyDomains[companyKey(person.company)] || "" };

  // Only confident results are cached; a miss might succeed after adding a key.
  if (!force && cache[key]) return { ok: true, result: { ...cache[key], cached: true } };

  const cfg = {
    keys: {
      hunter: sync.hunterApiKey || "",
      pdl: sync.pdlApiKey || "",
      zerobounce: sync.zerobounceApiKey || "",
      millionverifier: sync.millionverifierApiKey || ""
    },
    verifier: sync.emailVerifier || "auto",
    steps: Array.isArray(sync.emailSteps) ? sync.emailSteps : DEFAULT_STEPS,
    maxVerifications: Number(sync.maxVerifications) || 4,
    maxGuesses: Number(sync.maxGuesses) || 3
  };
  const deps = {
    http,
    patterns: local.emailPatterns || {},
    catchAll: local.catchAllDomains || {}
  };

  const result = await findEmail(person, cfg, deps);
  if (result.status === "valid" || result.status === "risky") cache[key] = result;
  if (person.company && result.domain && (result.status === "valid" || result.status === "risky")) {
    companyDomains[companyKey(person.company)] = normalizeDomain(result.domain);
  }
  await chrome.storage.local.set({
    emailCache: cache, emailPatterns: deps.patterns, catchAllDomains: deps.catchAll, companyDomains
  });
  return { ok: true, result };
}

// ---- Job boards ----------------------------------------------------------------

const BOARD_CACHE_MS = 30 * 60 * 1000;

async function fetchJson(url) {
  const r = await http(url);
  return r.status === 200 ? r.json : null;
}

/** {board, slug} for a company name, trying each board in turn. Remembered, misses included. */
async function resolveBoard(name, resolved) {
  const key = name.toLowerCase();
  if (key in resolved) return resolved[key];
  let found = null;
  outer: for (const slug of slugsFor(name)) {
    for (const board of ["greenhouse", "lever", "ashby"]) {
      if (normalizeJobs(board, slug, await fetchJson(BOARD_API[board](slug)))) {
        found = { board, slug };
        break outer;
      }
    }
  }
  resolved[key] = found;
  return found;
}

/**
 * Internship postings from every board in the list. Only internships are kept
 * in the cache: a big company's board is hundreds of jobs and storage is small.
 */
async function checkBoards(lines, force) {
  const local = await chrome.storage.local.get(["boardCache", "boardResolve"]);
  const cache = local.boardCache || {};
  const resolved = local.boardResolve || {};
  const unknown = [];
  const errors = [];
  const entries = [];
  for (const line of lines) {
    const e = parseBoardEntry(line);
    if (!e) continue;
    if (e.board) entries.push(e);
    else {
      const r = await resolveBoard(e.name, resolved);
      if (r) entries.push(r);
      else unknown.push(e.name);
    }
  }

  const jobs = [];
  const queue = [...entries];
  // A few at a time: fast enough, and polite to the boards.
  const worker = async () => {
    while (queue.length) {
      const { board, slug } = queue.shift();
      const key = `${board}:${slug}`;
      const hit = cache[key];
      if (!force && hit && Date.now() - hit.at < BOARD_CACHE_MS) {
        jobs.push(...hit.jobs);
        continue;
      }
      const list = normalizeJobs(board, slug, await fetchJson(BOARD_API[board](slug)));
      if (!list) {
        errors.push(key);
        continue;
      }
      const interns = list.filter((j) => isInternship(j.title));
      cache[key] = { at: Date.now(), jobs: interns };
      jobs.push(...interns);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  await chrome.storage.local.set({ boardCache: cache, boardResolve: resolved });
  return { ok: true, jobs, checked: entries.length, unknown, errors };
}

// ---- AI personalization (the user's own Claude key) ----------------------------

const MESSAGE_RULES = {
  connect: (limit) => `a LinkedIn connection note of at most ${limit} characters, one or two sentences`,
  message: () => "a LinkedIn message of at most 120 words",
  email: () => "an email: a short subject line and a body of at most 150 words",
  followup: () => "a polite follow-up of at most 60 words"
};

const AI_SYSTEM = `You rewrite a student's outreach message to one specific person about a job, so it reads like the student wrote it for that person.
Rules:
- Use ONLY the facts provided. Never invent experiences, numbers, projects, mutual connections, or anything about the recipient beyond their title and company.
- Keep any [bracketed placeholders] exactly as they are. Keep the Job ID if one is given.
- Warm, specific, plain. No flattery, no clichés ("I hope this finds you well"), no emojis, no exclamation-mark pileups.
- One clear, small ask.
Return ONLY minified JSON: {"subject": string, "body": string}. Use "" for subject unless it's an email.`;

function trimTo(text, limit) {
  if (!limit || text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > limit * 0.6 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

async function aiMessage({ kind, draft, person, job, me, limit }) {
  const { anthropicApiKey, model } = await chrome.storage.sync.get(["anthropicApiKey", "model"]);
  if (!anthropicApiKey) return { ok: false, error: "no-key" };
  const rule = (MESSAGE_RULES[kind] || MESSAGE_RULES.message)(limit);
  const facts = {
    recipient: { name: person?.name, title: person?.title, company: person?.company },
    job: { title: job?.title, company: job?.company, jobId: job?.reqId || "" },
    sender: me || {},
    draft
  };
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 600,
      system: AI_SYSTEM,
      messages: [{ role: "user", content: `Write ${rule}.\n\n${JSON.stringify(facts)}` }]
    })
  });
  if (!resp.ok) return { ok: false, error: `api-${resp.status}`, detail: (await resp.text()).slice(0, 200) };
  const data = await resp.json();
  const raw = (data.content?.[0]?.text || "").trim().replace(/^```(json)?|```$/g, "").trim();
  let out;
  try {
    out = JSON.parse(raw);
  } catch {
    return { ok: false, error: "parse", detail: raw.slice(0, 120) };
  }
  if (typeof out.body !== "string" || !out.body.trim()) return { ok: false, error: "empty" };
  return { ok: true, subject: typeof out.subject === "string" ? out.subject : "", body: trimTo(out.body.trim(), limit) };
}

// ---- Follow-up reminders --------------------------------------------------------

async function refreshFollowUps({ notify } = {}) {
  const { contacts } = await chrome.storage.local.get(["contacts"]);
  const due = dueFollowUps(Array.isArray(contacts) ? contacts : []);
  await chrome.action.setBadgeBackgroundColor({ color: "#b42318" });
  await chrome.action.setBadgeText({ text: due.length ? String(due.length) : "" });
  if (!notify || !due.length) return;

  // At most one notification a day, and none if they've been turned off.
  const { remindersOff } = await chrome.storage.sync.get(["remindersOff"]);
  const { notifiedOn } = await chrome.storage.local.get(["notifiedOn"]);
  const today = new Date().toISOString().slice(0, 10);
  if (remindersOff || notifiedOn === today) return;
  await chrome.storage.local.set({ notifiedOn: today });
  const names = due.slice(0, 3).map(({ c }) => [c.first, c.last].filter(Boolean).join(" ") + (c.company ? ` (${c.company})` : ""));
  chrome.notifications.create("followups", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: `${due.length} follow-up${due.length === 1 ? "" : "s"} due`,
    message: `${names.join(", ")}${due.length > 3 ? ", and more" : ""}. Click to write them.`,
    priority: 0
  });
}

chrome.notifications.onClicked.addListener((id) => {
  if (id === "followups") chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html?tab=saved") });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.contacts) refreshFollowUps();
});

// ---- Update check ---------------------------------------------------------------------

const MANIFEST_URL = "https://raw.githubusercontent.com/Doggo21345/linkedin-sourcing-helper/master/manifest.json";

function newer(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// Installed from a GitHub download, the extension can't update itself, so it
// checks the repo's manifest once a day and the popup says when there's a newer one.
async function checkForUpdate() {
  try {
    const r = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!r.ok) return;
    const latest = (await r.json()).version;
    const mine = chrome.runtime.getManifest().version;
    await chrome.storage.local.set({ updateAvailable: newer(latest, mine) ? latest : "" });
  } catch (e) {
    // Offline or GitHub unreachable: try again tomorrow.
  }
}

// ---- Lifecycle -------------------------------------------------------------------------

function scheduleAlarms() {
  chrome.alarms.create("followups", { periodInMinutes: 60 });
  chrome.alarms.create("update-check", { periodInMinutes: 24 * 60, delayInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  scheduleAlarms();
  refreshFollowUps();
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
});
chrome.runtime.onStartup.addListener(() => {
  scheduleAlarms();
  refreshFollowUps({ notify: true });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "followups") refreshFollowUps({ notify: true });
  if (alarm.name === "update-check") checkForUpdate();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "AI_MESSAGE") {
    aiMessage(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: "exception", detail: String(e) }));
    return true;
  }
  if (msg?.type === "CHECK_BOARDS") {
    checkBoards(msg.lines || [], msg.force)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: "exception", detail: String(e) }));
    return true;
  }
  if (msg?.type === "KNOWN_DOMAIN") {
    knownDomain(msg.company).then((domain) => sendResponse({ domain }));
    return true;
  }
  if (msg?.type === "FIND_EMAIL") {
    emailLookup(msg.person, msg.force)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: "exception", detail: String(e) }));
    return true;
  }
  if (msg?.type === "PDL_SEARCH") {
    pdlSearch(msg.params)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: "exception", detail: String(e) }));
    return true;
  }
  if (msg?.type === "EXTRACT_CLAUDE") {
    extractWithClaude(msg.posting)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: "exception", detail: String(e) }));
    return true; // async
  }
});
