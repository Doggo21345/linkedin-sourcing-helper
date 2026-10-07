#!/usr/bin/env python3
"""Checks for lib/profile.js: turning a LinkedIn profile into a contact.

The headline is the fallback when LinkedIn's current-company element is
missing, so most of these are headline shapes seen on recruiter and student
profiles. Run from the repo root: python3 test/profile_test.py (run.py also runs these)
"""
import json
import os
import re
import sys

import quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HEADLINES = [
    ("University Recruiter at Stripe | Hiring SWE interns", "Stripe"),
    ("Software Engineer @ Figma", "Figma"),
    ("Talent Partner, Ramp | Hiring interns", "Ramp"),
    ("Technical Recruiter at Jane Street", "Jane Street"),
    ("Engineering Manager at Goldman Sachs - Payments", "Goldman Sachs"),
    ("Recruiter at Stripe and Figma", "Stripe"),
    ("Senior Recruiter at Meta (Facebook)", "Meta"),
    ("Recruiter at State Farm", "State Farm"),
    ("Recruiter at Capital One", "Capital One"),
    ("Analyst at Tech Mahindra", "Tech Mahindra"),
    # Students list their school the same way; the employer comes after it.
    ("CS @ UT Austin '27 | Incoming SWE Intern at Amazon", "Amazon"),
    ("Student at Georgia Tech", ""),
    ("CS @ Penn State University", ""),
    # Not an employer.
    ("Building products at scale", ""),
    ("Passionate about people", ""),
    ("Founder, Stealth Startup", ""),
    ("", ""),
]

NAMES = [
    ("Jane Doe (She/Her) 🚀", "Jane Doe"),
    ("José Álvarez, PHR", "José Álvarez"),
    ("Priya Raman | Recruiting", "Priya Raman"),
]

URLS = [
    ("/in/jane-doe-123/details/experience/", "https://www.linkedin.com/in/jane-doe-123/"),
    ("/in/jane-doe-123", "https://www.linkedin.com/in/jane-doe-123/"),
    ("/jobs/view/123/", ""),
]


def main():
    src = open(os.path.join(ROOT, "lib/profile.js"), encoding="utf-8").read()
    ctx = quickjs.Context()
    ctx.eval(re.sub(r"^export ", "", src, flags=re.M))
    call = lambda fn, arg: ctx.eval("%s(%s)" % (fn, json.dumps(arg)))

    failures = []
    for fn, cases in (("companyFromHeadline", HEADLINES), ("cleanProfileName", NAMES), ("profileUrl", URLS)):
        for arg, want in cases:
            got = call(fn, arg)
            if got != want:
                failures.append("%s(%r): got %r, want %r" % (fn, arg, got, want))
    total = len(HEADLINES) + len(NAMES) + len(URLS)
    for f in failures:
        print("FAIL " + f)
    print("%d/%d profile checks passed" % (total - len(failures), total))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
