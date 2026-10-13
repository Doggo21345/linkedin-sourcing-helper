// Outreach messages: free templates filled from the person, the job, and the
// sender's own details. Pure, so test/run.py can check it. AI personalization
// (with the user's own Claude key) lives in background.js and starts from these.

export const MESSAGE_KINDS = [
  ["connect", "Connection note"],
  ["message", "LinkedIn message"],
  ["email", "Email"],
  ["followup", "Follow-up"]
];

// LinkedIn caps the note on a connection request. Free accounts have had a
// lower cap than Premium; 200 is the safe length for everyone.
export const CONNECT_LIMIT = 200;

/**
 * The company's own job/requisition number from the posting text, e.g.
 * "Job ID: R-12345". That's what a recruiter types into their applicant system,
 * not LinkedIn's ID in the URL, so the templates use this or a placeholder.
 */
export function extractReqId(description) {
  const text = String(description || "");
  const m = text.match(/\b(?:job|req(?:uisition)?|posting)\s*(?:id|#|number|no\.?|code)\s*[:#]?\s*([A-Z]{0,4}[-_]?\d[\w-]{2,19})\b/i) ||
    text.match(/\b(?:requisition|req)\s*[:#]\s*([A-Z0-9][\w-]{3,19})\b/i);
  return m ? m[1] : "";
}

/** Who they are to a job seeker, from their title. Picks the template's tone. */
export function personKind(title) {
  const t = String(title || "").toLowerCase();
  if (/recruit|talent|sourc|university|campus|early career|people partner|\bhr\b|hiring/.test(t)) return "recruiter";
  if (/\b(manager|director|head of|lead|vp|vice president|founder|cto|ceo)\b/.test(t)) return "manager";
  return "peer";
}

const firstOf = (name) => String(name || "").trim().split(/\s+/)[0] || "";

// Missing details become visible [placeholders] rather than silently vanishing,
// so a message never goes out with a hole the sender didn't notice.
function ctxFor({ person = {}, job = {}, me = {} }) {
  const reqId = job.reqId || "";
  return {
    first: firstOf(person.first || person.name) || "there",
    company: person.company || job.company || "[company]",
    role: job.title || "[role]",
    reqId,
    jobRef: reqId ? ` (Job ID ${reqId})` : "",
    myName: me.name || "[your name]",
    school: me.school || "[your school]",
    year: me.year || "[year]",
    major: me.major || "[major]",
    pitch: me.pitch || "[one line about something you built or did]",
    kind: personKind(person.title)
  };
}

const TEMPLATES = {
  connect: {
    recruiter: (c) => `Hi ${c.first}, I'm a ${c.year} at ${c.school} and just applied to ${c.company}'s ${c.role} role${c.jobRef}. I'd love to connect and stay on your radar!`,
    manager: (c) => `Hi ${c.first}, I'm a ${c.school} student really interested in the ${c.role} role on your team at ${c.company}. I'd love to connect!`,
    peer: (c) => `Hi ${c.first}, I'm a ${c.year} at ${c.school} interested in ${c.company}. I'd love to connect and hear how you got into your role!`
  },
  message: {
    recruiter: (c) => `Hi ${c.first},\n\nI just applied to the ${c.role} position at ${c.company}${c.jobRef}. I'm a ${c.year} studying ${c.major} at ${c.school}, and ${c.pitch}.\n\nI'd love to be considered, and I'm happy to share anything else that would help. Thank you for your time!\n\n${c.myName}`,
    manager: (c) => `Hi ${c.first},\n\nI'm a ${c.year} studying ${c.major} at ${c.school}, and I'm really interested in the ${c.role} role on your team at ${c.company}${c.jobRef}. ${cap(c.pitch)}.\n\nIf you're open to it, I'd love to hear what you look for in candidates for this role. Thanks for your time!\n\n${c.myName}`,
    peer: (c) => `Hi ${c.first},\n\nI'm a ${c.year} studying ${c.major} at ${c.school}, and ${c.company} is at the top of my list. Would you be open to a 15-minute chat about your path and what your team works on? Totally understand if you're busy.\n\nThanks!\n${c.myName}`
  },
  email: {
    recruiter: (c) => ({
      subject: `${c.role} application${c.reqId ? ` (Job ID ${c.reqId})` : ""}: ${c.myName}`,
      body: `Hi ${c.first},\n\nI just applied to the ${c.role} position at ${c.company}${c.jobRef}. I'm a ${c.year} studying ${c.major} at ${c.school}, and ${c.pitch}.\n\nI'd love to be considered. My resume is attached, and I'm happy to share anything else that would help.\n\nThank you for your time,\n${c.myName}`
    }),
    manager: (c) => ({
      subject: `${c.school} student interested in ${c.role} at ${c.company}`,
      body: `Hi ${c.first},\n\nI'm a ${c.year} studying ${c.major} at ${c.school}, and I'm really interested in the ${c.role} role on your team${c.jobRef}. ${cap(c.pitch)}.\n\nIf you have 15 minutes sometime, I'd love to hear what makes someone successful on your team. Thank you either way!\n\nBest,\n${c.myName}`
    }),
    peer: (c) => ({
      subject: `${c.school} student, quick question about ${c.company}`,
      body: `Hi ${c.first},\n\nI'm ${c.myName}, a ${c.year} studying ${c.major} at ${c.school}. ${c.company} is at the top of my list, and I'd really appreciate 15 minutes to hear about your path and any advice you have.\n\nWould any time next week work? Happy to work around your schedule.\n\nThank you,\n${c.myName}`
    })
  },
  followup: {
    recruiter: (c) => `Hi ${c.first}, just following up on my note about the ${c.role} role${c.jobRef}. I know you're busy, and I'm still very excited about ${c.company}. Happy to share anything that would help. Thank you!`,
    manager: (c) => `Hi ${c.first}, just following up on my earlier note about the ${c.role} role on your team. I'd still love to hear your perspective if you have a few minutes. Thanks either way!`,
    peer: (c) => `Hi ${c.first}, just following up on my note from last week. I'd still love to hear about your experience at ${c.company} if you have 15 minutes sometime. Thanks either way!`
  }
};

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Trim to `limit` at a sentence or word boundary. */
function fit(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  if (sentence > limit * 0.6) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
}

/** {subject, body, limit, kind}: the template for this person, job, and sender. */
export function buildMessage(kind, { person, job, me } = {}) {
  const c = ctxFor({ person, job, me });
  const make = TEMPLATES[kind]?.[c.kind] || TEMPLATES.message[c.kind];
  const out = make(c);
  const msg = typeof out === "string" ? { subject: "", body: out } : out;
  const limit = kind === "connect" ? CONNECT_LIMIT : 0;
  if (limit && msg.body.length > limit) {
    // Too long for a connection note: drop the job reference first, then trim.
    const shorter = make({ ...c, jobRef: "" });
    msg.body = fit(typeof shorter === "string" ? shorter : shorter.body, limit);
  }
  return { ...msg, limit, kind, tone: c.kind };
}

/** Placeholders still in a message, e.g. ["[your school]"], so the UI can point them out. */
export function missingFields(text) {
  return [...new Set(String(text || "").match(/\[[^\]]{2,60}\]/g) || [])];
}

export function mailtoUrl(to, subject, body) {
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  return `mailto:${encodeURIComponent(to || "")}${q ? `?${q}` : ""}`;
}
