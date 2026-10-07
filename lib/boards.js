// Finding internships at the source: Google searches scoped to the job boards
// companies post on, and a live read of companies' public Greenhouse, Lever,
// and Ashby boards. Pure, so test/run.py can check it; background.js fetches.

// Where companies host their postings. Google indexes these, which finds
// internships at companies you'd never have thought to check.
export const BOARD_SITES = [
  { label: "Greenhouse", sites: ["boards.greenhouse.io", "job-boards.greenhouse.io"] },
  { label: "Lever", sites: ["jobs.lever.co"] },
  { label: "Ashby", sites: ["jobs.ashbyhq.com"] },
  { label: "Workday", sites: ["myworkdayjobs.com"] },
  { label: "Eightfold", sites: ["eightfold.ai"] },
  { label: "SmartRecruiters", sites: ["jobs.smartrecruiters.com"] },
  { label: "iCIMS", sites: ["icims.com"] },
  { label: "Jobvite", sites: ["jobs.jobvite.com"] },
  { label: "Workable", sites: ["apply.workable.com"] }
];

// Google's own recency filter (the "Tools > Any time" menu).
const RECENCY = { day: "qdr:d", week: "qdr:w", month: "qdr:m" };

function googleUrl(q, recency) {
  const tbs = RECENCY[recency] ? `&tbs=${RECENCY[recency]}` : "";
  return `https://www.google.com/search?q=${encodeURIComponent(q)}${tbs}`;
}

/** [{label, url}]: one Google search per board, plus all of them at once. */
export function buildBoardSearches({ role = "", term = "", recency = "" } = {}) {
  const parts = ["(intern OR internship)"];
  if (term) parts.push(`"${term}"`);
  if (role.trim()) parts.push(`"${role.trim()}"`);
  const rest = parts.join(" ");
  const siteClause = (sites) => (sites.length === 1 ? `site:${sites[0]}` : `(${sites.map((s) => `site:${s}`).join(" OR ")})`);

  // Google stops reading a query after about 32 words, so "all boards" uses the
  // five that carry most internship postings rather than every site.
  const top = BOARD_SITES.slice(0, 5).flatMap((b) => b.sites);
  return [
    { label: "All major boards", url: googleUrl(`${siteClause(top)} ${rest}`, recency) },
    ...BOARD_SITES.map((b) => ({ label: b.label, url: googleUrl(`${siteClause(b.sites)} ${rest}`, recency) }))
  ];
}

// ---- Live board check ----------------------------------------------------------

// Checked against the live boards on 2026-10-07. Companies not here are usually
// on Workday or their own site -- the Google searches above cover those.
export const DEFAULT_BOARDS = [
  "greenhouse:stripe", "greenhouse:figma", "greenhouse:duolingo", "greenhouse:robinhood",
  "greenhouse:coinbase", "greenhouse:datadog", "greenhouse:pinterest", "greenhouse:reddit",
  "greenhouse:lyft", "greenhouse:roblox", "greenhouse:cloudflare", "greenhouse:databricks",
  "greenhouse:anthropic", "greenhouse:affirm", "greenhouse:samsara", "greenhouse:point72",
  "greenhouse:imc", "greenhouse:mongodb", "greenhouse:elastic", "greenhouse:toast",
  "greenhouse:waymo", "greenhouse:scaleai", "greenhouse:verkada", "greenhouse:rubrik",
  "greenhouse:vercel", "greenhouse:epicgames", "greenhouse:block", "greenhouse:doordashusa",
  "greenhouse:airbnb", "greenhouse:instacart",
  "lever:palantir", "lever:shieldai",
  "ashby:openai", "ashby:ramp", "ashby:notion", "ashby:snowflake", "ashby:perplexity",
  "ashby:cohere", "ashby:harvey"
];

const BOARD_HOSTS = [
  ["greenhouse", /(?:boards|job-boards)\.greenhouse\.io\/([\w-]+)/i],
  ["lever", /jobs\.lever\.co\/([\w-]+)/i],
  ["ashby", /jobs\.ashbyhq\.com\/([\w-]+)/i]
];

/**
 * One line of the board list -> {board, slug} or {name} to look up.
 * Accepts "greenhouse:stripe", a board URL ("jobs.lever.co/palantir"), or a
 * plain company name ("Jane Street"), which gets tried on all three boards.
 */
export function parseBoardEntry(line) {
  const s = String(line || "").trim();
  if (!s || s.startsWith("#")) return null;
  const pref = s.match(/^(greenhouse|lever|ashby)\s*:\s*([\w-]+)$/i);
  if (pref) return { board: pref[1].toLowerCase(), slug: pref[2].toLowerCase() };
  for (const [board, re] of BOARD_HOSTS) {
    const m = s.match(re);
    if (m) return { board, slug: m[1].toLowerCase() };
  }
  return { name: s };
}

/** Board slugs to try for a company name: "Jane Street" -> ["janestreet", "jane-street"]. */
export function slugsFor(name) {
  const words = String(name || "").toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b\.?/g, "")
    .match(/[a-z0-9]+/g) || [];
  return words.length ? [...new Set([words.join(""), words.join("-")])] : [];
}

export const BOARD_API = {
  greenhouse: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
  lever: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
  ashby: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`
};

const titleCase = (s) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const toMs = (v) => {
  const n = typeof v === "number" ? v : Date.parse(v || "");
  return Number.isFinite(n) ? n : 0;
};

/** A board's API response -> [{title, company, location, url, postedAt, deadline, jobId}], or null if it isn't one. */
export function normalizeJobs(board, slug, data) {
  if (board === "greenhouse" && Array.isArray(data?.jobs)) {
    return data.jobs.map((j) => ({
      title: j.title || "",
      company: j.company_name || titleCase(slug),
      location: j.location?.name || "",
      url: j.absolute_url || "",
      postedAt: toMs(j.first_published || j.updated_at),
      deadline: toMs(j.application_deadline),
      jobId: String(j.id || "")
    }));
  }
  if (board === "lever" && Array.isArray(data)) {
    return data.map((j) => ({
      title: j.text || "",
      company: titleCase(slug),
      location: j.categories?.location || "",
      url: j.hostedUrl || "",
      postedAt: toMs(j.createdAt),
      deadline: 0,
      jobId: String(j.id || "")
    }));
  }
  if (board === "ashby" && Array.isArray(data?.jobs)) {
    return data.jobs
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        title: j.title || "",
        company: titleCase(slug),
        location: j.location || "",
        url: j.jobUrl || "",
        postedAt: toMs(j.publishedAt),
        deadline: 0,
        jobId: String(j.id || "")
      }));
  }
  return null;
}

// Whole words only: "International" and "Internal" contain "intern".
const INTERN_RE = /\b(?:interns?|internships?|co-?ops?|summer analysts?|summer associates?)\b/i;

export function isInternship(title) {
  return INTERN_RE.test(title || "");
}

const SEASONS = ["winter", "spring", "summer", "fall", "autumn"];

/**
 * Does a title fit the chosen term? Many titles name no term at all, and those
 * are kept: dropping them would hide most of what's open. A title that names a
 * different year or season is the only thing filtered out.
 */
export function fitsTerm(title, term) {
  if (!term) return true;
  const t = (title || "").toLowerCase();
  const [season, year] = term.toLowerCase().split(/\s+/);
  const years = t.match(/\b20\d{2}\b/g) || [];
  if (year && years.length && !years.includes(year)) return false;
  const named = SEASONS.filter((s) => new RegExp(`\\b${s}\\b`).test(t)).map((s) => (s === "autumn" ? "fall" : s));
  if (season && named.length && !named.includes(season)) return false;
  return true;
}

/**
 * Internships matching the filters, newest first.
 * keywords: comma-separated; a title must contain at least one ("software, data").
 */
export function filterJobs(jobs, { keywords = "", term = "", sinceDays = 0, now = Date.now() } = {}) {
  const words = keywords.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  const since = sinceDays > 0 ? now - sinceDays * 864e5 : 0;
  return jobs
    .filter((j) => isInternship(j.title))
    .filter((j) => fitsTerm(j.title, term))
    .filter((j) => !words.length || words.some((w) => j.title.toLowerCase().includes(w)))
    .filter((j) => !since || j.postedAt >= since)
    .sort((a, b) => b.postedAt - a.postedAt)
    .reduce(mergeLocations, []);
}

// Companies often post one copy of an internship per city. Show it once, with
// every location, dated by its newest copy (the list is already newest first).
function mergeLocations(out, job) {
  const key = `${job.company}|${job.title}`.toLowerCase();
  const seen = out.find((j) => j._key === key);
  if (!seen) {
    out.push({ ...job, _key: key });
  } else if (job.location && !seen.location.split(" · ").includes(job.location)) {
    seen.location = [seen.location, job.location].filter(Boolean).join(" · ");
  }
  return out;
}

/** "3h ago", "2d ago", "5w ago" */
export function ago(ms, now = Date.now()) {
  if (!ms) return "";
  const h = Math.max(0, Math.round((now - ms) / 36e5));
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 14 ? `${d}d ago` : `${Math.round(d / 7)}w ago`;
}
