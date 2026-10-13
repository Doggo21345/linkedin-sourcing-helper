// Motion toolkit for the trailer: a 3D camera, kinetic type, a hand cursor,
// pop-out cards, scene-to-scene zooms, and a glowing backdrop.
import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "./theme";

export const V = {
  bg: "#07070f",
  violet: "#7c5cff",
  blue: "#3b82f6",
  cyan: "#22d3ee",
  text: "#f5f7fb",
  dim: "#9aa3b8"
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Keyframed value: kf(frame, [0, 30, 60], [a, b, c]) with smooth easing. */
export function kf(frame: number, at: number[], values: number[], ease = Easing.inOut(Easing.cubic)) {
  return interpolate(frame, at, values, { ...clamp, easing: ease });
}

export function useSpring(delay = 0, damping = 14, mass = 0.7) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass } });
}

export function useAspect() {
  const { width, height } = useVideoConfig();
  const r = width / height;
  return { width, height, vertical: r < 0.75, square: r >= 0.75 && r < 1.2, wide: r >= 1.2 };
}

// ---- Backdrop: dark, with slow-moving colored glows and a faint grid ----------

export const Backdrop: React.FC<{ children?: React.ReactNode; hue?: number }> = ({ children, hue = 0 }) => {
  const frame = useCurrentFrame();
  const a = frame / 40;
  const orb = (x: number, y: number, c: string, s: number) => (
    <div style={{
      position: "absolute", left: `${x}%`, top: `${y}%`, width: s, height: s, borderRadius: "50%",
      background: c, filter: "blur(120px)", opacity: 0.55, transform: "translate(-50%,-50%)"
    }} />
  );
  return (
    <AbsoluteFill style={{ background: V.bg, overflow: "hidden", fontFamily: FONT }}>
      {orb(30 + 8 * Math.sin(a), 30 + 6 * Math.cos(a * 0.8), V.violet, 900)}
      {orb(75 + 6 * Math.cos(a * 0.7), 70 + 8 * Math.sin(a * 0.9), hue ? V.cyan : V.blue, 800)}
      <AbsoluteFill style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
        backgroundSize: "80px 80px", backgroundPosition: `0 ${frame * 0.6}px`,
        maskImage: "radial-gradient(circle at 50% 50%, black 30%, transparent 75%)"
      }} />
      {children}
    </AbsoluteFill>
  );
};

// ---- Scene envelope: every scene zooms in from blur and zooms out into the next ----

export const SceneZoom: React.FC<{ len: number; children: React.ReactNode; inFrames?: number; outFrames?: number }> = ({
  len, children, inFrames = 9, outFrames = 8
}) => {
  const frame = useCurrentFrame();
  const enter = kf(frame, [0, inFrames], [0, 1], Easing.out(Easing.cubic));
  const exit = kf(frame, [len - outFrames, len], [0, 1], Easing.in(Easing.cubic));
  const scale = (0.86 + 0.14 * enter) * (1 + 0.45 * exit);
  const blur = 14 * (1 - enter) + 18 * exit;
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, filter: `blur(${blur}px)`, opacity: Math.min(enter * 1.4, 1 - exit * 0.9) }}>
      {children}
    </AbsoluteFill>
  );
};

// ---- Kinetic type: words slam in, scale down from big, de-blur ---------------------

export const Kinetic: React.FC<{
  text: string; start?: number; size?: number; stagger?: number; color?: string; weight?: number; align?: "center" | "left";
}> = ({ text, start = 0, size = 110, stagger = 4, color = V.text, weight = 850, align = "center" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", gap: `0 ${size * 0.26}px`, lineHeight: 1.04 }}>
      {words.map((w, i) => {
        const p = spring({ frame: frame - start - i * stagger, fps, config: { damping: 12, mass: 0.5 } });
        // ALL-CAPS words are the emphasis: a violet-to-cyan gradient.
        const emph = w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w);
        return (
          <span key={i} style={{
            fontSize: size, fontWeight: weight, letterSpacing: -size * 0.03, display: "inline-block",
            opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * size * 0.35}px) scale(${1 + (1 - p) * 0.9})`,
            filter: `blur(${(1 - Math.min(1, p)) * 16}px)`,
            ...(emph
              ? { backgroundImage: `linear-gradient(90deg, ${V.violet}, ${V.cyan})`, WebkitBackgroundClip: "text", color: "transparent" }
              : { color })
          }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

// ---- 3D camera: perspective stage you can tilt, push into, and orbit ---------------

export const Camera: React.FC<{
  children: React.ReactNode; rx?: number; ry?: number; rz?: number; zoom?: number;
  focus?: [number, number]; focusAmt?: number; stage?: [number, number]; scale?: number; y?: number;
}> = ({ children, rx = 0, ry = 0, rz = 0, zoom = 1, focus = [0, 0], focusAmt = 0, stage = [1440, 900], scale = 1, y = 0 }) => {
  // Pull the focus point (in stage pixels) toward the middle of the screen as focusAmt -> 1.
  const tx = -(focus[0] - stage[0] / 2) * zoom * focusAmt;
  const ty = -(focus[1] - stage[1] / 2) * zoom * focusAmt;
  return (
    <AbsoluteFill style={{ perspective: 2000, perspectiveOrigin: "50% 45%", justifyContent: "center", alignItems: "center" }}>
      <div style={{ transform: `translateY(${y}px) scale(${scale})`, transformStyle: "preserve-3d" }}>
        <div style={{
          width: stage[0], height: stage[1], position: "relative", transformStyle: "preserve-3d",
          transform: `translate(${tx}px, ${ty}px) scale(${zoom}) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`
        }}>
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Lifts a stage element toward the camera: pop * (z lift, scale, glow). */
export const Lift: React.FC<{ x: number; y: number; pop: number; children: React.ReactNode; z?: number; glow?: string }> = ({
  x, y, pop, children, z = 140, glow = V.violet
}) => (
  <div style={{
    position: "absolute", left: x, top: y, transformStyle: "preserve-3d",
    transform: `translateZ(${z * pop}px) scale(${1 + 0.06 * pop})`,
    filter: `drop-shadow(0 ${30 * pop}px ${50 * pop}px ${hexA(glow, 0.45 * pop)})`
  }}>
    {children}
  </div>
);

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

// ---- Hand cursor: glides between points, presses on clicks --------------------------

export const Hand: React.FC<{ path: Array<[number, number, number]>; clicks?: number[]; z?: number }> = ({ path, clicks = [], z = 260 }) => {
  // path: [frame, x, y] waypoints in stage pixels. z: keep it just above what it clicks,
  // or perspective shifts it off its target.
  const frame = useCurrentFrame();
  const at = path.map((p) => p[0]);
  const x = kf(frame, at, path.map((p) => p[1]));
  const y = kf(frame, at, path.map((p) => p[2]));
  const press = Math.max(0, ...clicks.map((c) => kf(frame, [c - 3, c, c + 6], [0, 1, 0], Easing.linear)));
  const ring = Math.max(0, ...clicks.map((c) => (frame >= c && frame < c + 14 ? (frame - c) / 14 : 0)));
  const visible = kf(frame, [at[0], at[0] + 5], [0, 1]);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translateZ(${z}px) scale(${1 - press * 0.14})`, opacity: visible, pointerEvents: "none" }}>
      {ring > 0 ? (
        <div style={{
          position: "absolute", left: 8 - 40 * ring, top: 2 - 40 * ring, width: 80 * ring, height: 80 * ring, borderRadius: "50%",
          border: `3px solid ${hexA(V.violet, 1 - ring)}`
        }} />
      ) : null}
      <svg width="64" height="64" viewBox="0 0 32 32" style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,.45))" }}>
        <path d="M11 3.5c1.2 0 2 .9 2 2V15l.3-.1V12.6c0-1.1.9-1.9 2-1.9s2 .9 2 1.9v2.6l.3.1v-1.6c0-1.1.9-1.9 2-1.9s2 .8 2 1.9v2.3l.3.1v-.8c0-1.1.9-1.9 2-1.9s2 .9 2 1.9v6.3c0 4.2-3.2 7.6-7.4 7.6h-1.7c-2.4 0-4.6-1.2-6-3.2L6.2 18.5c-.7-1-.4-2.3.6-2.9.9-.6 2.1-.3 2.8.6l1.4 1.9V5.5c0-1.1.8-2 2-2z"
          fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// ---- A browser window, simplified (skeleton content like the reference) --------------

export const Browser: React.FC<{ children?: React.ReactNode; url?: string; blur?: number; w?: number; h?: number }> = ({
  children, url = "linkedin.com/jobs/view/…", blur = 0, w = 1440, h = 900
}) => (
  <div style={{
    position: "absolute", left: 0, top: 0, width: w, height: h, borderRadius: 22, overflow: "hidden", background: "#fbfbfd",
    boxShadow: `0 0 0 1.5px rgba(255,255,255,.12), 0 40px 140px ${hexA(V.violet, 0.45)}, -20px 0 80px ${hexA(V.blue, 0.25)}`
  }}>
    <div style={{ height: 64, background: "#eef0f4", display: "flex", alignItems: "center", gap: 10, padding: "0 22px", borderBottom: "1px solid #e1e4ea" }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 15, height: 15, borderRadius: 8, background: c }} />)}
      <div style={{ marginLeft: 24, flex: 1, height: 36, borderRadius: 18, background: "#fff", display: "flex", alignItems: "center", padding: "0 18px", color: "#6b7278", fontSize: 18, fontFamily: FONT }}>
        <svg width="16" height="16" viewBox="0 0 24 24" style={{ marginRight: 10 }} fill="#9aa3b8"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" /></svg>
        {url}
      </div>
      <div style={{ width: 34, height: 34, borderRadius: 8, background: "#dfe3ea" }} />
    </div>
    <div style={{ filter: blur ? `blur(${blur}px)` : undefined, height: h - 64 }}>{children}</div>
  </div>
);

/** Grey placeholder bars, like a page that's still loading. */
export const Skeleton: React.FC<{ rows: Array<[number, number, number]> }> = ({ rows }) => (
  <>
    {rows.map(([x, y, w], i) => (
      <div key={i} style={{ position: "absolute", left: x, top: y, width: w, height: 18, borderRadius: 9, background: "#e6e8ee" }} />
    ))}
  </>
);
