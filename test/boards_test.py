#!/usr/bin/env python3
"""Checks for lib/boards.js: job-board Google searches and the live board check.

Board payloads are trimmed copies of real Greenhouse / Lever / Ashby responses
(field names checked against the live APIs on 2026-10-07).
Run from the repo root: python3 test/boards_test.py (run.py also runs these)
"""
import json
import os
import re
import sys
from urllib.parse import unquote_plus

import quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOW = 1791400000000  # fixed clock: 2026-10-07T19:06Z
H = 3600 * 1000

GREENHOUSE = {"jobs": [
    {"id": 101, "title": "Software Engineer Intern (Summer 2027)", "company_name": "Robinhood",
     "location": {"name": "Menlo Park, CA"}, "absolute_url": "https://boards.greenhouse.io/robinhood/jobs/101",
     "first_published": "2026-10-07T08:00:00-04:00", "application_deadline": "2026-10-20T23:59:00-04:00"},
    {"id": 102, "title": "Software Engineer Intern (Summer 2027)", "company_name": "Robinhood",
     "location": {"name": "New York, NY"}, "absolute_url": "https://boards.greenhouse.io/robinhood/jobs/102",
     "first_published": "2026-10-06T08:00:00-04:00"},
    {"id": 103, "title": "Senior Software Engineer", "company_name": "Robinhood",
     "location": {"name": "Remote"}, "absolute_url": "x", "first_published": "2026-10-07T08:00:00-04:00"},
    {"id": 104, "title": "Data Science Intern (Summer 2026)", "company_name": "Robinhood",
     "location": {"name": "Remote"}, "absolute_url": "y", "first_published": "2025-09-01T08:00:00-04:00"},
]}
LEVER = [
    {"id": "a1", "text": "Deployment Strategist, Internship", "hostedUrl": "https://jobs.lever.co/palantir/a1",
     "categories": {"location": "New York, NY"}, "createdAt": NOW - 10 * 24 * H},
]
ASHBY = {"jobs": [
    {"id": "z1", "title": "Applied Scientist Intern", "jobUrl": "https://jobs.ashbyhq.com/ramp/z1",
     "location": "New York, NY", "publishedAt": "2026-10-01T00:00:00Z", "isListed": True},
    {"id": "z2", "title": "Product Manager | International", "jobUrl": "u", "location": "NYC",
     "publishedAt": "2026-10-07T00:00:00Z", "isListed": True},
    {"id": "z3", "title": "Unlisted Intern", "jobUrl": "v", "location": "NYC",
     "publishedAt": "2026-10-07T00:00:00Z", "isListed": False},
]}


def main():
    src = open(os.path.join(ROOT, "lib/boards.js"), encoding="utf-8").read()
    ctx = quickjs.Context()
    ctx.eval(re.sub(r"^export ", "", src, flags=re.M))
    js = lambda expr: json.loads(ctx.eval("JSON.stringify(%s)" % expr))
    problems = []

    def check(name, got, want):
        if got != want:
            problems.append("%s: got %r, want %r" % (name, got, want))

    # --- Google searches
    links = js('buildBoardSearches({role: "software engineer", term: "Summer 2027", recency: "week"})')
    check("search count", len(links), 10)
    first = unquote_plus(links[0]["url"])
    for part in ['site:boards.greenhouse.io', 'site:jobs.lever.co', '(intern OR internship)', '"Summer 2027"',
                 '"software engineer"', 'tbs=qdr:w']:
        if part not in first:
            problems.append("all-boards search missing %r: %s" % (part, first))
    check("all-boards word count <= 32", len(first.split("q=")[1].split("&")[0].split()) <= 32, True)
    plain = unquote_plus(js('buildBoardSearches({})')[1]["url"])
    check("no filters: no quoted term", '"' in plain, False)
    check("no filters: no recency", "tbs=" in plain, False)

    # --- Board list entries
    for line, want in [
        ("greenhouse:stripe", {"board": "greenhouse", "slug": "stripe"}),
        ("https://boards.greenhouse.io/robinhood", {"board": "greenhouse", "slug": "robinhood"}),
        ("https://job-boards.greenhouse.io/figma/jobs/123", {"board": "greenhouse", "slug": "figma"}),
        ("jobs.lever.co/palantir", {"board": "lever", "slug": "palantir"}),
        ("https://jobs.ashbyhq.com/ramp", {"board": "ashby", "slug": "ramp"}),
        ("Jane Street", {"name": "Jane Street"}),
        ("# comment", None),
        ("", None),
    ]:
        check("parseBoardEntry(%r)" % line, js("parseBoardEntry(%s)" % json.dumps(line)), want)
    check("slugsFor", js('slugsFor("Jane Street, Inc.")'), ["janestreet", "jane-street"])

    # --- Normalizing payloads
    gh = js("normalizeJobs('greenhouse', 'robinhood', %s)" % json.dumps(GREENHOUSE))
    check("greenhouse fields", {k: gh[0][k] for k in ("title", "company", "location", "jobId")},
          {"title": "Software Engineer Intern (Summer 2027)", "company": "Robinhood",
           "location": "Menlo Park, CA", "jobId": "101"})
    check("greenhouse deadline parsed", gh[0]["deadline"] > 0, True)
    lv = js("normalizeJobs('lever', 'palantir', %s)" % json.dumps(LEVER))
    check("lever company from slug", lv[0]["company"], "Palantir")
    ab = js("normalizeJobs('ashby', 'ramp', %s)" % json.dumps(ASHBY))
    check("ashby drops unlisted", [j["jobId"] for j in ab], ["z1", "z2"])
    check("not a board response", js("normalizeJobs('greenhouse', 'x', {error: 'nope'})"), None)

    # --- Internship detection and term fit
    for title, want in [
        ("Software Engineer Intern", True), ("Deployment Strategist, Internship", True),
        ("Software Engineer Co-op", True), ("2027 Summer Analyst Program", True),
        ("Product Manager | International", False), ("Internal Tools Engineer", False),
        ("Senior Software Engineer", False),
    ]:
        check("isInternship(%r)" % title, js("isInternship(%s)" % json.dumps(title)), want)
    for title, term, want in [
        ("SWE Intern (Summer 2027)", "Summer 2027", True),
        ("SWE Intern (Summer 2026)", "Summer 2027", False),   # wrong year
        ("SWE Intern - Fall 2027", "Summer 2027", False),     # wrong season
        ("SWE Intern", "Summer 2027", True),                  # no term named: keep it
        ("Autumn 2027 Research Intern", "Fall 2027", True),
        ("SWE Intern (Summer 2026)", "", True),               # "Any"
    ]:
        check("fitsTerm(%r, %r)" % (title, term), js("fitsTerm(%s, %s)" % (json.dumps(title), json.dumps(term))), want)

    # --- Filtering, merging, ordering
    ctx.eval("globalThis.ALL = [].concat(normalizeJobs('greenhouse','robinhood',%s), normalizeJobs('lever','palantir',%s), normalizeJobs('ashby','ramp',%s))"
             % (json.dumps(GREENHOUSE), json.dumps(LEVER), json.dumps(ASHBY)))
    got = js("filterJobs(ALL, {term: 'Summer 2027', now: %d}).map(function(j){return j.title + ' @ ' + j.location;})" % NOW)
    check("summer 2027, merged per city, newest first", got, [
        "Software Engineer Intern (Summer 2027) @ Menlo Park, CA · New York, NY",
        "Applied Scientist Intern @ New York, NY",
        "Deployment Strategist, Internship @ New York, NY",
    ])
    got = js("filterJobs(ALL, {term: 'Summer 2027', sinceDays: 7, now: %d}).length" % NOW)
    check("past week", got, 2)
    got = js("filterJobs(ALL, {keywords: 'scientist, strategist', now: %d}).map(function(j){return j.jobId;})" % NOW)
    check("keywords match any", got, ["z1", "a1"])

    check("ago hours", js("ago(%d, %d)" % (NOW - 3 * H, NOW)), "3h ago")
    check("ago days", js("ago(%d, %d)" % (NOW - 50 * H, NOW)), "2d ago")
    check("ago weeks", js("ago(%d, %d)" % (NOW - 30 * 24 * H, NOW)), "4w ago")

    for p in problems:
        print("FAIL " + p)
    print("%s board checks" % ("all" if not problems else "%d failing" % len(problems)))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
