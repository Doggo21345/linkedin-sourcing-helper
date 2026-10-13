// Loads the real popup in jsdom with a fake chrome.* and drives it.
import { JSDOM } from "jsdom";
import fs from "fs";

const scenario = process.argv[2];
const html = fs.readFileSync("./ext/popup/popup.html", "utf8").replace(/<script[^>]*><\/script>/, "");
const query = scenario === "saved" ? "?tab=saved" : "";
const dom = new JSDOM(html, { url: "chrome-extension://abc/popup/popup.html" + query, pretendToBeVisual: true });
const { window } = dom;
for (const k of ["document", "window", "HTMLElement", "Node", "location", "navigator", "URLSearchParams", "Blob", "URL"]) {
  try { globalThis[k] = window[k] ?? globalThis[k]; } catch {}
}
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async (t) => (globalThis.CLIP = t) } }, configurable: true });
window.confirm = () => true;

const store = { sync: {}, local: {} };
const listeners = [];
const area = (name) => ({
  get: async (keys) => {
    const out = {};
    for (const k of [].concat(keys || [])) if (k in store[name]) out[k] = structuredClone(store[name][k]);
    return out;
  },
  set: async (obj) => {
    const changes = {};
    for (const [k, v] of Object.entries(obj)) { changes[k] = { newValue: structuredClone(v) }; store[name][k] = structuredClone(v); }
    listeners.forEach((l) => l(changes, name));
  },
  remove: async (k) => { delete store[name][k]; }
});
const DAY = 864e5, iso = (ms) => new Date(ms).toISOString().slice(0, 10);

const pages = {
  job: { url: "https://www.linkedin.com/jobs/view/4012345678/" },
  profile: { url: "https://www.linkedin.com/in/jane-doe-123/" },
  saved: { url: "chrome-extension://abc/popup/popup.html?tab=saved" }
};
const created = [];
globalThis.chrome = {
  runtime: {
    getManifest: () => JSON.parse(fs.readFileSync("./ext/manifest.json", "utf8")),
    getURL: (p) => "chrome-extension://abc/" + p,
    sendMessage: (msg, cb) => {
      const r = msg.type === "KNOWN_DOMAIN" ? { domain: "" }
        : msg.type === "CHECK_BOARDS" ? { ok: true, jobs: [], checked: 0, unknown: [], errors: [] }
        : { ok: false, error: "not-mocked" };
      setTimeout(() => cb(r), 0);
    },
    openOptionsPage: () => {},
    lastError: null
  },
  tabs: {
    query: async () => [{ id: 1, url: pages[scenario].url }],
    create: async (o) => created.push(o.url),
    sendMessage: (_id, _m, cb) => cb({ ok: false })
  },
  scripting: {
    executeScript: async ({ func }) => {
      if (func.name === "scrapePostingInPage") return [{ result: {
        title: "Software Engineer Intern (Summer 2027)", company: "Stripe", companySlug: "stripe", companyId: "2135371",
        location: "San Francisco, CA", url: pages.job.url, titleSource: "json-ld", companySource: "json-ld",
        description: "Join the Payments Platform team. You will report to the Engineering Manager, Payments. Job ID: R-12345. Build things."
      } }];
      if (func.name === "scrapeProfileInPage") return [{ result: {
        isProfile: true, name: "Jane Doe (She/Her)", headline: "University Recruiter at Stripe | Hiring SWE interns", company: "", pathname: "/in/jane-doe-123/"
      } }];
      return [{ result: null }];
    }
  },
  storage: { sync: area("sync"), local: area("local"), onChanged: { addListener: (f) => listeners.push(f) } }
};

store.sync.me = { name: "Alex Kim", school: "UT Austin", year: "junior", major: "computer science", pitch: "I recently built a Chrome extension used by 100+ students" };
store.local.lastJob = { title: "Software Engineer Intern (Summer 2027)", url: pages.job.url, company: "Stripe", reqId: "R-12345", linkedinJobId: "4012345678", at: Date.now() };
if (scenario === "saved") {
  store.local.contacts = [
    { first: "Jane", last: "Doe", company: "Stripe", stage: "messaged", touches: 1, lastContacted: iso(Date.now() - 6 * DAY), followUpAt: iso(Date.now() - DAY), linkedin: "https://www.linkedin.com/in/jane/" },
    { first: "Sam", last: "Lee", company: "Figma", stage: "replied" }
  ];
}

const $ = (id) => document.getElementById(id);
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
const errors = [];
process.on("unhandledRejection", (e) => errors.push(String(e?.stack || e)));
const ok = (cond, msg) => { if (!cond) errors.push("FAIL " + msg); else console.log("ok  " + msg); };

await import("./ext/popup/popup.js");
await tick(300);

if (scenario === "job") {
  ok(!$("panel-job").hidden, "job tab open on a posting");
  const start = [...$("start-links").querySelectorAll("a")];
  ok(start.length === 3, `3 start-here links (got ${start.length}: ${start.map((a) => a.childNodes[0].textContent).join(" | ")})`);
  ok(start.some((a) => a.href.includes("currentCompany=%5B%222135371%22%5D")), "a start link uses the company filter");
  ok(start.every((a) => a.querySelector(".why")?.textContent), "every start link explains why");
  ok(/company filter found/.test($("detect").textContent), "detection says company filter found");
  ok($("more-searches").querySelectorAll("a").length > 3, "the rest are under More searches");
  ok($("version-label").textContent === "v0.6.0", "version shown in footer");
  ok(/issues\/new\?/.test($("report-link").href) && /job\+posting|job%20posting/.test($("report-link").href), "report link prefilled with page kind");
}

if (scenario === "profile") {
  ok(!$("panel-person").hidden, "person tab opens on a profile");
  ok($("person-name").value === "Jane Doe", `name cleaned (got ${$("person-name").value})`);
  ok($("person-company").value === "Stripe", "company from headline");
  ok(!$("person-job").hidden, "linked to the last job");
  $("person-write").click();
  await tick(200);
  ok(!$("compose").hidden, "compose opens");
  const body = $("compose-body").value;
  ok(/Hi Jane/.test(body) && /R-12345/.test(body) && /UT Austin/.test(body), "message filled with name, Job ID, school");
  ok($("compose-missing").hidden, "no blanks left when About you is filled in");
  const connect = [...$("compose-kinds").children].find((b) => b.dataset.kind === "connect");
  connect.click();
  await tick();
  ok($("compose-body").value.length <= 200 && /\/ 200/.test($("compose-count").textContent), "connection note shows the 200 limit");
  $("compose-copy").click();
  await tick();
  ok(globalThis.CLIP === $("compose-body").value, "copy puts the note on the clipboard");
  $("compose-messaged").click();
  await tick(200);
  const c = (store.local.contacts || [])[0] || {};
  ok(c.stage === "messaged" && c.followUpAt === iso(Date.now() + 5 * DAY), `marked messaged, follow-up in 5 days (got ${c.stage}, ${c.followUpAt})`);
  ok(c.jobKey === "4012345678" && c.reqId === "R-12345", "contact saved against the job");
}

if (scenario === "saved") {
  ok(!$("panel-saved").hidden, "?tab=saved opens Saved");
  ok(!$("due-section").hidden && $("due-list").children.length === 1, "one follow-up due");
  ok($("due-count").textContent === "1" && !$("due-count").hidden, "due count on the tab");
  const snoozeBtn = [...$("due-list").querySelectorAll("button")].find((b) => b.textContent === "Snooze 3d");
  snoozeBtn.click();
  await tick(200);
  ok(store.local.contacts[0].followUpAt === iso(Date.now() + 3 * DAY), "snooze moves it 3 days");
  ok($("due-section").hidden, "nothing due after snoozing");
  $("saved-stage").value = "replied";
  $("saved-stage").dispatchEvent(new window.Event("change"));
  await tick(100);
  const shown = [...$("contacts").children].map((li) => li.querySelector(".who").textContent);
  ok(shown.length === 1 && /Sam Lee/.test(shown[0]), "stage filter shows only Replied");
}

if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log(`${scenario}: all smoke checks passed`);
process.exit(0);
