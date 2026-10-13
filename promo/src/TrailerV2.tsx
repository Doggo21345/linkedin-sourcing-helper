// The trailer, v2: ~20 s of motion. 3D camera moves over a recreated browser,
// UI that pops out of the screen, a hand cursor, kinetic type, and zoom cuts.
// Scene lengths live in timeline.json, which music/make_music.py also reads.
import React from "react";
import { AbsoluteFill, Audio, Easing, Series, staticFile, useCurrentFrame } from "remotion";
import timeline from "./timeline-v2.json";
import { C, FONT, DEMO } from "./theme";
import { Popup, H2, LinkCard, useTyped } from "./ui";
import { V, kf, useSpring, useAspect, Backdrop, SceneZoom, Kinetic, Camera, Lift, Hand, Browser, Skeleton } from "./fx";

export const TRAILER_V2_FRAMES = timeline.scenes.reduce((a, s) => a + s.frames, 0);

// Stage geometry (stage pixels): the browser is 1440x900; the popup sits top-right.
const POPUP = { x: 912, y: 78, zoom: 1.25 };
const ICON = { x: 1372, y: 13 };

/** How big the 1440x900 stage is drawn, and where, per aspect ratio. */
function useStage() {
  const a = useAspect();
  if (a.vertical) return { scale: 0.72, y: 170 };
  if (a.square) return { scale: 0.66, y: 90 };
  return { scale: 0.94, y: 40 };
}

/** The scene's headline: bottom on 16:9, top on square and vertical (where the stage sits lower). */
const Overlay: React.FC<{ text: string; start?: number }> = ({ text, start = 10 }) => {
  const a = useAspect();
  const size = a.vertical ? 104 : a.square ? 78 : 92;
  return (
    <AbsoluteFill style={{ justifyContent: a.wide ? "flex-end" : "flex-start", alignItems: "center", pointerEvents: "none" }}>
      {a.wide ? (
        <AbsoluteFill style={{ background: "linear-gradient(transparent 48%, rgba(7,7,15,.92) 78%, rgba(7,7,15,.97))" }} />
      ) : null}
      <div style={{ padding: a.wide ? "0 0 60px" : a.vertical ? "190px 70px 0" : "70px 60px 0", position: "relative", maxWidth: a.wide ? 1600 : 980 }}>
        <Kinetic text={text} start={start} size={size} />
      </div>
    </AbsoluteFill>
  );
};

const ExtIcon: React.FC<{ size: number; badge?: string; badgePop?: number }> = ({ size, badge, badgePop = 1 }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.24, position: "relative",
    background: `linear-gradient(135deg, ${C.accent}, ${V.violet})`, display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `0 ${size * 0.12}px ${size * 0.4}px rgba(124,92,255,.55)`
  }}>
    <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15 L20.5 20.5" />
      <circle cx="10.5" cy="9" r="1.8" fill="#fff" stroke="none" />
      <path d="M7.4 13.2 C8.4 11.8 12.6 11.8 13.6 13.2" />
    </svg>
    {badge ? (
      <div style={{
        position: "absolute", right: -size * 0.16, top: -size * 0.16, minWidth: size * 0.42, height: size * 0.42, borderRadius: size,
        background: "#ef4444", color: "#fff", fontWeight: 800, fontSize: size * 0.26, fontFamily: FONT,
        display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${badgePop})`,
        boxShadow: "0 0 0 3px #07070f"
      }}>{badge}</div>
    ) : null}
  </div>
);

// ---- The job posting page inside the browser -------------------------------------------

const JobPage: React.FC = () => (
  <div style={{ position: "relative", width: 1440, height: 836, fontFamily: FONT }}>
    <div style={{ position: "absolute", left: 70, top: 70, width: 92, height: 92, borderRadius: 18, background: "linear-gradient(135deg,#1e3a8a,#3b82f6)" }} />
    <div style={{ position: "absolute", left: 190, top: 74, fontSize: 40, fontWeight: 800, color: "#111827" }}>{DEMO.role}</div>
    <div style={{ position: "absolute", left: 190, top: 130, fontSize: 24, color: "#6b7280" }}>{DEMO.company} · San Francisco, CA · 2 days ago</div>
    <div style={{ position: "absolute", left: 190, top: 186, display: "flex", gap: 14 }}>
      <div style={{ background: "#0a66c2", color: "#fff", borderRadius: 26, padding: "12px 30px", fontSize: 22, fontWeight: 700 }}>Apply</div>
      <div style={{ border: "2px solid #0a66c2", color: "#0a66c2", borderRadius: 26, padding: "10px 28px", fontSize: 22, fontWeight: 700 }}>Save</div>
    </div>
    <div style={{ position: "absolute", left: 70, top: 290, fontSize: 26, fontWeight: 700, color: "#111827" }}>About the job</div>
    <Skeleton rows={[[70, 345, 760], [70, 380, 700], [70, 415, 780], [70, 450, 620], [70, 510, 740], [70, 545, 690], [70, 580, 760], [70, 640, 560], [70, 675, 720]]} />
  </div>
);

const JobPopup: React.FC<{ glow?: number }> = ({ glow = 0 }) => (
  <Popup tab="Job" zoom={POPUP.zoom}>
    <div style={{ fontWeight: 600, fontSize: 14 }}>{DEMO.role}</div>
    <div style={{ color: C.muted }}>{DEMO.company} · San Francisco, CA</div>
    <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>team: Payments Platform · company filter found</div>
    <H2>Start here</H2>
    <LinkCard delay={-99} glow={glow} label="University recruiters (at the company)" why="Recruiters run the hiring process. Message them with the Job ID." />
    <LinkCard delay={-99} label="Reports to: Engineering Manager, Payments" why="The manager this role reports to, named in the posting." />
    <LinkCard delay={-99} label="Payments Platform team members" why="People on the team you'd join. Ask for a chat, or a referral." />
  </Popup>
);

// ---- 1. Hook: rejection emails fly past the camera; the line slams in ---------------------

// Spread to the edges so they frame the headline instead of covering it.
const REJECTIONS = [
  [-640, -300, 0], [620, -320, 9], [-700, 260, 18], [680, 240, 6], [-160, -420, 26], [180, 420, 14], [-760, -20, 32], [740, 10, 40]
];

const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const a = useAspect();
  return (
    <Backdrop>
      <AbsoluteFill style={{ perspective: 1400, justifyContent: "center", alignItems: "center" }}>
        {REJECTIONS.map(([x, y, d], i) => {
          const t = (frame - d) / 70;
          if (t < 0 || t > 1.2) return null;
          const z = -1600 + 2200 * t;
          return (
            <div key={i} style={{
              position: "absolute", width: 460, padding: "18px 22px", borderRadius: 16, background: "rgba(255,255,255,.92)",
              transform: `translate3d(${x * (a.wide ? 1 : 0.6)}px, ${y * (a.vertical ? 1.8 : 1)}px, ${z}px) rotateY(${x > 0 ? -18 : 18}deg)`,
              filter: `blur(${2 + Math.abs(z) / 220}px)`, opacity: kf(t, [0, 0.15, 0.9, 1.1], [0, 0.6, 0.6, 0]),
              fontFamily: FONT, color: "#111827", boxShadow: "0 20px 60px rgba(0,0,0,.5)"
            }}>
              <div style={{ fontSize: 16, color: "#6b7280" }}>Re: Your application</div>
              <div style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>Unfortunately, we&apos;ve decided to move forward with other candidates.</div>
            </div>
          );
        })}
      </AbsoluteFill>
      {/* A soft dark pool behind the headline keeps it readable over the flying emails. */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 45% 32% at 50% 50%, rgba(7,7,15,.82), transparent)" }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 70px", gap: 10, flexDirection: "column", filter: "drop-shadow(0 10px 30px rgba(0,0,0,.6))" }}>
        <Kinetic text="100 applications." start={4} size={a.vertical ? 130 : 140} />
        <Kinetic text="Still no REPLY?" start={30} size={a.vertical ? 130 : 140} stagger={6} />
      </AbsoluteFill>
    </Backdrop>
  );
};

// ---- 2. The browser flies in; click the extension; the popup pops out ---------------------

const BrowserScene: React.FC = () => {
  const frame = useCurrentFrame();
  const s = useStage();
  const fly = kf(frame, [0, 26], [0, 1], Easing.out(Easing.cubic));
  const pop = useSpring(40, 11, 0.6);
  return (
    <Backdrop>
      <Camera scale={s.scale} y={s.y + 520 * (1 - fly)} rx={28 - 18 * fly} ry={-30 + 18 * fly} zoom={0.92 + 0.04 * fly}>
        <Browser><JobPage /></Browser>
        <div style={{ position: "absolute", left: ICON.x, top: ICON.y, transform: `scale(${1 + 0.15 * kf(frame, [36, 40, 46], [0, 1, 0])})` }}>
          <ExtIcon size={38} />
        </div>
        <Lift x={POPUP.x} y={POPUP.y} pop={pop} z={170}>
          <div style={{ opacity: Math.min(1, pop * 2), transform: `scale(${0.6 + 0.4 * pop})`, transformOrigin: "top right" }}>
            <JobPopup />
          </div>
        </Lift>
        <Hand path={[[8, 760, 760], [34, ICON.x + 14, ICON.y + 20], [60, ICON.x + 14, ICON.y + 20]]} clicks={[39]} />
      </Camera>
    </Backdrop>
  );
};

// ---- 3. Push into the popup; click the recruiters; their profile pops out ------------------

const RecruiterScene: React.FC = () => {
  const frame = useCurrentFrame();
  const s = useStage();
  const a = useAspect();
  const push = kf(frame, [0, 34], [0, 1]);
  const linkPop = useSpring(48, 10, 0.6);
  const chip = useSpring(56, 12, 0.6);
  const link = { x: POPUP.x + 18 * POPUP.zoom, y: POPUP.y + 192 * POPUP.zoom };
  return (
    <Backdrop>
      <Camera
        scale={s.scale} y={s.y} rx={10 - 6 * push} ry={-12 + 8 * push}
        zoom={0.96 + (a.wide ? 0.42 : 0.3) * push} focus={[POPUP.x + 40, POPUP.y + 300]} focusAmt={0.8 * push}
      >
        {/* Depth of field: the page blurs as the camera pushes into the popup. */}
        <Browser blur={7 * push}><JobPage /></Browser>
        <div style={{ position: "absolute", left: ICON.x, top: ICON.y }}><ExtIcon size={38} /></div>
        <Lift x={POPUP.x} y={POPUP.y} pop={1} z={170}><JobPopup glow={kf(frame, [40, 48], [0, 1])} /></Lift>
        {/* The clicked link lifts off the popup... */}
        <Lift x={link.x} y={link.y} pop={linkPop} z={170 + 130}>
          <div style={{ zoom: POPUP.zoom, width: 352, opacity: linkPop > 0.02 ? 1 : 0 }}>
            <LinkCard delay={-99} glow={1} label="University recruiters (at the company)" why="Recruiters run the hiring process. Message them with the Job ID." />
          </div>
        </Lift>
        {/* ...and the recruiter's card flies out beside it. */}
        <Lift x={POPUP.x - 440} y={POPUP.y + 250} pop={chip} z={320} glow={V.cyan}>
          <div style={{
            width: 430, padding: 22, borderRadius: 20, background: "#fff", fontFamily: FONT, display: "flex", gap: 18, alignItems: "center",
            opacity: Math.min(1, chip * 1.6), transform: `translateX(${(1 - chip) * 160}px) rotateY(${(1 - chip) * 30}deg)`
          }}>
            <div style={{ width: 78, height: 78, borderRadius: 39, background: "linear-gradient(135deg,#f59e0b,#ef4444)", color: "#fff", fontSize: 30, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>MC</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#111827" }}>{DEMO.recruiter}</div>
              <div style={{ fontSize: 18, color: "#6b7280" }}>{DEMO.recruiterTitle}</div>
              <div style={{ fontSize: 16, color: C.green, fontWeight: 700, marginTop: 6 }}>maya.chen@northwind.com</div>
            </div>
          </div>
        </Lift>
        <Hand path={[[0, 1200, 700], [40, link.x + 300, link.y + 40], [90, link.x + 300, link.y + 40]]} clicks={[46]} />
      </Camera>
      <Overlay text="Find the RECRUITER." start={8} />
    </Backdrop>
  );
};

// ---- 4. The message writes itself; copy; sparkles -----------------------------------------

const MESSAGE = `Hi Maya, I'm a ${DEMO.me.year} at ${DEMO.me.school} and just applied to ${DEMO.company}'s ${DEMO.role} role (Job ID ${DEMO.reqId}). I'd love to connect!`;

const WriteScene: React.FC = () => {
  const frame = useCurrentFrame();
  const s = useStage();
  const typed = useTyped(MESSAGE, 6, 44);
  const press = kf(frame, [56, 59, 64], [0, 1, 0], Easing.linear);
  const copied = useSpring(60, 9, 0.5);
  const card = { x: 300, y: 150, w: 840 };
  const copyBtn = { x: card.x + 40, y: card.y + 520 };
  return (
    <Backdrop hue={1}>
      <Camera scale={s.scale} y={s.y} rx={kf(frame, [0, 90], [12, -4])} ry={kf(frame, [0, 90], [-22, 14])} zoom={kf(frame, [0, 90], [1.0, 1.12])}>
        <Lift x={card.x} y={card.y} pop={1} z={0}>
          <div style={{ width: card.w, padding: 36, borderRadius: 28, background: "#fff", fontFamily: FONT, boxShadow: `0 40px 140px rgba(124,92,255,.5)` }}>
            <div style={{ fontSize: 30, fontWeight: 800 }}>Write message</div>
            <div style={{ fontSize: 22, color: C.muted, marginTop: 4 }}>To {DEMO.recruiter} · {DEMO.recruiterTitle}</div>
            <div style={{ display: "flex", gap: 10, margin: "20px 0" }}>
              {["Connection note", "LinkedIn message", "Email", "Follow-up"].map((k, i) => (
                <div key={k} style={{ fontSize: 18, borderRadius: 18, padding: "6px 16px", border: `2px solid ${C.accent}`, background: i === 0 ? C.accent : "#fff", color: i === 0 ? "#fff" : C.accent }}>{k}</div>
              ))}
            </div>
            <div style={{ border: `2px solid ${C.border}`, borderRadius: 16, padding: 22, height: 190, fontSize: 26, lineHeight: 1.45, color: "#111827" }}>
              {typed}
              <span style={{ color: V.violet, opacity: Math.floor(frame / 6) % 2 ? 1 : 0 }}>|</span>
            </div>
            <div style={{ textAlign: "right", color: C.muted, fontSize: 18, margin: "8px 0 18px" }}>{typed.length} / 200</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ fontSize: 22, borderRadius: 22, padding: "10px 26px", background: copied > 0.05 ? C.green : C.accent, color: "#fff", fontWeight: 700, transform: `scale(${(1 - 0.08 * press) * (1 + 0.12 * Math.sin(Math.min(1, copied) * Math.PI))})` }}>
                {copied > 0.05 ? "Copied ✓" : "Copy"}
              </div>
              <div style={{ fontSize: 22, borderRadius: 22, padding: "8px 24px", border: `2px solid ${V.violet}`, color: V.violet, fontWeight: 700 }}>AI personalize</div>
            </div>
          </div>
        </Lift>
        {/* Sparkle burst on copy */}
        {Array.from({ length: 10 }).map((_, i) => {
          const ang = (i / 10) * Math.PI * 2;
          const r = 30 + 120 * copied;
          return (
            <div key={i} style={{
              position: "absolute", left: copyBtn.x + 60 + Math.cos(ang) * r, top: copyBtn.y + 22 + Math.sin(ang) * r,
              width: 12, height: 12, borderRadius: 6, background: i % 2 ? V.cyan : V.violet,
              opacity: frame > 60 ? Math.max(0, 1 - (frame - 60) / 18) : 0, transform: "translateZ(120px)"
            }} />
          );
        })}
        <Hand path={[[0, 1100, 820], [50, copyBtn.x + 70, copyBtn.y + 30], [90, copyBtn.x + 70, copyBtn.y + 30]]} clicks={[58]} />
      </Camera>
      <Overlay text="Write it in ONE click." start={6} />
    </Backdrop>
  );
};

// ---- 5. Follow-ups fan out from the icon ---------------------------------------------------

const FOLLOWS = [
  ["MC", "Maya Chen", "Northwind", "#f59e0b"],
  ["JP", "Jordan Patel", "Acme Robotics", "#10b981"],
  ["SR", "Sam Rivera", "Lumen Labs", "#3b82f6"]
];

const FollowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const s = useStage();
  const badge = useSpring(6, 6, 0.5);
  return (
    <Backdrop>
      <Camera scale={s.scale} y={s.y} rx={14} ry={kf(frame, [0, 75], [-24, 8])} zoom={kf(frame, [0, 75], [0.95, 1.08])}>
        <div style={{ position: "absolute", left: 170, top: 330, transform: "translateZ(80px)" }}>
          <ExtIcon size={210} badge="3" badgePop={badge} />
        </div>
        {FOLLOWS.map(([ini, name, co, color], i) => {
          const p = useSpring(16 + i * 8, 12, 0.6);
          return (
            <Lift key={name} x={540 + i * 30} y={180 + i * 200} pop={p} z={60 + i * 50} glow={V.violet}>
              <div style={{
                width: 760, padding: "22px 26px", borderRadius: 22, background: "#fff", fontFamily: FONT, display: "flex", alignItems: "center", gap: 20,
                opacity: Math.min(1, p * 1.6), transform: `translateX(${(1 - p) * -300}px) rotateY(${(1 - p) * -40}deg)`
              }}>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: color, color: "#fff", fontSize: 24, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{ini}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#111827" }}>{name} <span style={{ color: "#6b7280", fontWeight: 500 }}>· {co}</span></div>
                  <div style={{ fontSize: 20, color: "#ef4444", fontWeight: 700 }}>Follow-up due today</div>
                </div>
                <div style={{ fontSize: 20, borderRadius: 20, padding: "8px 18px", background: C.accent, color: "#fff", fontWeight: 700 }}>Write follow-up</div>
              </div>
            </Lift>
          );
        })}
      </Camera>
      <Overlay text="Never miss a FOLLOW-UP." start={4} />
    </Backdrop>
  );
};

// ---- 6. Fresh internships stream past ------------------------------------------------------

const JOBS = [
  ["Software Engineer Intern (Summer 2027)", "Northwind", "3h ago", true],
  ["Data Science Intern, Summer 2027", "Bluebird Pay", "5h ago", true],
  ["Product Manager Intern", "Cobalt AI", "9h ago", true],
  ["ML Research Intern, 2027", "Acme Robotics", "1d ago", true],
  ["Software Engineer Co-op", "Lumen Labs", "1d ago", true],
  ["Quant Trading Intern", "Harbor Capital", "2d ago", false],
  ["Design Intern, Summer 2027", "Pixelworks", "2d ago", false],
  ["Security Engineer Intern", "Ironclad", "3d ago", false]
] as const;

const FindScene: React.FC = () => {
  const frame = useCurrentFrame();
  const s = useStage();
  const scroll = frame * 7;
  return (
    <Backdrop hue={1}>
      <Camera scale={s.scale} y={s.y} rx={26} ry={kf(frame, [0, 75], [-16, -4])} zoom={1.05}>
        {JOBS.map(([title, co, when, isNew], i) => {
          const y = 120 + i * 128 - scroll + 260;
          const p = useSpring(i * 3, 13, 0.6);
          const pulse = 1 + 0.08 * Math.sin(frame / 3 + i);
          return (
            <Lift key={title} x={260} y={y} pop={p} z={0}>
              <div style={{
                width: 920, padding: "20px 26px", borderRadius: 20, background: "#fff", fontFamily: FONT,
                opacity: Math.min(1, p * 1.5) * kf(y, [-200, -60, 560, 700], [0, 1, 1, 0], Easing.linear),
                transform: `translateX(${(1 - p) * 220}px)`, boxShadow: "0 20px 60px rgba(0,0,0,.35)"
              }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.accent, display: "flex", alignItems: "center", gap: 14 }}>
                  {title}
                  {isNew ? <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", background: C.green, borderRadius: 8, padding: "3px 10px", transform: `scale(${pulse})` }}>NEW</span> : null}
                </div>
                <div style={{ fontSize: 20, color: "#6b7280", marginTop: 4 }}>{co} · Posted {when}</div>
              </div>
            </Lift>
          );
        })}
      </Camera>
      <Overlay text="Fresh internships, LIVE." start={4} />
    </Backdrop>
  );
};

// ---- 7. End card -----------------------------------------------------------------------------

const EndScene: React.FC = () => {
  const frame = useCurrentFrame();
  const a = useAspect();
  const logo = useSpring(0, 10, 0.7);
  const ring = kf(frame, [8, 40], [0, 1], Easing.out(Easing.cubic));
  const pill = useSpring(48, 14, 0.6);
  const url = useSpring(58, 14, 0.6);
  return (
    <Backdrop>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", perspective: 1400, transform: `scale(${kf(frame, [0, 120], [1, 1.05])})` }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, padding: "0 60px" }}>
          <div style={{ position: "relative", transform: `rotateY(${(1 - logo) * 120}deg) scale(${0.4 + 0.6 * logo})` }}>
            <div style={{
              position: "absolute", left: "50%", top: "50%", width: 600 * ring, height: 600 * ring, borderRadius: "50%",
              border: `3px solid rgba(124,92,255,${0.7 * (1 - ring)})`, transform: "translate(-50%,-50%)"
            }} />
            <ExtIcon size={a.vertical ? 230 : 190} />
          </div>
          <Kinetic text="Sourcing Helper" start={12} size={a.vertical ? 120 : 130} stagger={5} />
          <Kinetic text="Find them. Message them. Follow up." start={28} size={a.vertical ? 52 : 50} weight={600} stagger={3} color={V.dim} />
          <div style={{ display: "flex", flexDirection: a.wide ? "row" : "column", gap: 18, alignItems: "center", marginTop: 10 }}>
            <div style={{ opacity: pill, transform: `translateY(${(1 - pill) * 40}px)`, background: `linear-gradient(90deg, ${V.violet}, ${V.blue})`, color: "#fff", fontWeight: 800, fontSize: a.vertical ? 34 : 32, borderRadius: 40, padding: "14px 34px" }}>
              Free Chrome extension
            </div>
            <div style={{ opacity: url, transform: `translateY(${(1 - url) * 40}px)`, border: "1.5px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.06)", color: V.text, fontWeight: 600, fontSize: a.vertical ? 26 : 30, borderRadius: 40, padding: "14px 30px", whiteSpace: "nowrap" }}>
              github.com/Doggo21345/linkedin-sourcing-helper
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
};

const SCENES: Record<string, React.FC> = {
  hook: Hook, browser: BrowserScene, recruiter: RecruiterScene, write: WriteScene, follow: FollowScene, find: FindScene, end: EndScene
};

export const TrailerV2: React.FC = () => (
  <AbsoluteFill style={{ background: V.bg }}>
    {/* Original track, synthesized by music/make_music.py from the same timeline. */}
    <Audio src={staticFile("music-v2.wav")} volume={0.9} />
    <Series>
      {timeline.scenes.map(({ id, frames }) => {
        const Scene = SCENES[id];
        return (
          <Series.Sequence key={id} durationInFrames={frames}>
            {/* The end card holds still at the end instead of zooming out. */}
            <SceneZoom len={id === "end" ? frames + 99 : frames} inFrames={id === "browser" || id === "recruiter" ? 4 : 9}>
              <Scene />
            </SceneZoom>
          </Series.Sequence>
        );
      })}
    </Series>
  </AbsoluteFill>
);

