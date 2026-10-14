// The trailer, v4: SaaS motion-graphics style. Kinetic type that slides in with
// motion blur and brightens from grey, hard cuts on the beat between ink and
// paper scenes, and the REAL popup cut into pieces (public/parts/, shot by
// capture/capture.mjs) that fly in one at a time. Every sound effect is keyed
// to a cue in v4.json, which music/make_v4.py reads to build the soundtrack.
import React, { useEffect, useId, useState } from "react";
import {
  AbsoluteFill, Audio, Easing, Img, Series, cancelRender, continueRender, delayRender,
  interpolate, interpolateColors, staticFile, useCurrentFrame
} from "remotion";
import V4 from "./v4.json";
import PARTS from "../public/parts/parts.json";
import { useAspect } from "./fx";
import { INTER_WOFF2_BASE64 } from "./inter-font";

export const TRAILER_FRAMES = V4.scenes.reduce((a, s) => a + s.frames, 0);

// ---- Font: Inter, bundled (OFL), loaded before the first frame renders ----------------------
// Registered straight away from the embedded bytes; each composition then waits
// (polling, so a missed load event can't stall a render tab) until it's usable.
const interBytes = Uint8Array.from(atob(INTER_WOFF2_BASE64), (c) => c.charCodeAt(0));
const inter = new FontFace("Inter", interBytes.buffer, { weight: "100 900" });
document.fonts.add(inter);
inter.load().catch((e) => cancelRender(e));

function useInter() {
  const [handle] = useState(() => delayRender("Loading Inter"));
  useEffect(() => {
    const done = () => inter.status === "loaded" && document.fonts.check('600 40px "Inter"');
    if (done()) { continueRender(handle); return; }
    const id = setInterval(() => { if (done()) { clearInterval(id); continueRender(handle); } }, 30);
    return () => clearInterval(id);
  }, [handle]);
}

// ---- Look ------------------------------------------------------------------------------------
const T = {
  ink: "#0A0A10", paper: "#F5F4F0", dark: "#0E0F1A",
  dimInk: "#4A4C5E", dimPaper: "#C2C0B8",
  indigo: "#7C6CFF", sky: "#38BDF8", mint: "#34D399", amber: "#FBBF24", rose: "#FB7185"
};
const GRAD = `linear-gradient(90deg, ${T.indigo}, ${T.sky})`;
const INTER = "Inter, sans-serif";
const POPUP_FONT = '-apple-system, "Segoe UI", Roboto, sans-serif'; // what the parts were shot in
type Tone = "ink" | "paper";

const OUT = Easing.bezier(0.16, 1, 0.3, 1);
const INOUT = Easing.bezier(0.65, 0, 0.35, 1);
const IN = Easing.bezier(0.7, 0, 0.84, 0);
const e = (f: number, a: number, b: number, from = 0, to = 1, curve = OUT) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: curve });

type CueMap = Record<string, Record<string, { at: number; len?: number; sfx: string }>>;
const CUES = V4.cues as CueMap;
const cue = (scene: string, name: string) => CUES[scene][name].at;

// ---- Building blocks ---------------------------------------------------------------------------

/** Directional (horizontal and/or vertical) blur, the "motion blur" of things moving fast. */
const Blur: React.FC<{ x?: number; y?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ x = 0, y = 0, style, children }) => {
  const id = "mb" + useId().replace(/:/g, "");
  const on = x > 0.25 || y > 0.25;
  return (
    <div style={{ ...style, filter: on ? `url(#${id})` : undefined }}>
      {on ? (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <filter id={id} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={`${x.toFixed(2)} ${y.toFixed(2)}`} /></filter>
        </svg>
      ) : null}
      {children}
    </div>
  );
};

/** Kinetic type: each word slides in from the right with motion blur, arrives grey, then brightens. ALL-CAPS = accent. */
const Kinetic: React.FC<{
  text: string; start: number; size: number; tone: Tone; stagger?: number; weight?: number; exitAt?: number; maxWidth?: number;
}> = ({ text, start, size, tone, stagger = 5, weight = 600, exitAt, maxWidth }) => {
  const f = useCurrentFrame();
  const full = tone === "ink" ? "#F7F7FA" : T.dark;
  const dim = tone === "ink" ? T.dimInk : T.dimPaper;
  const out = exitAt === undefined ? 0 : e(f, exitAt, exitAt + 14, 0, 1, IN);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.24}px`, maxWidth, lineHeight: 1.06 }}>
      {text.split(" ").map((w, i) => {
        const t0 = start + i * stagger;
        const p = e(f, t0, t0 + 18);
        const lit = e(f, t0 + 8, t0 + 28, 0, 1, INOUT);
        const emph = w.length > 1 && w.replace(/[^A-Za-z]/g, "") === w.replace(/[^A-Za-z]/g, "").toUpperCase() && /[A-Z]{2}/.test(w);
        const word = emph ? w.charAt(0) + w.slice(1).toLowerCase() : w;
        return (
          <Blur key={i} x={(1 - p) * 26 + out * 30} style={{
            display: "inline-block", opacity: Math.min(1, p * 2.5) * (1 - out),
            transform: `translateX(${(1 - p) * size * 0.9 - out * size * 1.2}px)`
          }}>
            <span style={{
              fontFamily: INTER, fontSize: size, fontWeight: weight, letterSpacing: "-0.04em", whiteSpace: "nowrap",
              color: interpolateColors(lit, [0, 1], [dim, full]),
              ...(emph ? { backgroundImage: GRAD, WebkitBackgroundClip: "text", color: lit > 0.5 ? "transparent" : dim } : {})
            }}>{word}</span>
          </Blur>
        );
      })}
    </div>
  );
};

/** Background: ink with a soft moving spotlight, or warm paper. A little film grain on both. */
const Bg: React.FC<{ tone: Tone; children?: React.ReactNode }> = ({ tone, children }) => {
  const f = useCurrentFrame();
  const sx = 72 + 6 * Math.sin(f / 70), sy = 8 + 5 * Math.cos(f / 90);
  const bg = tone === "ink"
    ? `radial-gradient(60% 70% at ${sx}% ${sy}%, rgba(124,108,255,.22), transparent 70%), radial-gradient(50% 60% at 12% 100%, rgba(56,189,248,.12), transparent 70%), ${T.ink}`
    : `radial-gradient(70% 60% at 50% 0%, #ffffff, transparent 70%), radial-gradient(50% 50% at 90% 100%, rgba(124,108,255,.10), transparent 70%), ${T.paper}`;
  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      {children}
      <AbsoluteFill style={{ opacity: tone === "ink" ? 0.07 : 0.05, mixBlendMode: tone === "ink" ? "screen" : "multiply", pointerEvents: "none" }}>
        <svg width="100%" height="100%"><filter id={`grain-${tone}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 7} /></filter>
          <rect width="100%" height="100%" filter={`url(#grain-${tone})`} /></svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Every scene punches in a little on its cut, the way the reference's cuts feel. */
const Punch: React.FC<{ len: number; children: React.ReactNode }> = ({ len, children }) => {
  const f = useCurrentFrame();
  const s = e(f, 0, 22, 1.05, 1) * e(f, len - 8, len, 1, 1.025, IN);
  return <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>;
};

function useLayout() {
  const a = useAspect();
  if (a.vertical) return { a, titleTop: 250, titleSize: 96, area: { top: 600, bottom: 250 }, tall: true };
  if (a.square) return { a, titleTop: 70, titleSize: 74, area: { top: 230, bottom: 40 }, tall: true };
  return { a, titleTop: 80, titleSize: 92, area: { top: 230, bottom: 30 }, tall: false };
}

// ---- Camera: each UI scene is cut into shots (medium push, extreme close-up, very wide) -------

type Pt = [number, number];
type Range = [number, number];
/** One shot: from frame `at` until the next shot. z = zoom, f = focus point (stage px), drifting start -> end. */
type Shot = { at: number; z: Range; f: [Pt, Pt]; rx?: Range; ry?: Range; rz?: Range; full?: boolean };
type Cam = { z: number; fx: number; fy: number; rx: number; ry: number; rz: number; full: boolean };

// Moves fast right after a cut and eases off, like a camera move that started before the cut.
const DRIFT = Easing.bezier(0.2, 0.55, 0.35, 1);
const sceneLen = (id: string) => V4.scenes.find((x) => x.id === id)!.frames;

function useCam(scene: string, shots: Shot[]): Cam {
  const f = useCurrentFrame();
  // A tall frame shows a narrow slice of the stage, so close-ups there need less zoom.
  const L = useLayout();
  const tallK = L.a.vertical ? 0.6 : L.a.square ? 0.75 : 1;
  let i = 0;
  shots.forEach((sh, j) => { if (f >= sh.at) i = j; });
  const sh = shots[i];
  const end = shots[i + 1]?.at ?? sceneLen(scene);
  const p = e(f, sh.at, end, 0, 1, DRIFT);
  const lerp = (r: Range | undefined) => (r ? r[0] + (r[1] - r[0]) * p : 0);
  // A hard cut lands a touch too close and settles: the punch of the cut.
  const settle = i ? 1 + 0.06 * (1 - e(f, sh.at, sh.at + 14)) : 1;
  return {
    z: lerp(sh.z) * settle * (sh.full ? tallK : 1), fx: sh.f[0][0] + (sh.f[1][0] - sh.f[0][0]) * p, fy: sh.f[0][1] + (sh.f[1][1] - sh.f[0][1]) * p,
    rx: lerp(sh.rx), ry: lerp(sh.ry), rz: lerp(sh.rz), full: !!sh.full
  };
}

/** Shallow depth of field on close-ups: sharp in the middle, soft toward the edges. */
const Dof: React.FC = () => (
  <AbsoluteFill style={{
    backdropFilter: "blur(9px)", WebkitBackdropFilter: "blur(9px)", pointerEvents: "none",
    maskImage: "radial-gradient(ellipse 52% 46% at 50% 50%, transparent 40%, black 100%)",
    WebkitMaskImage: "radial-gradient(ellipse 52% 46% at 50% 50%, transparent 40%, black 100%)"
  }} />
);

/**
 * A fixed-size design surface. Children use stage pixels. With no camera it's scaled to fit the area
 * under the title; a camera zooms toward its focus point, and close-ups ("full") use the whole frame.
 */
const Stage: React.FC<{ w: number; h: number; tilt?: [number, number]; zoom?: number; cam?: Cam; children: React.ReactNode }> = ({
  w, h, tilt = [0, 0], zoom = 1, cam, children
}) => {
  const L = useLayout();
  const availH = L.a.height - L.area.top - L.area.bottom;
  // zoom > 1 lets content use the stage's empty margins on wide frames.
  const k = Math.min(L.a.width / w, availH / h) * 0.94 * (L.tall ? 1 : zoom);
  const c = cam ?? { z: 1, fx: w / 2, fy: h / 2, rx: 0, ry: 0, rz: 0, full: false };
  const sx = L.a.width / 2;
  const sy = c.full ? L.a.height / 2 : L.area.top + availH / 2;
  const K = k * c.z;
  return (
    <>
      <AbsoluteFill style={{ perspective: 2400, perspectiveOrigin: `${sx}px ${sy}px` }}>
        <div style={{
          position: "absolute", left: 0, top: 0, width: w, height: h, transformOrigin: "0 0", transformStyle: "preserve-3d",
          transform: `translate(${sx - c.fx * K}px, ${sy - c.fy * K}px) scale3d(${K}, ${K}, ${K})`
        }}>
          <div style={{
            position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: `${c.fx}px ${c.fy}px`,
            transform: `rotateX(${tilt[0] + c.rx}deg) rotateY(${tilt[1] + c.ry}deg) rotateZ(${c.rz}deg)`
          }}>
            {children}
          </div>
        </div>
      </AbsoluteFill>
      {c.full ? <Dof /> : null}
    </>
  );
};

const Title: React.FC<{ text: string; tone: Tone; start?: number; show?: boolean }> = ({ text, tone, start = 2, show = true }) => {
  const L = useLayout();
  if (!show) return null;
  return (
    <div style={{ position: "absolute", top: L.titleTop, left: 60, right: 60, display: "flex", justifyContent: "center" }}>
      <Kinetic text={text} start={start} size={L.titleSize} tone={tone} stagger={4} />
    </div>
  );
};

/** One real piece of the popup, at k times its CSS size, on a white card. */
const Part: React.FC<{ name: string; k: number; crop?: number; pad?: number; radius?: number; glow?: string; style?: React.CSSProperties }> = ({
  name, k, crop, pad = 8, radius = 16, glow, style
}) => {
  const p = (PARTS as Record<string, { w: number; h: number }>)[name];
  return (
    <div style={{
      background: "#fff", borderRadius: radius, padding: pad, overflow: "hidden", width: p.w * k + pad * 2,
      boxShadow: `0 0 0 1px rgba(15,16,26,.06), 0 2px 6px rgba(15,16,26,.06), 0 24px 60px rgba(15,16,26,.16)${glow ? `, 0 0 0 4px ${glow}` : ""}`,
      ...style
    }}>
      <div style={{ height: (crop ?? p.h) * k, overflow: "hidden" }}>
        <Img src={staticFile(`parts/${name}.png`)} style={{ width: p.w * k, display: "block" }} />
      </div>
    </div>
  );
};

/** Things that fly in from depth: tilt back, scale, blur, and land. */
const FlyIn: React.FC<{ at: number; x: number; y: number; from?: "below" | "right" | "depth" | "left"; children: React.ReactNode; z?: number; float?: number }> = ({
  at, x, y, from = "depth", children, z = 0, float = 0
}) => {
  const f = useCurrentFrame();
  const p = e(f, at - 6, at + 20);
  const dx = from === "right" ? 260 : from === "left" ? -260 : 0;
  const dy = from === "below" ? 200 : from === "depth" ? 60 : 0;
  const drift = float ? Math.sin((f - at) / 40) * float : 0;
  return (
    <Blur x={from === "right" || from === "left" ? (1 - p) * 30 : 0} y={from === "below" ? (1 - p) * 24 : 0} style={{
      position: "absolute", left: x, top: y, opacity: Math.min(1, p * 2),
      transform: `translate3d(${(1 - p) * dx}px, ${(1 - p) * dy + drift}px, ${z + (from === "depth" ? (1 - p) * -500 : 0)}px) rotateX(${(1 - p) * 30}deg) scale(${0.92 + 0.08 * p})`,
      transformOrigin: "50% 100%"
    }}>{children}</Blur>
  );
};

/** A macOS-style arrow pointer that glides between [frame, x, y] points and presses on clicks. */
const Pointer: React.FC<{ path: Array<[number, number, number]>; clicks?: number[]; z?: number }> = ({ path, clicks = [], z = 2 }) => {
  const f = useCurrentFrame();
  const at = path.map((p) => p[0]);
  const x = interpolate(f, at, path.map((p) => p[1]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: INOUT });
  const y = interpolate(f, at, path.map((p) => p[2]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: INOUT });
  const press = Math.max(0, ...clicks.map((c) => interpolate(f, [c - 4, c, c + 8], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const ring = Math.max(0, ...clicks.map((c) => (f >= c && f < c + 22 ? (f - c) / 22 : 0)));
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: e(f, at[0], at[0] + 8), transform: `translateZ(${z}px) scale(${1 - 0.15 * press})`, transformOrigin: "0 0", pointerEvents: "none" }}>
      {ring > 0 ? <div style={{ position: "absolute", left: -46 * ring, top: -46 * ring, width: 92 * ring, height: 92 * ring, borderRadius: "50%", border: `3px solid rgba(124,108,255,${1 - ring})` }} /> : null}
      <svg width="58" height="58" viewBox="0 0 28 28" style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,.35))" }}>
        <path d="M4 2.5 L4 22 L9 17.4 L12.4 25 L15.6 23.6 L12.3 16.2 L19 16.2 Z" fill="#fff" stroke="#0E0F1A" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const LogoMark: React.FC<{ size: number; round?: boolean }> = ({ size, round }) => (
  <div style={{
    width: size, height: size, borderRadius: round ? size : size * 0.26, flex: "none",
    background: `linear-gradient(135deg, ${T.indigo}, ${T.sky})`, display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `inset 0 ${size * 0.03}px 0 rgba(255,255,255,.35), 0 ${size * 0.12}px ${size * 0.4}px rgba(124,108,255,.45)`
  }}>
    <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6" /><path d="M15 15 L20.5 20.5" />
      <circle cx="10.5" cy="9" r="1.8" fill="#fff" stroke="none" /><path d="M7.4 13.2 C8.4 11.8 12.6 11.8 13.6 13.2" />
    </svg>
  </div>
);

const Pill: React.FC<{ children: React.ReactNode; dark?: boolean; size?: number }> = ({ children, dark, size = 28 }) => (
  <div style={{
    display: "inline-flex", alignItems: "center", gap: size * 0.4, padding: `${size * 0.45}px ${size * 0.9}px`, borderRadius: 999,
    fontFamily: INTER, fontWeight: 600, fontSize: size, letterSpacing: "-0.01em", whiteSpace: "nowrap",
    background: dark ? "rgba(14,15,26,.92)" : "#fff", color: dark ? "#fff" : T.dark,
    boxShadow: dark ? "0 0 0 1px rgba(255,255,255,.12), 0 18px 40px rgba(0,0,0,.35)" : "0 0 0 1px rgba(15,16,26,.08), 0 18px 40px rgba(15,16,26,.15)"
  }}>{children}</div>
);

const Glass: React.FC<{ w: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ w, children, style }) => (
  <div style={{
    width: w, borderRadius: 28, padding: 28, fontFamily: INTER,
    background: "linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03))",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.09), 0 40px 100px rgba(0,0,0,.45)", ...style
  }}>{children}</div>
);

// ---- 1. The pain: 100 applications, 0 replies -------------------------------------------------

const Pain: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const c = CUES.pain.count;
  const n = Math.round(e(f, c.at, c.at + (c.len ?? 40), 0, 100, Easing.bezier(0.3, 0, 0.2, 1)));
  const size = L.a.vertical ? 120 : L.a.square ? 104 : 140;
  const out = e(f, 104, 118, 0, 1, IN);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: size * 0.2 }}>
      <Blur x={out * 30} style={{ display: "flex", alignItems: "baseline", gap: size * 0.24, flexWrap: "wrap", justifyContent: "center", opacity: 1 - out, transform: `translateX(${-out * 200}px)` }}>
        <span style={{ fontFamily: INTER, fontWeight: 650, fontSize: size * 1.25, letterSpacing: "-0.05em", color: "#fff", fontVariantNumeric: "tabular-nums", opacity: e(f, 2, 8) }}>{n}</span>
        <Kinetic text="applications sent." start={10} size={size} tone="ink" />
      </Blur>
      <Kinetic text="0 replies." start={cue("pain", "line2")} size={size} tone="ink" exitAt={104} />
    </AbsoluteFill>
  );
};

// ---- 2. The inbox fills with rejections -------------------------------------------------------

const MAILS = [
  ["Northwind Careers", "N", "#6366F1", "9:41 AM"],
  ["Bluebird Pay Recruiting", "B", "#0EA5E9", "Yesterday"],
  ["Cobalt AI", "C", "#F59E0B", "Mon"],
  ["Acme Robotics Talent", "A", "#10B981", "Sun"],
  ["Lumen Labs Hiring", "L", "#EC4899", "Sat"]
];

const Inbox: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const ROW = 118;
  const arrive = MAILS.map((_, i) => e(f, cue("inbox", `mail${i}`) - 4, cue("inbox", `mail${i}`) + 14));
  const back = e(f, cue("inbox", "back"), cue("inbox", "back") + 20, 0, 1, INOUT);
  const W = L.tall ? 940 : 1180;
  const SW = L.tall ? 1000 : 1400, SH = L.tall ? 900 : 800;
  // Close-up on "Unfortunately" in the newest mail.
  const fx = (SW - W) / 2 + (L.tall ? 380 : 470), fy = 182;
  const cam = useCam("inbox", [
    { at: 0, z: [1, 1.14], f: [[SW / 2, SH / 2], [SW / 2, SH / 2 - 20]] },
    { at: cue("inbox", "shotB"), z: [3.0, 3.4], f: [[fx - 80, fy], [fx + 40, fy]], rz: [-3, -1], full: true },
    { at: cue("inbox", "shotC"), z: [0.82, 0.76], f: [[SW / 2, SH / 2], [SW / 2, SH / 2]], rx: [10, 4] }
  ]);
  return (
    <>
      <Stage w={SW} h={SH} cam={cam}>
        <div style={{
          position: "absolute", left: "50%", top: 30, transform: `translateX(-50%) scale(${1 - 0.1 * back})`, filter: back > 0.01 ? `blur(${10 * back}px)` : undefined,
          opacity: 1 - 0.65 * back
        }}>
          <Glass w={W} style={{ height: 120 + ROW * 5 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ color: "#fff", fontSize: 40, fontWeight: 650, letterSpacing: "-0.03em" }}>Inbox</div>
              <div style={{ color: "#fff", background: "rgba(251,113,133,.18)", border: "1px solid rgba(251,113,133,.4)", borderRadius: 999, padding: "6px 18px", fontSize: 24, fontWeight: 600 }}>
                {arrive.filter((p) => p > 0.5).length} new
              </div>
            </div>
            <div style={{ position: "relative" }}>
              {MAILS.map(([from, init, color, when], i) => {
                // Newest on top: each later mail pushes this one down a row.
                const below = arrive.slice(i + 1).reduce((a, p) => a + p, 0);
                const p = arrive[i];
                return (
                  <Blur key={i} y={(1 - p) * 14} style={{
                    position: "absolute", left: 0, right: 0, top: below * ROW, height: ROW - 14, opacity: p,
                    transform: `translateY(${(1 - p) * -40}px) scale(${0.96 + 0.04 * p})`,
                    display: "flex", alignItems: "center", gap: 22, padding: "0 22px", borderRadius: 18,
                    background: "rgba(255,255,255,.05)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)"
                  }}>
                    <div style={{ width: 62, height: 62, borderRadius: 31, background: color, color: "#fff", fontWeight: 700, fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{init}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontSize: 26, fontWeight: 600 }}>
                        <span>{from}</span><span style={{ color: "#8B8DA0", fontWeight: 500, fontSize: 22 }}>{when}</span>
                      </div>
                      <div style={{ color: "#A9ABBD", fontSize: 23, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 6 }}>
                        <span style={{ color: "#fff", fontWeight: 500 }}>Update on your application</span> · <span style={{ color: T.rose }}>Unfortunately</span>, we have decided not to move forward…
                      </div>
                    </div>
                  </Blur>
                );
              })}
            </div>
          </Glass>
        </div>
      </Stage>
      {back > 0 ? (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <Kinetic text="Sound familiar?" start={cue("inbox", "back") + 4} size={L.a.vertical ? 130 : 150} tone="ink" />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

// ---- 3. The turn ------------------------------------------------------------------------------

const Turn: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const size = L.a.vertical ? 104 : L.a.square ? 88 : 120;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: size * 0.3, padding: "0 60px", transform: `scale(${e(f, 70, 120, 1, 1.1, IN)})` }}>
      <Kinetic text="Stop waiting on the portal." start={cue("turn", "line1")} size={size * 0.62} tone="paper" weight={550} />
      <Kinetic text="Message the people HIRING." start={cue("turn", "line2")} size={size} tone="paper" stagger={6} />
    </AbsoluteFill>
  );
};

// ---- 4. Introducing ---------------------------------------------------------------------------

const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const at = cue("intro", "card");
  const word = "introducing";
  const gone = e(f, at - 8, at + 2, 0, 1, IN);
  const land = e(f, at - 4, at + 26);
  const sheen = e(f, at + 14, at + 60, -40, 140, INOUT);
  const size = L.a.vertical ? 92 : L.a.square ? 84 : 128;
  const chip = e(f, cue("intro", "chip") - 4, cue("intro", "chip") + 16);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", perspective: 1600 }}>
      {gone < 1 ? (
        <div style={{ display: "flex", transform: `rotateY(${e(f, 0, 50, -28, 0, INOUT)}deg) scale(${1 - 0.3 * gone})`, opacity: 1 - gone, filter: gone > 0 ? `blur(${gone * 12}px)` : undefined, transformStyle: "preserve-3d" }}>
          {word.split("").map((ch, i) => {
            const p = e(f, 2 + i * 2.2, 30 + i * 2.2);
            return (
              <span key={i} style={{
                display: "inline-block", fontFamily: INTER, fontWeight: 600, fontSize: L.a.vertical ? 140 : 170, letterSpacing: "-0.04em",
                color: interpolateColors(p, [0, 1], [T.dimInk, "#F7F7FA"]), opacity: p,
                transform: `rotateX(${(1 - p) * -110}deg)`, transformOrigin: "50% 50% -90px"
              }}>{ch}</span>
            );
          })}
        </div>
      ) : null}
      {f >= at - 4 ? (
        <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", gap: 46 }}>
          <div style={{
            position: "relative", overflow: "hidden", display: "flex", flexDirection: L.a.vertical ? "column" : "row", alignItems: "center", gap: size * 0.4,
            padding: L.a.vertical ? "60px 70px" : `${size * 0.32}px ${size * 0.55}px`, borderRadius: size * 0.36,
            background: "linear-gradient(180deg, #FFFFFF, #ECECF4)",
            boxShadow: "0 0 0 1px rgba(255,255,255,.7), 0 0 90px rgba(255,255,255,.22), 0 50px 140px rgba(124,108,255,.45)",
            opacity: Math.min(1, land * 2), filter: land < 1 ? `blur(${(1 - land) * 18}px)` : undefined,
            transform: `scale(${1.5 - 0.5 * land}) rotate(${-9 + 6 * land + e(f, at + 26, 150, 0, 1.5, Easing.linear)}deg)`
          }}>
            <LogoMark size={size * 1.15} />
            <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: size, letterSpacing: "-0.045em", color: T.dark, whiteSpace: "nowrap" }}>Sourcing Helper</div>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${sheen}%`, width: "18%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent)", transform: "skewX(-20deg)" }} />
          </div>
          <div style={{ opacity: chip, transform: `translateY(${(1 - chip) * 30}px)` }}>
            <Pill dark size={L.a.vertical ? 34 : 30}><span style={{ width: 12, height: 12, borderRadius: 6, background: T.mint, boxShadow: `0 0 12px ${T.mint}` }} />Free Chrome extension</Pill>
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---- 5. Find who's hiring ---------------------------------------------------------------------

const Find: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const click = cue("find", "click");
  const chosen = e(f, click, click + 10);
  const chip = e(f, cue("find", "chip") - 4, cue("find", "chip") + 14);
  // Wide: posting on the left, Start here cards on the right. Tall: everything stacked.
  const W = L.tall
    ? { w: 1000, h: 1100, tabs: [40, 0, 2.6], post: [40, 110, 2.6], k: 2.6, cards: [[40, 300], [40, 560], [40, 740]] }
    : { w: 1400, h: 760, tabs: [10, 190, 1.8], post: [10, 270, 1.8], k: 1.9, cards: [[700, 70], [700, 300], [700, 450]] };
  const c0 = W.cards[0];
  // Close-up: the first card and the pointer clicking it.
  const [fx, fy] = L.tall ? [470, 400] : [1050, 150];
  const cam = useCam("find", [
    { at: 0, z: [1, 1.16], f: [[W.w / 2, W.h / 2], [W.w / 2 + 40, W.h / 2 - 20]] },
    { at: cue("find", "shotB"), z: [2.5, 2.9], f: [[fx - 70, fy + 10], [fx + 20, fy]], ry: [-8, 2], full: true },
    { at: cue("find", "shotC"), z: [0.74, 0.66], f: [[W.w / 2, W.h / 2], [W.w / 2, W.h / 2]], rx: [16, 10], ry: [-24, -12] }
  ]);
  return (
    <>
      <Title text="Find who's HIRING." tone="paper" show={!cam.full} />
      <Stage w={W.w} h={W.h} zoom={1.2} cam={cam} tilt={[e(f, 0, 180, 10, 4, Easing.linear), e(f, 0, 180, L.tall ? 0 : -8, L.tall ? 0 : -3, Easing.linear)]}>
        <FlyIn at={cue("find", "posting") - 4} x={W.tabs[0]} y={W.tabs[1]} from="below" float={4}><Part name="tabs" k={W.tabs[2]} /></FlyIn>
        <FlyIn at={cue("find", "posting")} x={W.post[0]} y={W.post[1]} from="below" float={5}><Part name="posting" k={W.post[2]} /></FlyIn>
        {[0, 1, 2].map((i) => (
          <FlyIn key={i} at={cue("find", `card${i}`)} x={W.cards[i][0]} y={W.cards[i][1]} from="depth" z={i === 0 ? 40 * chosen : 0} float={6}>
            <div style={{ transform: `scale(${i === 0 ? 1 + 0.03 * chosen : 1})`, transformOrigin: "50% 50%" }}>
              <Part name={`start-${i}`} k={W.k} glow={i === 0 && chosen > 0 ? `rgba(124,108,255,${0.9 * chosen})` : undefined} />
            </div>
          </FlyIn>
        ))}
        <div style={{ position: "absolute", left: L.tall ? c0[0] + 380 : c0[0] - 470, top: L.tall ? c0[1] - 60 : c0[1] + 50, opacity: chip, transform: `translateY(${(1 - chip) * 20}px) scale(${0.9 + 0.1 * chip})` }}>
          <Pill dark size={L.tall ? 32 : 26}>Opens the right LinkedIn search ↗</Pill>
        </div>
        <Pointer path={[[70, W.w + 80, W.h + 60], [click - 6, c0[0] + (L.tall ? 520 : 380), c0[1] + (L.tall ? 70 : 52)], [180, c0[0] + (L.tall ? 520 : 380), c0[1] + (L.tall ? 70 : 52)]]} clicks={[click]} z={50} />
      </Stage>
    </>
  );
};

// ---- 6. Get their email -----------------------------------------------------------------------

const STEPS = [
  ["Company email format", "first.last@northwind.com"],
  ["Email finders", "with your own free keys"],
  ["Verifier", "mailbox exists"]
];

const Email: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const found = cue("email", "found");
  const pop = e(f, found - 4, found + 18);
  const W = L.tall ? { w: 1000, h: 1100, panel: [40, 0], card: [60, 640], k: 2.5 } : { w: 1400, h: 760, panel: [40, 90], card: [720, 250], k: 1.85 };
  // Close-up: the found address and its Verified badge (CSS x ~200, y ~13 in the part).
  const fx = W.card[0] + 18 + (L.tall ? 165 : 200) * W.k, fy = W.card[1] + 18 + 13 * W.k;
  const cam = useCam("email", [
    { at: 0, z: [1.05, 1.2], f: L.tall ? [[500, 330], [500, 300]] : [[560, 330], [520, 310]] },
    { at: cue("email", "shotB"), z: [2.6, 3.0], f: [[fx + 40, fy], [fx - 40, fy]], rz: [2, 0], full: true },
    { at: cue("email", "shotC"), z: [0.74, 0.66], f: [[W.w / 2, W.h / 2], [W.w / 2, W.h / 2]], rx: [14, 8], ry: [-20, -10] }
  ]);
  return (
    <>
      <Title text="Get their EMAIL." tone="ink" show={!cam.full} />
      <Stage w={W.w} h={W.h} zoom={1.2} cam={cam}>
        <FlyIn at={6} x={W.panel[0]} y={W.panel[1]} from="left">
          <Glass w={L.tall ? 920 : 640}>
            {STEPS.map(([label, detail], i) => {
              const t = cue("email", `step${i}`);
              const run = e(f, t - 14, t - 2);   // checking
              const done = e(f, t, t + 10);      // done
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 22, padding: "20px 8px", borderTop: i ? "1px solid rgba(255,255,255,.08)" : undefined, opacity: 0.35 + 0.65 * Math.max(run, done) }}>
                  <div style={{ width: 48, height: 48, borderRadius: 24, flex: "none", position: "relative", border: `3px solid ${done > 0.5 ? T.mint : "rgba(255,255,255,.25)"}`, background: done > 0.5 ? "rgba(52,211,153,.15)" : undefined, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {done > 0.5 ? (
                      <svg width="26" height="26" viewBox="0 0 24 24" style={{ transform: `scale(${done})` }}><path d="M5 12.5 L10 17 L19 7" stroke={T.mint} strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ) : run > 0 ? (
                      <div style={{ position: "absolute", inset: -3, borderRadius: 24, border: "3px solid transparent", borderTopColor: T.sky, transform: `rotate(${f * 14}deg)` }} />
                    ) : null}
                  </div>
                  <div>
                    <div style={{ color: "#fff", fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>{label}</div>
                    <div style={{ color: "#9A9CB0", fontSize: 23, marginTop: 4 }}>{detail}</div>
                  </div>
                </div>
              );
            })}
          </Glass>
        </FlyIn>
        <div style={{
          position: "absolute", left: W.card[0], top: W.card[1], opacity: Math.min(1, pop * 2),
          transform: `translateY(${(1 - pop) * 60}px) scale(${0.85 + 0.15 * pop})`, filter: pop < 1 ? `blur(${(1 - pop) * 12}px)` : undefined
        }}>
          <Part name="person-result" k={W.k} pad={18} radius={22} style={{ boxShadow: `0 0 0 1px rgba(255,255,255,.4), 0 0 ${80 * pop}px rgba(52,211,153,${0.35 * pop}), 0 40px 100px rgba(0,0,0,.5)` }} />
        </div>
      </Stage>
    </>
  );
};

// ---- 7. Write the message ---------------------------------------------------------------------

const MESSAGE = "Hi Maya,\n\nI just applied to the Software Engineer Intern, Summer 2027 role at Northwind (Job ID R-20417). I'm a junior studying computer science at State University, and I'd love to be considered.\n\nThanks,\nAlex";
// Where each kind of message sits in the "kinds" part, in CSS px.
const PILLS = [[4, 4, 104, 19], [118, 4, 118, 19], [241, 4, 50, 19]];

const Write: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const tc = CUES.write.type;
  const n = Math.round(e(f, tc.at, tc.at + (tc.len ?? 70), 0, MESSAGE.length, Easing.linear));
  const pill = [0, 1, 2].reduce((a, i) => (f >= cue("write", `pill${i}`) ? i : a), -1);
  const click = cue("write", "click");
  const copied = e(f, cue("write", "copied") - 2, cue("write", "copied") + 14);
  const W = L.tall
    ? { w: 1000, h: 1100, who: [40, 0], kinds: [40, 130], kk: 2.6, card: [40, 300], cw: 920, fs: 30 }
    : { w: 1400, h: 760, who: [0, 60], kinds: [0, 190], kk: 1.75, card: [640, 0], cw: 760, fs: 27 };
  const ring = PILLS[Math.max(0, pill)];
  const ringOn = pill >= 0 ? 1 : 0;
  const btn: Pt = [W.cw - 72, L.tall ? 561 : 519];  // the Copy button's center, in card px
  const kc: Pt = L.tall ? [474, 206] : [295, 243];                       // the message types
  const tf: [Pt, Pt] = L.tall ? [[370, 420], [400, 580]] : [[940, 140], [970, 300]]; // follows the typing down
  const cam = useCam("write", [
    { at: 0, z: [1.45, 1.65], f: [[kc[0] - 30, kc[1]], [kc[0] + 30, kc[1]]] },
    { at: cue("write", "shotB"), z: [2.3, 2.5], f: tf, full: true },
    { at: cue("write", "shotC"), z: [1.0, 0.9], f: [[W.w / 2 + 80, W.h / 2 + 40], [W.w / 2, W.h / 2]] }
  ]);
  return (
    <>
      <Title text="The message, WRITTEN for you." tone="paper" show={!cam.full} />
      <Stage w={W.w} h={W.h} zoom={1.12} cam={cam} tilt={[e(f, 0, 180, 8, 3, Easing.linear), L.tall ? 0 : e(f, 0, 180, 6, 2, Easing.linear)]}>
        <FlyIn at={6} x={W.who[0]} y={W.who[1]} from="below"><Part name="compose-who" k={W.kk} /></FlyIn>
        <FlyIn at={14} x={W.kinds[0]} y={W.kinds[1]} from="below">
          <div style={{ position: "relative" }}>
            <Part name="kinds" k={W.kk} />
            <div style={{
              position: "absolute", left: 8 + ring[0] * W.kk - 6, top: 8 + ring[1] * W.kk - 6, width: ring[2] * W.kk + 12, height: ring[3] * W.kk + 12,
              borderRadius: 999, boxShadow: `0 0 0 3px ${T.indigo}, 0 0 24px rgba(124,108,255,.6)`, opacity: ringOn
            }} />
          </div>
        </FlyIn>
        <FlyIn at={22} x={W.card[0]} y={W.card[1]} from="depth">
          <div style={{ width: W.cw, background: "#fff", borderRadius: 22, padding: 26, boxShadow: "0 0 0 1px rgba(15,16,26,.06), 0 30px 80px rgba(15,16,26,.18)", fontFamily: POPUP_FONT }}>
            <div style={{ fontSize: W.fs * 0.8, color: "#6b7278", marginBottom: 12 }}>Email · maya.chen@northwind.com</div>
            <div style={{ border: "2px solid #1d2226", borderRadius: 12, padding: "16px 18px", height: L.tall ? 470 : 430, fontSize: W.fs, lineHeight: 1.42, color: "#1d2226", whiteSpace: "pre-wrap" }}>
              {MESSAGE.slice(0, n)}
              <span style={{ display: "inline-block", width: 3, height: W.fs * 1.1, background: T.indigo, verticalAlign: "text-bottom", opacity: Math.floor(f / 16) % 2 || n < MESSAGE.length ? 1 : 0 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
              <span style={{ fontSize: W.fs * 0.75, color: "#6b7278" }}>{n} characters</span>
              <div style={{ display: "flex", gap: 10 }}><Part name="ai-btn" k={1.5} pad={0} radius={0} style={{ boxShadow: "none" }} /><Part name="copy-btn" k={1.5} pad={0} radius={0} style={{ boxShadow: "none" }} /></div>
            </div>
          </div>
        </FlyIn>
        <div style={{ position: "absolute", left: W.card[0] + W.cw - 330, top: W.card[1] + btn[1] - 110, opacity: copied, transform: `translateY(${(1 - copied) * 20}px) scale(${0.9 + 0.1 * copied})` }}>
          <Pill dark size={L.tall ? 30 : 26}><span style={{ color: T.mint }}>✓</span>Copied to clipboard</Pill>
        </div>
        <Pointer path={[[110, W.w, W.h + 40], [click - 6, W.card[0] + btn[0], W.card[1] + btn[1]], [180, W.card[0] + btn[0], W.card[1] + btn[1]]]} clicks={[click]} z={30} />
      </Stage>
    </>
  );
};

// ---- 8. Follow-ups ----------------------------------------------------------------------------

const Follow: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const nt = cue("follow", "notify");
  const note = e(f, nt - 4, nt + 18);
  const badge = cue("follow", "badge");
  const pulse = f >= badge && f < badge + 26 ? (f - badge) / 26 : 0;
  const W = L.tall
    ? { w: 1000, h: 1100, note: [80, 0], nw: 840, panel: [60, 290], k: 2.4 }
    : { w: 1400, h: 760, note: [770, 40], nw: 620, panel: [40, 40], k: 1.95 };
  const nc: Pt = L.tall ? [500, 65] : [1080, 105];   // the notification
  const pc: Pt = L.tall ? [482, 607] : [385, 300];   // the follow-ups panel
  const shotB = cue("follow", "shotB");
  const cam = useCam("follow", [
    { at: 0, z: [2.1, 2.35], f: [[nc[0] + 60, nc[1]], [nc[0] - 20, nc[1]]], full: true },
    { at: shotB, z: [1.3, 1.45], f: [[pc[0], pc[1] - 40], [pc[0], pc[1] + 10]] },
    { at: cue("follow", "shotC"), z: [0.76, 0.68], f: [[W.w / 2, W.h / 2], [W.w / 2, W.h / 2]], rx: [12, 6], ry: [18, 8] }
  ]);
  return (
    <>
      <Title text="Never miss a FOLLOW-UP." tone="ink" start={shotB} show={!cam.full} />
      <Stage w={W.w} h={W.h} zoom={1.2} cam={cam}>
        <FlyIn at={30} x={W.panel[0]} y={W.panel[1]} from="below">
          <div style={{ position: "relative", background: "#fff", borderRadius: 24, padding: "14px 10px 10px", boxShadow: "0 40px 100px rgba(0,0,0,.5)" }}>
            <Part name="saved-tabs" k={W.k} pad={4} style={{ boxShadow: "none" }} />
            <div style={{ position: "absolute", left: 14 + 327 * W.k - 30 * pulse, top: 18 + 15 * W.k - 30 * pulse, width: 60 * pulse, height: 60 * pulse, borderRadius: "50%", border: `3px solid rgba(251,113,133,${1 - pulse})` }} />
            {[0, 1, 2].map((i) => {
              const t = cue("follow", `row${i}`);
              const p = e(f, t - 4, t + 14);
              return (
                <Blur key={i} x={(1 - p) * 20} style={{ opacity: p, transform: `translateX(${(1 - p) * 120}px)` }}>
                  <Part name={`due-${i}`} k={W.k} crop={i === 2 ? 46 : undefined} pad={4} style={{ boxShadow: "none" }} />
                </Blur>
              );
            })}
          </div>
        </FlyIn>
        <Blur x={(1 - note) * 30} style={{ position: "absolute", left: W.note[0], top: W.note[1], opacity: Math.min(1, note * 2), transform: `translateX(${(1 - note) * 300}px) translateZ(60px)` }}>
          <div style={{
            width: W.nw, display: "flex", gap: 22, alignItems: "center", padding: "24px 26px", borderRadius: 28, fontFamily: INTER,
            background: "rgba(36,37,50,.92)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12), 0 30px 80px rgba(0,0,0,.55)"
          }}>
            <LogoMark size={76} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#9A9CB0", fontSize: 22 }}><span>Sourcing Helper</span><span>now</span></div>
              <div style={{ color: "#fff", fontSize: 30, fontWeight: 650, marginTop: 4, letterSpacing: "-0.02em" }}>Follow up with Maya Chen</div>
              <div style={{ color: "#C9CBDA", fontSize: 24, marginTop: 2 }}>It's been 5 days since your message.</div>
            </div>
          </div>
        </Blur>
      </Stage>
    </>
  );
};

// ---- 9. Fresh internships: a moving wall of real job cards -------------------------------------

const Jobs: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const cols = L.tall ? 2 : 4;
  const k = 1.55;
  const cardH = 92 * k + 22;
  const boards = cue("jobs", "boards");
  const bp = e(f, boards - 4, boards + 18);
  // Wide wall, then an extreme close-up of one card in it, then pull far back for the boards.
  const cam = useCam("jobs", [
    { at: 0, z: [1, 1.12], f: [[0, 0], [0, 0]] },
    { at: cue("jobs", "shotB"), z: [2.9, 3.2], f: [[-60, 0], [40, 0]], rz: [-2, 0], full: true },
    { at: cue("jobs", "shotC"), z: [0.72, 0.66], f: [[0, 0], [0, 0]] }
  ]);
  return (
    <>
      <Title text="Fresh internships, LIVE." tone="paper" show={!cam.full} />
      <div style={{ position: "absolute", left: 0, right: 0, top: cam.full ? 0 : L.area.top - 40, bottom: 0, perspective: 1800, overflow: "hidden",
        maskImage: cam.full ? undefined : "linear-gradient(transparent, black 14%, black 80%, transparent)" }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", display: "flex", gap: 26, transformStyle: "preserve-3d",
          transform: `translate(-50%, -50%) translate(${-cam.fx * cam.z}px, 0) scale(${(L.tall ? 1.15 : 1) * cam.z}) rotateX(24deg) rotateZ(${-8 + cam.rz}deg)` }}>
          {Array.from({ length: cols }).map((_, c) => {
            const dir = c % 2 ? 1 : -1;
            const y = dir * (f * (2.4 + c * 0.4)) - (c % 2 ? cardH * 6 : 0);
            return (
              <div key={c} style={{ display: "flex", flexDirection: "column", gap: 22, transform: `translateY(${y}px)` }}>
                {Array.from({ length: 12 }).map((__, j) => <Part key={j} name={`job-${(j + c * 2) % 6}`} k={k} pad={2} radius={14} />)}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: L.a.vertical ? 1160 : L.a.square ? 560 : 560, display: "flex", justifyContent: "center",
        opacity: Math.min(1, bp * 2), transform: `translateY(${(1 - bp) * 80}px) scale(${0.9 + 0.1 * bp}) rotate(${(1 - bp) * -6}deg)` }}>
        <Part name="boards" k={L.a.vertical ? 2.7 : 2.2} pad={18} radius={24} style={{ boxShadow: "0 0 0 1px rgba(15,16,26,.08), 0 50px 120px rgba(15,16,26,.35)" }} />
      </div>
      {cam.full ? <Dof /> : null}
    </>
  );
};

// ---- 10. Find them. Message them. Follow up. --------------------------------------------------

const Triad: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const size = L.a.vertical ? 150 : L.a.square ? 130 : 180;
  const words: Array<[string, number, number]> = [["Find them.", cue("triad", "a"), cue("triad", "b")], ["Message them.", cue("triad", "b"), cue("triad", "c")], ["Follow up.", cue("triad", "c"), 999]];
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {words.map(([w, a, b], i) => {
        const p = e(f, a, a + 14);
        const q = e(f, b - 6, b + 4, 0, 1, IN);
        if (f < a - 1 || q >= 1) return null;
        return (
          <Blur key={i} y={(1 - p) * 10 + q * 18} style={{ position: "absolute", opacity: Math.min(1, p * 2) * (1 - q), transform: `scale(${1.25 - 0.25 * p}) translateY(${-q * 90}px)` }}>
            <span style={{ fontFamily: INTER, fontWeight: 650, fontSize: size, letterSpacing: "-0.05em", whiteSpace: "nowrap",
              ...(i === 2 ? { backgroundImage: GRAD, WebkitBackgroundClip: "text", color: "transparent" } : { color: "#F7F7FA" }) }}>{w}</span>
          </Blur>
        );
      })}
    </AbsoluteFill>
  );
};

// ---- 11. Call to action: the button becomes the logo ------------------------------------------

const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const click = cue("cta", "click");
  const m = e(f, cue("cta", "morph"), cue("cta", "morph") + 26, 0, 1, INOUT);
  const lift = e(f, cue("cta", "logo") + 4, cue("cta", "logo") + 30, 0, 1, INOUT);
  const press = interpolate(f, [click - 4, click, click + 10], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const BH = 150, BW = 560;
  const w = BW + (BH - BW) * m;
  const word = e(f, cue("cta", "logo") + 14, cue("cta", "logo") + 40);
  const url = e(f, cue("cta", "logo") + 26, cue("cta", "logo") + 52);
  const k = L.a.vertical ? 1.1 : 1;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ transform: `translateY(${-lift * (L.a.vertical ? 200 : 150)}px) scale(${k})`, position: "relative", width: BW, height: BH, display: "flex", justifyContent: "center" }}>
        <div style={{
          width: w, height: BH, borderRadius: 999, position: "relative", overflow: "hidden", transform: `scale(${(1 - 0.06 * press) * (1 - 0.15 * m)})`,
          background: "linear-gradient(180deg, #2C2D3B, #13141C)", opacity: e(f, 0, 10),
          boxShadow: `inset 0 1.5px 0 rgba(255,255,255,.22), 0 0 0 1.5px rgba(255,255,255,.14), 0 30px 80px rgba(0,0,0,.6), 0 0 ${60 * m}px rgba(124,108,255,${0.5 * m})`
        }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 1 - e(f, cue("cta", "morph"), cue("cta", "morph") + 10) }}>
            <Kinetic text="Get it free" start={cue("cta", "button")} size={68} tone="ink" stagger={5} />
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: m }}><LogoMark size={BH} round /></div>
        </div>
      </div>
      <div style={{ position: "absolute", top: "50%", marginTop: L.a.vertical ? 10 : 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
        <div style={{ opacity: word, transform: `translateY(${(1 - word) * 40}px)`, filter: word < 1 ? `blur(${(1 - word) * 10}px)` : undefined, fontFamily: INTER, fontWeight: 700, fontSize: L.a.vertical ? 110 : 104, letterSpacing: "-0.045em", color: "#fff", whiteSpace: "nowrap" }}>
          Sourcing Helper
        </div>
        <div style={{ opacity: url, transform: `translateY(${(1 - url) * 30}px)`, fontFamily: INTER, fontWeight: 500, fontSize: L.a.vertical ? 34 : 32, color: "#B7B9CC", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
          github.com/Doggo21345/linkedin-sourcing-helper
        </div>
      </div>
      <Pointer path={[[26, BW + 500, 900], [click - 6, 960 * (L.a.width / 1920) + 120, L.a.height / 2 + 30], [click + 10, 960 * (L.a.width / 1920) + 120, L.a.height / 2 + 30], [click + 40, L.a.width + 100, L.a.height + 100]]} clicks={[click]} />
    </AbsoluteFill>
  );
};

const SCENES: Record<string, React.FC> = { pain: Pain, inbox: Inbox, turn: Turn, intro: Intro, find: Find, email: Email, write: Write, follow: Follow, jobs: Jobs, triad: Triad, cta: Cta };

export const Trailer: React.FC = () => {
  useInter();
  return (
  <AbsoluteFill style={{ background: T.ink }}>
    {/* Music and every sound effect, synthesized by music/make_v4.py from v4.json */}
    <Audio src={staticFile("music.wav")} />
    <Series>
      {V4.scenes.map(({ id, frames, tone }) => {
        const Scene = SCENES[id];
        return (
          <Series.Sequence key={id} durationInFrames={frames}>
            <Bg tone={tone as Tone}>
              <Punch len={frames}><Scene /></Punch>
            </Bg>
          </Series.Sequence>
        );
      })}
    </Series>
  </AbsoluteFill>
);
};
