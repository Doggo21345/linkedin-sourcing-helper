// Screenshots of the REAL extension popup, for the trailer.
//
// Serves the extension over a local web server, loads popup/popup.html in
// headless Chrome with a fake chrome.* API holding made-up demo data
// (Northwind, Maya Chen...), clicks into each state, and saves 3x PNGs to
// promo/public/shots/. Run from promo/:  node capture/capture.mjs
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, "../..");
const OUT = path.resolve(HERE, "../public/shots");
const CHROME = process.env.CHROME || path.resolve(HERE, "../node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell");
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const p = path.join(EXT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(EXT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// Runs in the page before popup.js: a fake chrome.* API with the demo data.
function fakeChrome(scene) {
  const DAY = 864e5, iso = (ms) => new Date(ms).toISOString().slice(0, 10), now = Date.now();
  const store = {
    sync: {
      me: { name: "Alex Kim", school: "State University", year: "junior", major: "computer science", pitch: "I recently built a Chrome extension used by 100+ students" },
      findFilters: { role: "", term: "Summer 2027", recency: "week", country: "US", boards: ["Greenhouse", "Lever", "Ashby", "Workday", "Eightfold"] }
    },
    local: {
      lastJob: { title: "Software Engineer Intern, Summer 2027", url: "https://www.linkedin.com/jobs/view/4012345678/", company: "Northwind", reqId: "R-20417", linkedinJobId: "4012345678", at: now },
      contacts: [
        { first: "Maya", last: "Chen", company: "Northwind", title: "University Recruiter at Northwind", email: "maya.chen@northwind.com", status: "valid", stage: "messaged", touches: 1, lastContacted: iso(now - 6 * DAY), followUpAt: iso(now - DAY), job: "Software Engineer Intern, Summer 2027", jobKey: "4012345678" },
        { first: "Jordan", last: "Patel", company: "Acme Robotics", title: "Engineering Manager", email: "jordan@acmerobotics.com", status: "valid", stage: "messaged", touches: 1, lastContacted: iso(now - 5 * DAY), followUpAt: iso(now), job: "Robotics Software Intern" },
        { first: "Sam", last: "Rivera", company: "Lumen Labs", title: "Talent Partner", email: "sam.rivera@lumenlabs.io", status: "risky", stage: "messaged", touches: 1, lastContacted: iso(now - 5 * DAY), followUpAt: iso(now), job: "Data Science Intern" },
        { first: "Priya", last: "Nair", company: "Bluebird Pay", title: "Software Engineer", email: "priya@bluebirdpay.com", status: "valid", stage: "replied", job: "Software Engineer Intern" },
        { first: "Leo", last: "Okafor", company: "Cobalt AI", title: "Recruiter", email: "", status: "", stage: "call", job: "Product Manager Intern" }
      ]
    }
  };
  if (scene === "saved-empty") store.local.contacts = [];
  const H = 36e5;
  const jobs = [
    ["Software Engineer Intern (Summer 2027)", "Northwind", "San Francisco, CA", 3],
    ["Data Science Intern, Summer 2027", "Bluebird Pay", "New York, NY", 5],
    ["Product Manager Intern", "Cobalt AI", "Seattle, WA", 9],
    ["ML Research Intern, 2027", "Acme Robotics", "Pittsburgh, PA", 26],
    ["Software Engineer Co-op", "Lumen Labs", "Boston, MA", 30],
    ["Quantitative Research Intern (Summer 2027)", "Harbor Capital", "Chicago, IL", 54]
  ].map(([title, company, location, h], i) => ({ title, company, location, url: "#", postedAt: now - h * H, deadline: i === 0 ? now + 12 * DAY : 0, jobId: String(880100 + i) }));
  const listeners = [];
  const area = (name) => ({
    get: async (keys) => Object.fromEntries([].concat(keys || []).filter((k) => k in store[name]).map((k) => [k, structuredClone(store[name][k])])),
    set: async (obj) => { Object.assign(store[name], structuredClone(obj)); listeners.forEach((l) => l(Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { newValue: v }])), name)); },
    remove: async () => {}
  });
  const pageUrl = scene.startsWith("saved") ? "https://www.linkedin.com/feed/" : scene.startsWith("person") ? "https://www.linkedin.com/in/maya-chen/" : scene.startsWith("find") ? "https://example.com/" : scene.startsWith("saved") ? "https://www.linkedin.com/feed/" : "https://www.linkedin.com/jobs/view/4012345678/";
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.6.0" }), getURL: (p) => "/" + p, openOptionsPage() {}, lastError: null,
      sendMessage: (msg, cb) => {
        const r = msg.type === "CHECK_BOARDS" ? { ok: true, jobs, checked: 40, unknown: [], errors: [] }
          : msg.type === "KNOWN_DOMAIN" ? { domain: "northwind.com" }
          : msg.type === "FIND_EMAIL" ? { ok: true, result: { email: "maya.chen@northwind.com", status: "valid", source: "Known format {first}.{last}", domain: "northwind.com", trace: ["Known format {first}.{last}: maya.chen@northwind.com → MillionVerifier: valid"], alternatives: [] } }
          : { ok: false };
        setTimeout(() => cb && cb(r), 30);
      }
    },
    tabs: { query: async () => [{ id: 1, url: pageUrl }], create: async () => {}, sendMessage: (_i, _m, cb) => cb({ ok: false }) },
    scripting: {
      executeScript: async ({ func }) => {
        if (func.name === "scrapePostingInPage") return [{ result: {
          title: "Software Engineer Intern, Summer 2027", company: "Northwind", companySlug: "northwind", companyId: "2135371",
          location: "San Francisco, CA", url: pageUrl, titleSource: "json-ld", companySource: "json-ld",
          description: "Join the Payments Platform team. You will report to the Engineering Manager, Payments. Job ID: R-20417."
        } }];
        if (func.name === "scrapeProfileInPage") return [{ result: {
          isProfile: true, name: "Maya Chen", headline: "University Recruiter at Northwind | Hiring SWE interns", company: "Northwind", pathname: "/in/maya-chen/"
        } }];
        return [{ result: null }];
      }
    },
    storage: { sync: area("sync"), local: area("local"), onChanged: { addListener: (f) => listeners.push(f) } }
  };
  navigator.clipboard.writeText = async () => {};
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] });
const SCALE = 3;
const RECTS = {};

async function shoot(scene, { after, height, selector = "body" } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: height || 900, deviceScaleFactor: SCALE });
  await page.evaluateOnNewDocument(fakeChrome, scene);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // Saved opens straight to its tab, the way a follow-up notification does.
  const q = scene.startsWith("saved") ? "?tab=saved" : "";
  await page.goto(`${BASE}/popup/popup.html${q}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));
  if (after) await after(page);
  await new Promise((r) => setTimeout(r, 350));
  // Size the shot to the content, like the real popup does.
  const h = height || (await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height + 24)));
  await page.setViewport({ width: 360, height: h, deviceScaleFactor: SCALE });
  await new Promise((r) => setTimeout(r, 150));
  const file = path.join(OUT, `${scene}.png`);
  await page.screenshot({ path: file, omitBackground: false });
  // Where the important bits are (CSS px), so the trailer can aim the cursor and camera at them.
  RECTS[scene] = await page.evaluate((sels) => Object.fromEntries(sels.map((s) => {
    const el = document.querySelector(s);
    if (!el || !el.getClientRects().length) return [s, null];
    const r = el.getBoundingClientRect();
    return [s, { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }];
  })), ["#start-links", "#start-links li", "#compose-copy", "#compose-body", "#due-section", "#due-list li", "#board-results", "#board-results li", "#person-find", "#person-result", "#tab-saved"]);
  RECTS[scene].height = h;
  console.log(`${scene}: ${360 * SCALE}x${h * SCALE}${errors.length ? "  ERRORS: " + errors.join(" | ") : ""}`);
  await page.close();
}

const click = (sel) => async (page) => { await page.click(sel); await new Promise((r) => setTimeout(r, 300)); };

await shoot("job", {
  after: async (page) => {
    // Hide the long tail so the shot is the part that matters: posting + Start here.
    await page.evaluate(() => {
      // For the trailer: the posting and Start here, without the power-user fields.
      const hide = (el) => el && (el.style.display = "none");
      for (const id of ["more-searches", "role", "company", "boolean", "detect", "job-saved"]) hide(document.getElementById(id));
      for (const l of document.querySelectorAll("#posting .field-label")) hide(l);
      hide(document.getElementById("rebuild")?.closest(".row"));
      for (const p of document.querySelectorAll("#posting .hint")) hide(p);
      for (const el of document.querySelectorAll("#posting h2")) if (/People Data Labs/i.test(el.textContent)) { el.style.display = "none"; }
      for (const id of ["find-recruiters", "find-peers", "pdl-status"]) { const e = document.getElementById(id); if (e) e.closest(".row, div").style.display = "none"; }
      document.querySelector(".footer").style.display = "none";
    });
  }
});
await shoot("person-compose", { height: 640, after: click("#person-write") });
await shoot("person-found", {
  after: async (page) => {
    await click("#person-find")(page);
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => { document.querySelector(".footer").style.display = "none"; });
  }
});
await shoot("saved", { after: async (page) => page.evaluate(() => { document.querySelector(".footer").style.display = "none"; }) });
await shoot("find", {
  after: async (page) => {
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      document.getElementById("boards-status").style.display = "none";
      document.querySelector(".footer").style.display = "none";
    });
  }
});

fs.writeFileSync(path.join(OUT, "rects.json"), JSON.stringify(RECTS, null, 2));
await browser.close();
server.close();
