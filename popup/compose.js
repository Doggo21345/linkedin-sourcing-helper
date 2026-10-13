// The "Write message" panel: a free template for every kind of outreach, an
// optional AI rewrite with the user's own Claude key, and one click to copy,
// open their profile, or start an email. Opened from the Job, Person, and Saved tabs.

import { MESSAGE_KINDS, buildMessage, missingFields, mailtoUrl } from "../lib/messages.js";

const $ = (id) => document.getElementById(id);

function sendToBg(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : resp));
  });
}

let state = null;

function render() {
  const { kind, msg } = state;
  for (const btn of document.querySelectorAll("#compose-kinds button")) {
    btn.setAttribute("aria-selected", String(btn.dataset.kind === kind));
  }
  $("compose-subject-row").hidden = kind !== "email";
  $("compose-subject").value = msg.subject || "";
  $("compose-body").value = msg.body;
  updateMeta();
  const email = state.person.email || "";
  $("compose-mail").hidden = kind !== "email";
  $("compose-mail").title = email ? `Opens your email app, addressed to ${email}` : "Opens your email app (no address saved yet)";
  $("compose-profile").hidden = !state.person.linkedin;
}

function updateMeta() {
  const body = $("compose-body").value;
  const limit = state.msg.limit;
  const count = $("compose-count");
  count.textContent = limit ? `${body.length} / ${limit}` : `${body.length} characters`;
  count.classList.toggle("error", Boolean(limit && body.length > limit));
  const missing = missingFields(`${$("compose-subject").value}\n${body}`);
  $("compose-missing").hidden = !missing.length;
  $("compose-missing").textContent = missing.length
    ? `Fill in before sending: ${missing.join(", ")}. Add your details once in ⚙︎ Settings → About you.`
    : "";
}

function setKind(kind) {
  state.kind = kind;
  state.msg = buildMessage(kind, state);
  $("compose-status").textContent = "";
  render();
}

async function personalize() {
  const btn = $("compose-ai");
  btn.disabled = true;
  $("compose-status").textContent = "Personalizing…";
  const res = await sendToBg({
    type: "AI_MESSAGE",
    kind: state.kind,
    draft: { subject: $("compose-subject").value, body: $("compose-body").value },
    person: state.person,
    job: state.job,
    me: state.me,
    limit: state.msg.limit
  });
  btn.disabled = false;
  if (!res?.ok) {
    $("compose-status").textContent = res?.error === "no-key"
      ? "Add a Claude API key in ⚙︎ Settings to personalize. The template above is free to use as is."
      : `Couldn't personalize (${res?.detail || res?.error}). The template is still yours to use.`;
    return;
  }
  state.msg = { ...state.msg, subject: res.subject ?? state.msg.subject, body: res.body };
  $("compose-status").textContent = "Personalized. Read it over: AI can get details wrong.";
  render();
}

/**
 * person: {name, title, company, linkedin, email}
 * job:    {title, company, reqId, url}
 * onMessaged(): called when the user marks this person as messaged.
 */
export async function openCompose(person, job, { kind = "", onMessaged } = {}) {
  const { me, anthropicApiKey } = await chrome.storage.sync.get(["me", "anthropicApiKey"]);
  const isRecruiterish = /recruit|talent|sourc|campus|university/i.test(person.title || "");
  state = {
    person: person || {},
    job: job || {},
    me: me || {},
    onMessaged,
    kind: kind || (person.email ? "email" : isRecruiterish ? "message" : "connect")
  };
  state.msg = buildMessage(state.kind, state);
  $("compose-who").textContent = [person.name, person.title].filter(Boolean).join(" · ");
  $("compose-ai").disabled = false;
  $("compose-ai").title = anthropicApiKey ? "Rewrite this for them with your Claude key" : "Needs a Claude API key (⚙︎ Settings)";
  $("compose-ai-badge").hidden = Boolean(anthropicApiKey);
  $("compose-messaged").hidden = !onMessaged;
  $("compose").hidden = false;
  render();
  // Start at the top of the message, not wherever focus would scroll it.
  const body = $("compose-body");
  body.focus();
  body.setSelectionRange(0, 0);
  body.scrollTop = 0;
}

export function wireCompose() {
  const kinds = $("compose-kinds");
  for (const [kind, label] of MESSAGE_KINDS) {
    const b = document.createElement("button");
    b.className = "secondary small";
    b.dataset.kind = kind;
    b.textContent = label;
    b.addEventListener("click", () => setKind(kind));
    kinds.appendChild(b);
  }
  $("compose-body").addEventListener("input", updateMeta);
  $("compose-subject").addEventListener("input", updateMeta);
  $("compose-close").addEventListener("click", () => ($("compose").hidden = true));
  $("compose-copy").addEventListener("click", async () => {
    const subject = $("compose-subject").value;
    const text = state.kind === "email" && subject ? `Subject: ${subject}\n\n${$("compose-body").value}` : $("compose-body").value;
    await navigator.clipboard.writeText(text);
    $("compose-copy").textContent = "Copied";
    setTimeout(() => ($("compose-copy").textContent = "Copy"), 1200);
  });
  $("compose-profile").addEventListener("click", () => chrome.tabs.create({ url: state.person.linkedin }));
  $("compose-mail").addEventListener("click", () => {
    chrome.tabs.create({ url: mailtoUrl(state.person.email, $("compose-subject").value, $("compose-body").value) });
  });
  $("compose-ai").addEventListener("click", personalize);
  $("compose-messaged").addEventListener("click", async () => {
    await state.onMessaged?.();
    $("compose-status").textContent = state.kind === "followup"
      ? "Logged. The next follow-up is scheduled in the Saved tab, or this was the last one."
      : "Logged as messaged. You'll get a reminder to follow up in 5 days.";
  });
}
