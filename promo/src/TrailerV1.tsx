// The trailer: hook -> problem -> product -> four features -> call to action.
import React from "react";
import { AbsoluteFill, Audio, Series, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, FONT, DEMO } from "./theme";
import { Line, Caption, Popup, H2, LinkCard, Button, useIn, useOut, useIsSquare, useIsVertical, useTyped } from "./ui";

// Scene lengths in frames (30 fps). The total is exported for Root.tsx.
const LEN = { hook: 120, problem: 96, reveal: 90, job: 180, write: 180, follow: 150, find: 150, cta: 150 };
export const TRAILER_V1_FRAMES = Object.values(LEN).reduce((a, b) => a + b, 0);

/** Text-only scenes get bigger on 9:16, where there's a lot more height to fill. */
const Big: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const vertical = useIsVertical();
  return <div style={{ zoom: vertical ? 1.35 : 1 }}>{children}</div>;
};

const Backdrop: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  // A slow drifting glow so the background never sits perfectly still.
  const x = 50 + 10 * Math.sin(frame / 90);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${x}% 30%, ${C.bg2} 0%, ${C.bg} 60%)`,
        justifyContent: "center", alignItems: "center", fontFamily: FONT
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Caption beside the product (16:9) or above it (1:1). */
const FeatureLayout: React.FC<{ caption: React.ReactNode; popup: React.ReactNode; len: number }> = ({ caption, popup, len }) => {
  const square = useIsSquare();
  const vertical = useIsVertical();
  const out = useOut(len);
  return (
    <Backdrop>
      <div
        style={{
          display: "flex", flexDirection: square ? "column" : "row", alignItems: "center",
          gap: vertical ? 90 : square ? 50 : 110, opacity: out, padding: square ? "0 80px" : 0
        }}
      >
        <div style={{ width: square ? "100%" : 600 }}>{caption}</div>
        <div>{popup}</div>
      </div>
    </Backdrop>
  );
};

// ---- 1. Hook ------------------------------------------------------------------------

const Hook: React.FC = () => {
  const out = useOut(LEN.hook);
  const square = useIsSquare();
  return (
    <Backdrop>
      <div style={{ opacity: out, display: "flex", flexDirection: "column", gap: 34, padding: "0 80px" }}>
        <Line text="You've sent 100 APPLICATIONS." size={square ? 78 : 96} />
        <Line text="Most never get a reply." delay={34} size={square ? 54 : 64} color="#a9b4c8" weight={600} />
      </div>
    </Backdrop>
  );
};

// ---- 2. Problem -----------------------------------------------------------------------

const Problem: React.FC = () => {
  const out = useOut(LEN.problem);
  const square = useIsSquare();
  return (
    <Backdrop>
      <div style={{ opacity: out, display: "flex", flexDirection: "column", gap: 26, padding: "0 90px" }}>
        <Line text="The fix isn't another application." size={square ? 56 : 66} weight={700} color="#a9b4c8" />
        <Line text="It's a PERSON who knows your name." delay={24} size={square ? 70 : 84} />
      </div>
    </Backdrop>
  );
};

// ---- 3. Reveal ------------------------------------------------------------------------

const Logo: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size, height: size, borderRadius: size * 0.24, background: `linear-gradient(135deg, ${C.accent}, #4f9dff)`,
      display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 20px 60px rgba(10,102,194,.5)"
    }}
  >
    <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15 L20.5 20.5" />
      <circle cx="10.5" cy="9" r="1.8" fill="#fff" stroke="none" />
      <path d="M7.4 13.2 C8.4 11.8 12.6 11.8 13.6 13.2" />
    </svg>
  </div>
);

const Reveal: React.FC = () => {
  const p = useIn(0, 12);
  const out = useOut(LEN.reveal);
  return (
    <Backdrop>
      <div style={{ opacity: out, display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
        <div style={{ transform: `scale(${0.6 + 0.4 * p}) rotate(${(1 - p) * -12}deg)`, opacity: p }}>
          <Logo size={170} />
        </div>
        <Line text="Sourcing Helper" delay={10} size={92} />
        <Line text="A free Chrome extension for internship hunters" delay={22} size={38} color="#a9b4c8" weight={500} caps={false} />
      </div>
    </Backdrop>
  );
};

// ---- 4. Find the people ---------------------------------------------------------------

const JobScene: React.FC = () => {
  const frame = useCurrentFrame();
  const glow = interpolate(frame, [95, 110, 160], [0, 1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <FeatureLayout
      len={LEN.job}
      caption={<Caption n={1} title="Find the recruiter behind any posting" sub="Open a job on LinkedIn, click once. It reads the posting and shows exactly who to contact." />}
      popup={
        <Popup tab="Job" delay={8}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{DEMO.role}</div>
          <div style={{ color: C.muted }}>{DEMO.company} · San Francisco, CA</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>team: Payments Platform · company filter found</div>
          <H2>Start here</H2>
          <LinkCard delay={30} glow={glow} label="University recruiters (at the company)" why="Recruiters run the hiring process. Message them with the Job ID." />
          <LinkCard delay={44} label="Reports to: Engineering Manager, Payments" why="The manager this role reports to, named in the posting." />
          <LinkCard delay={58} label="Payments Platform team members" why="People on the team you'd join. Ask for a chat, or a referral." />
        </Popup>
      }
    />
  );
};

// ---- 5. Write the message --------------------------------------------------------------

const MESSAGE = `Hi Maya, I'm a ${DEMO.me.year} at ${DEMO.me.school} and just applied to ${DEMO.company}'s ${DEMO.role} role (Job ID ${DEMO.reqId}). I'd love to connect and stay on your radar!`;

const WriteScene: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = useTyped(MESSAGE, 40, 80);
  const copied = frame > 140;
  const press = interpolate(frame, [132, 136, 142], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <FeatureLayout
      len={LEN.write}
      caption={<Caption n={2} title="A ready‑to‑send message in one click" sub="Their name, the role, and the Job ID, filled in. Free templates, or personalize it with AI." />}
      popup={
        <Popup tab="Person" delay={8}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Write message</div>
          <div style={{ color: C.muted, marginBottom: 8 }}>{DEMO.recruiter} · {DEMO.recruiterTitle}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {["Connection note", "LinkedIn message", "Email", "Follow-up"].map((k, i) => (
              <span key={k} style={{ fontSize: 11, borderRadius: 10, padding: "2px 8px", border: `1px solid ${C.accent}`, background: i === 0 ? C.accent : "#fff", color: i === 0 ? "#fff" : C.accent }}>{k}</span>
            ))}
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 9, minHeight: 128, fontSize: 12.5, lineHeight: 1.45 }}>
            {typed}
            <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0, color: C.accent }}>|</span>
          </div>
          <div style={{ textAlign: "right", color: C.muted, fontSize: 11, margin: "4px 0 8px" }}>{typed.length} / 200</div>
          <Button primary pressed={press}>{copied ? "Copied ✓" : "Copy"}</Button>
          <Button>AI personalize</Button>
        </Popup>
      }
    />
  );
};

// ---- 6. Follow up ------------------------------------------------------------------------

const FOLLOWS = [
  { name: "Maya Chen", co: "Northwind", due: "today" },
  { name: "Jordan Patel", co: "Acme Robotics", due: "today" },
  { name: "Sam Rivera", co: "Lumen Labs", due: "yesterday" }
];

const FollowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 1 + 0.12 * Math.max(0, Math.sin((frame - 20) / 6)) * (frame > 20 && frame < 70 ? 1 : 0);
  return (
    <FeatureLayout
      len={LEN.follow}
      caption={<Caption n={3} title="Never forget a follow‑up" sub="Mark someone as messaged and it reminds you in 5 days. Most replies come from the follow-up." />}
      popup={
        <Popup tab="Saved" delay={8} badge="3">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <H2>Follow-ups due</H2>
            <span style={{ background: C.redBg, color: C.red, borderRadius: 8, padding: "0 7px", fontSize: 12, fontWeight: 700, transform: `scale(${pulse})` }}>3</span>
          </div>
          {FOLLOWS.map((f, i) => (
            <FollowRow key={f.name} {...f} delay={26 + i * 12} />
          ))}
        </Popup>
      }
    />
  );
};

const FollowRow: React.FC<{ name: string; co: string; due: string; delay: number }> = ({ name, co, due, delay }) => {
  const p = useIn(delay);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, padding: "7px 0", opacity: p, transform: `translateX(${(1 - p) * 20}px)` }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>{name} · <span style={{ color: C.muted, fontWeight: 400 }}>{co}</span></span>
        <span style={{ color: C.red, fontSize: 11 }}>due {due}</span>
      </div>
      <div style={{ marginTop: 5 }}>
        <Button>Write follow-up</Button>
        <Button>Snooze 3d</Button>
        <Button>Replied</Button>
      </div>
    </div>
  );
};

// ---- 7. Find internships ------------------------------------------------------------------

const JOBS = [
  { t: "Software Engineer Intern (Summer 2027)", c: "Northwind", when: "3h ago", isNew: true },
  { t: "Data Science Intern, Summer 2027", c: "Bluebird Pay", when: "9h ago", isNew: true },
  { t: "Product Manager Intern", c: "Cobalt AI", when: "1d ago", isNew: true },
  { t: "ML Research Intern, 2027", c: "Acme Robotics", when: "4d ago", isNew: false }
];

const FindScene: React.FC = () => (
  <FeatureLayout
    len={LEN.find}
    caption={<Caption n={4} title="New internships, straight from the source" sub="Checks 40+ company job boards live, with real posting dates and deadlines." />}
    popup={
      <Popup tab="Find" delay={8}>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {["Summer 2027", "United States", "Past week"].map((f) => (
            <span key={f} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 11 }}>{f} ▾</span>
          ))}
        </div>
        <H2>Check company boards live</H2>
        {JOBS.map((j, i) => (
          <JobRow key={j.t} {...j} delay={24 + i * 12} />
        ))}
      </Popup>
    }
  />
);

const JobRow: React.FC<{ t: string; c: string; when: string; isNew: boolean; delay: number }> = ({ t, c, when, isNew, delay }) => {
  const p = useIn(delay);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 9px", margin: "5px 0", opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
      <div style={{ color: C.accent, fontWeight: 600 }}>
        {t}
        {isNew ? <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#fff", background: C.green, borderRadius: 6, padding: "1px 5px" }}>NEW</span> : null}
      </div>
      <div style={{ color: C.muted, fontSize: 11 }}>{c} · Posted {when}</div>
    </div>
  );
};

// ---- 8. Call to action ----------------------------------------------------------------------

const Cta: React.FC = () => {
  const square = useIsSquare();
  const vertical = useIsVertical();
  const p = useIn(30);
  return (
    <Backdrop>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, padding: "0 70px" }}>
        <Logo size={120} />
        <Line text="FREE. Open source. One‑minute install." size={square ? 60 : 76} />
        <div
          style={{
            opacity: p, transform: `translateY(${(1 - p) * 16}px)`, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)",
            color: C.white, borderRadius: 14, padding: "16px 30px", fontSize: vertical ? 23 : square ? 30 : 36, fontWeight: 600,
            whiteSpace: "nowrap"
          }}
        >
          github.com/Doggo21345/linkedin-sourcing-helper
        </div>
        <Line text="Find them. Message them. Follow up." delay={50} size={square ? 36 : 40} color="#a9b4c8" weight={500} caps={false} />
      </div>
    </Backdrop>
  );
};

export const TrailerV1: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {/* Original track, synthesized by music/make_music.py to fit these scene cuts. */}
    <Audio src={staticFile("music.wav")} volume={0.9} />
    <Series>
      <Series.Sequence durationInFrames={LEN.hook}><Big><Hook /></Big></Series.Sequence>
      <Series.Sequence durationInFrames={LEN.problem}><Big><Problem /></Big></Series.Sequence>
      <Series.Sequence durationInFrames={LEN.reveal}><Big><Reveal /></Big></Series.Sequence>
      <Series.Sequence durationInFrames={LEN.job}><JobScene /></Series.Sequence>
      <Series.Sequence durationInFrames={LEN.write}><WriteScene /></Series.Sequence>
      <Series.Sequence durationInFrames={LEN.follow}><FollowScene /></Series.Sequence>
      <Series.Sequence durationInFrames={LEN.find}><FindScene /></Series.Sequence>
      <Series.Sequence durationInFrames={LEN.cta}><Big><Cta /></Big></Series.Sequence>
    </Series>
  </AbsoluteFill>
);
