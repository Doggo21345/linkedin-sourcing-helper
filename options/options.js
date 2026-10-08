import { DEFAULT_STEPS, STEP_LABELS } from "../lib/email.js";

const $ = (id) => document.getElementById(id);

function renderSteps(enabled) {
  const box = $("steps");
  box.innerHTML = "";
  for (const id of DEFAULT_STEPS) {
    const label = document.createElement("label");
    label.className = "radio";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = id;
    input.checked = enabled.includes(id);
    const span = document.createElement("span");
    span.textContent = STEP_LABELS[id];
    label.append(input, span);
    box.appendChild(label);
  }
}

async function load() {
  const s = await chrome.storage.sync.get([
    "extractionMode", "anthropicApiKey", "model", "pdlApiKey",
    "hunterApiKey", "millionverifierApiKey", "zerobounceApiKey",
    "emailVerifier", "emailSteps", "maxVerifications", "maxGuesses"
  ]);
  const mode = s.extractionMode || "local";
  document.querySelector(`input[name=mode][value="${mode}"]`).checked = true;
  $("apiKey").value = s.anthropicApiKey || "";
  $("model").value = s.model || "claude-haiku-4-5-20251001";
  $("pdlKey").value = s.pdlApiKey || "";
  $("hunterKey").value = s.hunterApiKey || "";
  $("mvKey").value = s.millionverifierApiKey || "";
  $("zbKey").value = s.zerobounceApiKey || "";
  $("verifier").value = s.emailVerifier || "auto";
  renderSteps(Array.isArray(s.emailSteps) ? s.emailSteps : DEFAULT_STEPS);
  $("maxVerifications").value = s.maxVerifications || 4;
  $("maxGuesses").value = s.maxGuesses || 3;
}

// Blank or nonsense falls back to the default rather than 0, which would
// silently switch verification off.
function count(id, fallback) {
  const n = parseInt($(id).value, 10);
  return n > 0 ? Math.min(n, 10) : fallback;
}

async function save() {
  const mode = document.querySelector("input[name=mode]:checked")?.value || "local";
  await chrome.storage.sync.set({
    extractionMode: mode,
    anthropicApiKey: $("apiKey").value.trim(),
    model: $("model").value,
    pdlApiKey: $("pdlKey").value.trim(),
    hunterApiKey: $("hunterKey").value.trim(),
    millionverifierApiKey: $("mvKey").value.trim(),
    zerobounceApiKey: $("zbKey").value.trim(),
    emailVerifier: $("verifier").value,
    emailSteps: [...document.querySelectorAll("#steps input:checked")].map((i) => i.value),
    maxVerifications: count("maxVerifications", 4),
    maxGuesses: count("maxGuesses", 3)
  });
  const saved = $("saved");
  saved.textContent = "Saved ✓";
  setTimeout(() => (saved.textContent = ""), 1500);
}

// Each provider's free "account" call: confirms the key works without spending a credit.
const KEY_CHECKS = [
  ["Hunter", "hunterKey", (k) => `https://api.hunter.io/v2/account?api_key=${encodeURIComponent(k)}`,
    (j) => j?.data ? `works (${j.data.requests?.searches?.available ?? "?"} searches left this month)` : ""],
  ["MillionVerifier", "mvKey", (k) => `https://api.millionverifier.com/api/v3/credits?api=${encodeURIComponent(k)}`,
    (j) => (j && !j.error && j.credits !== undefined ? `works (${j.credits} credits)` : "")],
  ["ZeroBounce", "zbKey", (k) => `https://api.zerobounce.net/v2/getcredits?api_key=${encodeURIComponent(k)}`,
    (j) => (j && Number(j.Credits) >= 0 ? `works (${j.Credits} credits)` : "")],
  ["People Data Labs", "pdlKey", null, null]
];

async function checkKeys() {
  const ul = $("key-results");
  ul.innerHTML = "";
  for (const [name, id, url, read] of KEY_CHECKS) {
    const key = $(id).value.trim();
    const li = document.createElement("li");
    if (!key) {
      li.textContent = `${name}: no key`;
    } else if (!url) {
      li.textContent = `${name}: key saved (checked when you search)`;
    } else {
      li.textContent = `${name}: checking…`;
      ul.appendChild(li);
      try {
        const r = await fetch(url(key));
        const j = await r.json().catch(() => null);
        const ok = r.ok && read(j);
        li.textContent = `${name}: ${ok || `didn't work (HTTP ${r.status}) — check the key was copied in full`}`;
      } catch (e) {
        li.textContent = `${name}: couldn't reach the service`;
      }
      continue;
    }
    ul.appendChild(li);
  }
}

$("save").addEventListener("click", save);
$("check-keys").addEventListener("click", async () => {
  await save();
  await checkKeys();
});
$("clear-cache").addEventListener("click", async () => {
  await chrome.storage.local.remove(["emailCache", "emailPatterns", "catchAllDomains"]);
  $("clear-cache").textContent = "Cleared ✓";
  setTimeout(() => ($("clear-cache").textContent = "Clear remembered emails and formats"), 1500);
});
load();
