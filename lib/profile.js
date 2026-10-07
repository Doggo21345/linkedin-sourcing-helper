// Turning what's on a LinkedIn profile into a contact. Pure, so test/run.py can
// check it; the page itself is read by scrapeProfileInPage() in popup.js.
//
// LinkedIn's profile markup changes often and the current-company element in
// particular comes and goes, so the headline is the dependable fallback: most
// people write "Title at Company" there.

// "Recruiter at Stripe", "SWE @ Figma", "Talent Partner, Ramp | Hiring interns"
const AT_COMPANY = /(?:\bat|@)\s+([^|•·,()\n@]+?)(?=\s*(?:[|•·,()\n@]|\s-\s|\s(?:and|&)\s|$))/gi;
const COMMA_COMPANY = /^[^|•·,]+?,\s*([A-Z][^|•·,()\n]+?)(?=\s*(?:[|•·()\n]|\s-\s|$))/;

// Things people put after "at" that aren't an employer.
const NOT_A_COMPANY = /^(?:the|a|an|my|our|your|scale|heart|night|home|large|work|school|stealth|stealth startup|self-?employed|freelance|various|multiple|n\/a|open to work|looking)$/i;

// Students write their school the same way ("CS @ UT Austin '27"). Skip it so
// "... | Incoming SWE Intern at Amazon" finds Amazon.
const SCHOOL = /\b(?:university|college|institute|school|academy|state university|polytechnic)\b|\b(?:georgia|virginia|texas|louisiana|cal|ga) tech\b|\b(?:UT|UC|UCLA|USC|NYU|MIT|CMU|UIUC|UMich|GT|UW)\b|['’]\d{2}\b|\b20\d{2}\b/i;

function clean_(c) {
  return String(c || "").replace(/[\s.!]+$/, "").trim();
}

/** "University Recruiter at Stripe | Hiring SWE interns" -> "Stripe" */
export function companyFromHeadline(headline) {
  const h = String(headline || "").replace(/\s+/g, " ").trim();
  const ok = (c) => c && c.length <= 60 && !NOT_A_COMPANY.test(c) && !SCHOOL.test(c);
  for (const m of h.matchAll(AT_COMPANY)) {
    const c = clean_(m[1]);
    if (ok(c)) return c;
  }
  const m = h.match(COMMA_COMPANY);
  const c = m ? clean_(m[1]) : "";
  return ok(c) ? c : "";
}

/** "Jane Doe (She/Her) 🚀" -> "Jane Doe". The waterfall cleans names again; this is for display. */
export function cleanProfileName(name) {
  return String(name || "")
    .split(/[,|]/)[0]
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{M}'’. -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "/in/jane-doe-123/details/experience/" -> "https://www.linkedin.com/in/jane-doe-123/" */
export function profileUrl(pathname) {
  const m = String(pathname || "").match(/^\/in\/([^/?#]+)/);
  return m ? `https://www.linkedin.com/in/${m[1]}/` : "";
}
