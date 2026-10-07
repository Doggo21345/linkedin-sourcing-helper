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

// Google stops reading a query after about 32 words.
const GOOGLE_WORD_LIMIT = 32;

// Phrases a page uses to name each country. Used only for Google searches,
// where all we can do is ask for pages that mention the country.
const COUNTRY_SEARCH = {
  US: ['"United States"', "USA"], CA: ["Canada"], GB: ['"United Kingdom"', "UK"],
  IE: ["Ireland"], DE: ["Germany"], FR: ["France"], NL: ["Netherlands"], CH: ["Switzerland"],
  IN: ["India"], SG: ["Singapore"], JP: ["Japan"], AU: ["Australia"], HK: ['"Hong Kong"'],
  MX: ["Mexico"], PL: ["Poland"], ES: ["Spain"]
};

const words = (q) => q.split(/\s+/).filter(Boolean).length;

/**
 * Google searches for the chosen boards, as few as the word limit allows:
 * [{label, url}]. Usually one; picking many boards with a long role or a
 * country splits them rather than letting Google silently drop sites.
 */
export function buildBoardSearch(boards, { role = "", term = "", recency = "", country = "" } = {}) {
  const parts = ["(intern OR internship)"];
  if (term) parts.push(`"${term}"`);
  if (role.trim()) parts.push(`"${role.trim()}"`);
  const names = COUNTRY_SEARCH[country];
  if (names) parts.push(names.length > 1 ? `(${names.join(" OR ")})` : names[0]);
  const rest = parts.join(" ");

  const chosen = BOARD_SITES.filter((b) => boards.includes(b.label));
  const searches = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const sites = group.flatMap((b) => b.sites);
    const clause = sites.length === 1 ? `site:${sites[0]}` : `(${sites.map((s) => `site:${s}`).join(" OR ")})`;
    searches.push({ label: group.map((b) => b.label).join(", "), url: googleUrl(`${clause} ${rest}`, recency) });
    group = [];
  };
  for (const b of chosen) {
    const sitesIfAdded = [...group.flatMap((g) => g.sites), ...b.sites];
    // n sites cost n "site:" words plus n-1 "OR"s.
    if (group.length && sitesIfAdded.length * 2 - 1 + words(rest) > GOOGLE_WORD_LIMIT) flush();
    group.push(b);
  }
  flush();
  return searches;
}

// ---- Where a posting is ------------------------------------------------------

export const COUNTRIES = [
  ["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["IE", "Ireland"],
  ["DE", "Germany"], ["FR", "France"], ["NL", "Netherlands"], ["CH", "Switzerland"],
  ["IN", "India"], ["SG", "Singapore"], ["JP", "Japan"], ["AU", "Australia"],
  ["HK", "Hong Kong"], ["MX", "Mexico"], ["PL", "Poland"], ["ES", "Spain"]
];

// Country names and the ISO codes postings use ("Dublin, IE", "GB-London").
const COUNTRY_NAMES = [
  ["US", /\b(?:united states(?: of america)?|u\.s\.a?\.?|usa)\b/i], ["CA", /\bcanada\b/i],
  ["GB", /\b(?:united kingdom|england|scotland|wales|great britain)\b/i], ["IE", /\bireland\b/i],
  ["DE", /\bgermany\b/i], ["FR", /\bfrance\b/i], ["NL", /\b(?:netherlands|holland)\b/i],
  ["CH", /\bswitzerland\b/i], ["IN", /\bindia\b/i], ["SG", /\bsingapore\b/i], ["JP", /\bjapan\b/i],
  ["AU", /\baustralia\b/i], ["HK", /\bhong kong\b/i], ["MX", /\bmexico\b/i], ["PL", /\bpoland\b/i],
  ["ES", /\bspain\b/i], ["RS", /\bserbia\b/i], ["RO", /\bromania\b/i], ["DK", /\bdenmark\b/i],
  ["QA", /\bqatar\b/i], ["KR", /\b(?:south korea|korea)\b/i], ["CN", /\bchina\b/i], ["BR", /\bbrazil\b/i],
  ["IL", /\bisrael\b/i], ["SE", /\bsweden\b/i], ["IT", /\bitaly\b/i], ["PT", /\bportugal\b/i],
  ["BE", /\bbelgium\b/i], ["AT", /\baustria\b/i], ["TW", /\btaiwan\b/i], ["NZ", /\bnew zealand\b/i],
  ["AE", /\b(?:united arab emirates|uae)\b/i]
];
const ISO = new Set(["US", "GB", "UK", "IE", "DE", "FR", "NL", "CH", "IN", "SG", "JP", "AU", "HK", "MX", "PL", "ES",
  "RS", "RO", "DK", "QA", "KR", "CN", "BR", "IL", "SE", "IT", "PT", "BE", "AT", "TW", "NZ", "AE"]);

const US_STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");
const US_STATE_NAMES = /\b(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|west virginia|wisconsin|wyoming|d\.c\.)\b/i;
const CA_PROVINCES = /\b(?:ON|BC|QC|AB|MB|NS|NB|NL|PE|SK)\b|\b(?:ontario|quebec|british columbia|alberta|manitoba|nova scotia)\b/i;

// Cities that often appear on their own ("Toronto", "Bangalore", "London").
const CITIES = [
  ["US", /\b(?:new york(?: city)?|nyc|san francisco|seattle|boston|chicago|austin|los angeles|bay area|silicon valley|pittsburgh|mountain view|palo alto|menlo park|sunnyvale|san jose|san mateo|atlanta|denver|dallas|miami|philadelphia|bellevue|redmond|cambridge, ma)\b/i],
  ["CA", /\b(?:toronto|montreal|montr[eé]al|vancouver|waterloo|ottawa|calgary|longueuil)\b/i],
  ["GB", /\b(?:london|manchester|edinburgh|cambridge, uk)\b/i], ["FR", /\bparis\b/i],
  ["DE", /\b(?:berlin|munich|m[uü]nchen|hamburg)\b/i], ["NL", /\bamsterdam\b/i], ["IE", /\bdublin\b/i],
  ["CH", /\b(?:zurich|z[uü]rich|geneva)\b/i],
  ["IN", /\b(?:bangalore|bengaluru|hyderabad|pune|mumbai|delhi|gurgaon|gurugram|chennai|noida)\b/i],
  ["JP", /\btokyo\b/i], ["AU", /\b(?:sydney|melbourne)\b/i], ["ES", /\b(?:madrid|barcelona)\b/i],
  ["PL", /\b(?:warsaw|krakow|krak[oó]w)\b/i], ["RS", /\b(?:belgrade|novi sad)\b/i], ["RO", /\bbucharest\b/i],
  ["DK", /\b(?:copenhagen|aarhus)\b/i], ["QA", /\bdoha\b/i], ["KR", /\bseoul\b/i],
  ["IL", /\btel aviv\b/i], ["SE", /\bstockholm\b/i], ["CN", /\b(?:shanghai|beijing|shenzhen)\b/i],
  ["BR", /\bs[aã]o paulo\b/i], ["MX", /\bmexico city\b/i]
];

/**
 * The countries a location string names, as a Set of codes. Empty when it
 * doesn't say ("Remote", "Hybrid", "In-Office"). Handles one location or several
 * joined with ; • | , and the trap that "CA" is Canada in "Toronto, ON, CA" but
 * California in "Menlo Park, CA".
 */
export function countriesIn(location) {
  const found = new Set();
  for (const raw of String(location || "").split(/[;•|]|\s+or\s+/i)) {
    const seg = raw.trim();
    if (!seg) continue;
    const canadian = CA_PROVINCES.test(seg) || /\bcanada\b/i.test(seg);
    for (const [code, re] of COUNTRY_NAMES) if (re.test(seg)) found.add(code);
    // A leading code is always a country ("DE-Berlin" is Germany, not Delaware).
    const prefix = seg.match(/^(?:[\w ]+-)?([A-Z]{2})-[A-Z]/);
    if (prefix && ISO.has(prefix[1])) found.add(prefix[1] === "UK" ? "GB" : prefix[1]);
    // Comma-separated codes: "Dublin, IE", "Menlo Park, CA", "Toronto, ON, CA".
    let pinned = canadian; // a state or province means one specific place
    for (const raw of seg.split(/\s*,\s*/)) {
      const tok = raw.trim().replace(/\./g, "");
      if (tok === "CA") { found.add(canadian ? "CA" : "US"); pinned = true; }
      else if (tok === "UK") found.add("GB");
      else if (US_STATES.includes(tok)) { found.add("US"); pinned = true; }
      else if (ISO.has(tok)) found.add(tok);
    }
    if (canadian) found.add("CA");
    if (US_STATE_NAMES.test(seg)) { found.add("US"); pinned = true; }
    // Cities count unless a state or province already pins the place, so
    // "London, Paris, Tokyo" finds all three but "Dublin, CA" stays in the US
    // and "London, ON" stays in Canada.
    if (!pinned) for (const [code, re] of CITIES) if (re.test(seg)) found.add(code);
  }
  return found;
}

/** Kept if it's in the country, or if the location doesn't say (like "Remote"). */
export function fitsCountry(location, country) {
  if (!country) return true;
  const found = countriesIn(location);
  return !found.size || found.has(country);
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
export function filterJobs(jobs, { keywords = "", term = "", sinceDays = 0, country = "", now = Date.now() } = {}) {
  const words = keywords.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  const since = sinceDays > 0 ? now - sinceDays * 864e5 : 0;
  return jobs
    .filter((j) => isInternship(j.title))
    .filter((j) => fitsTerm(j.title, term))
    .filter((j) => fitsCountry(j.location, country))
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
