#!/usr/bin/env python3
"""Checks for lib/messages.js (outreach templates) and lib/crm.js (follow-ups).

Run from the repo root: python3 test/outreach_test.py (run.py also runs these)
"""
import json
import os
import re
import sys

import quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOW = 1791400000000  # 2026-10-07T19:06Z
DAY = 864e5


def main():
    ctx = quickjs.Context()
    for f in ("lib/messages.js", "lib/crm.js"):
        src = open(os.path.join(ROOT, f), encoding="utf-8").read()
        ctx.eval(re.sub(r"^export ", "", src, flags=re.M))
    js = lambda expr: json.loads(ctx.eval("JSON.stringify(%s)" % expr))
    problems = []

    def check(name, got, want):
        if got != want:
            problems.append("%s: got %r, want %r" % (name, got, want))

    # --- Requisition IDs from posting text (not LinkedIn's URL ID)
    for text, want in [
        ("Job ID: R-12345\nAbout the role", "R-12345"),
        ("Requisition #JR0098765", "JR0098765"),
        ("Req ID 2026-4411 Software Engineer Intern", "2026-4411"),
        ("Job Number: 123456", "123456"),
        ("We build products for millions of people.", ""),
        ("Our job is to help you grow.", ""),
    ]:
        check("extractReqId(%r)" % text, js("extractReqId(%s)" % json.dumps(text)), want)

    for title, want in [
        ("University Recruiter at Stripe", "recruiter"), ("Talent Acquisition Partner", "recruiter"),
        ("Engineering Manager, Payments", "manager"), ("Director of Analytics", "manager"),
        ("Software Engineer II", "peer"), ("", "peer"),
    ]:
        check("personKind(%r)" % title, js("personKind(%s)" % json.dumps(title)), want)

    full = {
        "person": {"name": "Jane Doe", "title": "University Recruiter at Stripe", "company": "Stripe"},
        "job": {"title": "Software Engineer Intern", "company": "Stripe", "reqId": "R-12345"},
        "me": {"name": "Alex Kim", "school": "UT Austin", "year": "junior", "major": "computer science",
               "pitch": "I recently built a Chrome extension used by 100+ students"},
    }
    m = js("buildMessage('message', %s)" % json.dumps(full))
    check("recruiter tone", m["tone"], "recruiter")
    for part in ["Hi Jane", "Software Engineer Intern", "Stripe", "Job ID R-12345", "UT Austin", "Alex Kim"]:
        if part not in m["body"]:
            problems.append("message missing %r" % part)
    check("no placeholders when everything is known", js("missingFields(%s)" % json.dumps(m["body"])), [])

    e = js("buildMessage('email', %s)" % json.dumps(full))
    check("email subject", e["subject"], "Software Engineer Intern application (Job ID R-12345): Alex Kim")

    # Connection notes fit LinkedIn's limit, whatever goes in.
    long = json.loads(json.dumps(full))
    long["me"]["school"] = "The University of Texas at Austin McCombs School of Business Honors Program"
    long["job"]["title"] = "Software Development Engineer Intern - Summer 2027 - Machine Learning Infrastructure"
    c = js("buildMessage('connect', %s)" % json.dumps(long))
    check("connect note within limit", len(c["body"]) <= js("CONNECT_LIMIT"), True)
    check("connect limit reported", c["limit"], 200)

    # Unknown details stay visible as placeholders.
    bare = js("buildMessage('message', {person: {name: 'Sam Lee', title: 'Software Engineer'}, job: {}})")
    check("placeholders shown", js("missingFields(%s)" % json.dumps(bare["body"])),
          ["[year]", "[major]", "[your school]", "[company]", "[your name]"])
    check("no req ID -> no Job ID text", "Job ID" in js("buildMessage('message', {person:{name:'J', title:'Recruiter'}, job:{title:'SWE Intern'}})")["body"], False)

    check("mailto", js("mailtoUrl('jane@stripe.com', 'Hi there', 'Line 1\\nLine 2')"),
          "mailto:jane%40stripe.com?subject=Hi%20there&body=Line%201%0ALine%202")

    # --- CRM: follow-up schedule
    ctx.eval("globalThis.C0 = {first: 'Jane', email: 'j@x.com'}")
    m1 = js("markMessaged(C0, %d)" % NOW)
    check("first message: stage", m1["stage"], "messaged")
    check("first follow-up in 5 days", m1["followUpAt"], "2026-10-12")
    m2 = js("markMessaged(markMessaged(C0, %d), %d)" % (NOW, NOW + 5 * DAY))
    check("second follow-up 7 days later", m2["followUpAt"], "2026-10-19")
    m3 = js("markMessaged(markMessaged(markMessaged(C0, %d), %d), %d)" % (NOW, NOW + 5 * DAY, NOW + 12 * DAY))
    check("after the last follow-up, no more reminders", m3["followUpAt"], "")
    check("last follow-up flagged", js("isLastFollowUp(%s)" % json.dumps(m2)), True)

    replied = js("setStage(markMessaged(C0, %d), 'replied', %d)" % (NOW, NOW))
    check("reply clears reminder", (replied["stage"], replied["followUpAt"]), ("replied", ""))
    check("setting Messaged schedules", js("setStage(C0, 'messaged', %d).followUpAt" % NOW), "2026-10-12")

    ctx.eval("""globalThis.LIST = [
      {first:'A', stage:'messaged', followUpAt:'2026-10-05'},
      {first:'B', stage:'messaged', followUpAt:'2026-10-20'},
      {first:'C', stage:'replied', followUpAt:''},
      {first:'D', stage:'messaged', followUpAt:'2026-10-01'},
      {first:'E'}]""")
    due = js("dueFollowUps(LIST, %d).map(function(d){return d.c.first + d.index;})" % NOW)
    check("due follow-ups, oldest first, with index", due, ["D3", "A0"])
    check("snooze", js("snooze(LIST[0], 3, %d).followUpAt" % NOW), "2026-10-10")

    for url, want in [
        ("https://www.linkedin.com/jobs/view/4012345678/", "4012345678"),
        ("https://www.linkedin.com/jobs/view/software-engineer-intern-at-stripe-4012345678", "4012345678"),
        ("https://www.linkedin.com/jobs/search/?currentJobId=4099999999&keywords=x", "4099999999"),
        ("https://www.linkedin.com/in/jane/", ""),
    ]:
        check("linkedinJobId(%r)" % url, js("linkedinJobId(%s)" % json.dumps(url)), want)

    for p in problems:
        print("FAIL " + p)
    print("%s outreach checks" % ("all" if not problems else "%d failing" % len(problems)))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
