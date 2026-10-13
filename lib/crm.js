// A lightweight outreach tracker on top of the saved contacts: where each
// conversation stands, and who's due a follow-up. Pure, so test/run.py can
// check it; background.js turns due follow-ups into a badge and notification.

export const STAGES = [
  ["saved", "Saved"],
  ["messaged", "Messaged"],
  ["replied", "Replied"],
  ["call", "Call booked"],
  ["referred", "Referred"],
  ["closed", "No response"]
];

// Most replies come from the first follow-up; a third note rarely helps and
// starts to annoy. So: follow up after 5 days, once more after 7, then stop.
export const FOLLOW_UP_DAYS = [5, 7];

const DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export function stageOf(contact) {
  return contact.stage || "saved";
}

/** Sent a first message or a follow-up: schedule the next one, or stop after the last. */
export function markMessaged(contact, now = Date.now()) {
  const touches = (contact.touches || 0) + 1;
  const wait = FOLLOW_UP_DAYS[touches - 1];
  return {
    ...contact,
    stage: "messaged",
    touches,
    lastContacted: iso(now),
    followUpAt: wait ? iso(now + wait * DAY) : ""
  };
}

/** They wrote back (or later stages): no more reminders. */
export function setStage(contact, stage, now = Date.now()) {
  if (stage === "messaged" && stageOf(contact) !== "messaged") return markMessaged(contact, now);
  const next = { ...contact, stage };
  if (stage !== "messaged") next.followUpAt = "";
  return next;
}

export function snooze(contact, days = 3, now = Date.now()) {
  return { ...contact, followUpAt: iso(now + days * DAY) };
}

/** Contacts whose follow-up date has arrived, oldest first. */
export function dueFollowUps(contacts, now = Date.now()) {
  const today = iso(now);
  return contacts
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => stageOf(c) === "messaged" && c.followUpAt && c.followUpAt <= today)
    .sort((a, b) => a.c.followUpAt.localeCompare(b.c.followUpAt));
}

/** True when the follow-up just scheduled was the last one. */
export function isLastFollowUp(contact) {
  return (contact.touches || 0) >= FOLLOW_UP_DAYS.length;
}

/** LinkedIn's job ID from a posting URL, used to group contacts by job. */
export function linkedinJobId(url) {
  const m = String(url || "").match(/\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})|[?&]currentJobId=(\d{6,})/);
  return m ? m[1] || m[2] : "";
}
