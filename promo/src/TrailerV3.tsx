// The trailer, v3: the REAL extension (screenshots captured from the actual
// popup by capture/capture.mjs), smooth 60 fps motion with no bouncy springs,
// one continuous camera move per shot, and crossfades between shots.
// Scene lengths live in timeline.json, which music/make_music.py also reads.
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import timeline from "./timeline-v3.json";
import rects from "../public/shots/rects.json";
import { FONT } from "./theme";
import { V, useAspect, Backdrop, Camera, Hand, Browser, Skeleton } from "./fx";

export const TRAILER_V3_FRAMES =
  timeline.scenes.reduce((a, s) => a + s.frames, 0) - timeline.transition * (timeline.scenes.length - 1);

// One curve for everything that moves across the screen, one for things arriving.
const MOVE = Easing.bezier(0.65, 0, 0.35, 1);
const ARRIVE = Easing.bezier(0.16, 1, 0.3, 1);
const ease = (f: number, at: [number, number], to: [number, number], curve = MOVE) =>
  interpolate(f, at, to, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: curve });

const POPUP_CSS_W = 360;

/** A real screenshot, cropped to [top, height] in popup CSS px and scrolled by `pan`. */
const Shot: React.FC<{ name: string; width: number; top?: number; height: number; pan?: number; radius?: number }> = ({
  name, width, top = 0, height, pan = 0, radius = 16
}) => {
  const k = width / POPUP_CSS_W;
  return (
    <div style={{
      width, height: height * k, overflow: "hidden", borderRadius: radius, background: "#fff",
      boxShadow: `0 0 0 1px rgba(255,255,255,.18), 0 40px 120px rgba(124,92,255,.45), 0 10px 30px rgba(0,0,0,.35)`
    }}>
      <Img src={staticFile(`shots/${name}.png`)} style={{ width, display: "block", transform: `translateY(${-(top + pan) * k}px)` }} />
    </div>
  );
};

/** Text that arrives word by word: fade, rise, and de-blur. No overshoot. */
const Words: React.FC<{ text: string; start: number; size: number; color?: string; weight?: number; stagger?: number }> = ({
  text, start, size, color = V.text, weight = 800, stagger = 5
}) => {
  const f = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.26}px`, lineHeight: 1.08, fontFamily: FONT }}>
      {words.map((w, i) => {
        const p = ease(f, [start + i * stagger, start + i * stagger + 26], [0, 1], ARRIVE);
        const emph = w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w);
        return (
          <span key={i} style={{
            fontSize: size, fontWeight: weight, letterSpacing: -size * 0.025, display: "inline-block",
            opacity: p, transform: `translateY(${(1 - p) * size * 0.4}px)`, filter: `blur(${(1 - p) * 10}px)`,
            ...(emph ? { backgroundImage: `linear-gradient(90deg, ${V.violet}, ${V.cyan})`, WebkitBackgroundClip: "text", color: "transparent" } : { color })
          }}>{emph ? w.charAt(0) + w.slice(1).toLowerCase() : w}</span>
        );
      })}
    </div>
  );
};

/** Each shot's caption: low on 16:9, high on square and vertical. */
const Caption: React.FC<{ text: string; start?: number }> = ({ text, start = 20 }) => {
  const a = useAspect();
  return (
    <AbsoluteFill style={{ justifyContent: a.wide ? "flex-end" : "flex-start", alignItems: "center", pointerEvents: "none" }}>
      {a.wide ? <AbsoluteFill style={{ background: "linear-gradient(transparent 58%, rgba(7,7,15,.9) 86%)" }} /> : null}
      <div style={{ position: "relative", padding: a.wide ? "0 0 64px" : a.vertical ? "200px 70px 0" : "70px 60px 0", maxWidth: a.wide ? 1700 : 1000 }}>
        <Words text={text} start={start} size={a.vertical ? 96 : a.square ? 72 : 84} />
      </div>
    </AbsoluteFill>
  );
};

function useStage() {
  const a = useAspect();
  // zoom: extra push on narrow frames, where only the middle of the stage fits anyway.
  if (a.vertical) return { scale: 0.72, y: 220, zoom: 1.45 };
  if (a.square) return { scale: 0.64, y: 120, zoom: 1.25 };
  return { scale: 0.92, y: -30, zoom: 1 };
}

const Logo: React.FC<{ size: number; badge?: string }> = ({ size, badge }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.24, position: "relative",
    background: `linear-gradient(135deg, #0a66c2, ${V.violet})`, display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `0 ${size * 0.1}px ${size * 0.4}px rgba(124,92,255,.5)`
  }}>
    <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6" /><path d="M15 15 L20.5 20.5" />
      <circle cx="10.5" cy="9" r="1.8" fill="#fff" stroke="none" /><path d="M7.4 13.2 C8.4 11.8 12.6 11.8 13.6 13.2" />
    </svg>
    {badge ? (
      <div style={{
        position: "absolute", right: -size * 0.16, top: -size * 0.16, minWidth: size * 0.42, height: size * 0.42, borderRadius: size,
        background: "#ef4444", color: "#fff", fontWeight: 800, fontSize: size * 0.26, fontFamily: FONT,
        display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 3px #07070f"
      }}>{badge}</div>
    ) : null}
  </div>
);

const JobPage: React.FC = () => (
  <div style={{ position: "relative", width: 1440, height: 836, fontFamily: FONT }}>
    <div style={{ position: "absolute", left: 70, top: 70, width: 92, height: 92, borderRadius: 18, background: "linear-gradient(135deg,#1e3a8a,#3b82f6)" }} />
    <div style={{ position: "absolute", left: 190, top: 76, fontSize: 38, fontWeight: 800, color: "#111827" }}>Software Engineer Intern, Summer 2027</div>
    <div style={{ position: "absolute", left: 190, top: 130, fontSize: 23, color: "#6b7280" }}>Northwind · San Francisco, CA · 2 days ago</div>
    <div style={{ position: "absolute", left: 190, top: 184, display: "flex", gap: 14 }}>
      <div style={{ background: "#0a66c2", color: "#fff", borderRadius: 26, padding: "12px 30px", fontSize: 21, fontWeight: 700 }}>Apply</div>
      <div style={{ border: "2px solid #0a66c2", color: "#0a66c2", borderRadius: 26, padding: "10px 28px", fontSize: 21, fontWeight: 700 }}>Save</div>
    </div>
    <div style={{ position: "absolute", left: 70, top: 290, fontSize: 25, fontWeight: 700, color: "#111827" }}>About the job</div>
    <Skeleton rows={[[70, 345, 700], [70, 380, 640], [70, 415, 720], [70, 450, 560], [70, 510, 680], [70, 545, 620], [70, 580, 700], [70, 640, 520]]} />
  </div>
);

// ---- 1. Hook --------------------------------------------------------------------------------

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const a = useAspect();
  const size = a.vertical ? 132 : 150;
  return (
    <Backdrop>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 18, padding: "0 70px", transform: `scale(${ease(f, [0, 150], [1, 1.06])})` }}>
        <Words text="100 applications." start={8} size={size} />
        <Words text="Still no REPLY?" start={56} size={size} stagger={7} />
      </AbsoluteFill>
    </Backdrop>
  );
};

// ---- 2. The product: browser arrives, click the extension, push into Start here -------------

const POP = { x: 880, y: 72, w: 520 };          // popup on the stage
const POP_K = POP.w / POPUP_CSS_W;
const POP_CROP = rects.job.height;               // the whole (trimmed) popup
const ICON = { x: 1372, y: 13 };

const Product: React.FC = () => {
  const f = useCurrentFrame();
  const s = useStage();
  const a = useAspect();
  const arrive = ease(f, [0, 70], [0, 1], ARRIVE);
  const open = ease(f, [112, 150], [0, 1], ARRIVE);
  const push = ease(f, [150, 290], [0, 1]);
  // Scroll the popup so Start here comes up, the way you'd scroll the real one.
  const pan = 0;
  const link = rects.job["#start-links li"];
  const linkY = POP.y + (link.y - pan) * POP_K;
  const linkX = POP.x + (link.x + link.w * 0.55) * POP_K;
  const highlight = ease(f, [262, 276], [0, 1], ARRIVE);
  return (
    <Backdrop>
      <Camera
        scale={s.scale} y={s.y + 380 * (1 - arrive)}
        rx={18 - 10 * arrive - 4 * push} ry={-26 + 14 * arrive + 8 * push}
        zoom={(0.94 + (a.wide ? 0.36 : 0.26) * push) * (1 + (s.zoom - 1) * push)}
        focus={[POP.x + POP.w / 2, POP.y + (rects.job["#start-links"].y + 60) * POP_K]} focusAmt={0.8 * push}
      >
        <div style={{ opacity: arrive }}>
          <Browser blur={6 * push}><JobPage /></Browser>
          <div style={{ position: "absolute", left: ICON.x, top: ICON.y, transform: `scale(${1 + 0.12 * ease(f, [104, 110], [0, 1]) * (1 - ease(f, [110, 120], [0, 1]))})` }}>
            <Logo size={38} />
          </div>
        </div>
        <div style={{
          position: "absolute", left: POP.x, top: POP.y, opacity: open, transformOrigin: "top right",
          transform: `translateZ(${140 * open}px) scale(${0.94 + 0.06 * open})`
        }}>
          <Shot name="job" width={POP.w} height={POP_CROP} pan={pan} />
          {/* The clicked Start here link glows, like a real hover/click */}
          <div style={{
            position: "absolute", left: link.x * POP_K, top: (link.y - pan) * POP_K, width: link.w * POP_K, height: link.h * POP_K,
            borderRadius: 8 * POP_K, boxShadow: `0 0 0 ${4 * highlight}px rgba(124,92,255,${0.8 * highlight}), 0 0 ${40 * highlight}px rgba(124,92,255,${0.6 * highlight})`
          }} />
        </div>
        <Hand path={[[60, 760, 740], [104, ICON.x + 12, ICON.y + 18], [190, ICON.x + 12, ICON.y + 18], [256, linkX, linkY + 30], [300, linkX, linkY + 30]]} clicks={[108, 264]} z={4 + 140 * open} />
      </Camera>
      <Caption text="Find who's HIRING, in one click." start={160} />
    </Backdrop>
  );
};

// ---- 3. Write the message -------------------------------------------------------------------

const WriteShot: React.FC = () => {
  const f = useCurrentFrame();
  const s = useStage();
  const W = 640;
  const k = W / POPUP_CSS_W;
  const copy = rects["person-compose"]["#compose-copy"];
  const card = { x: (1440 - W) / 2, y: 60 };
  const toast = ease(f, [128, 150], [0, 1], ARRIVE) * (1 - ease(f, [200, 222], [0, 1]));
  const btn = { x: card.x + (copy.x + copy.w / 2) * k, y: card.y + (copy.y + copy.h / 2 - 8) * k };
  return (
    <Backdrop hue={1}>
      <Camera scale={s.scale} y={s.y} rx={ease(f, [0, 230], [10, 2])} ry={ease(f, [0, 230], [-16, 10])} zoom={ease(f, [0, 230], [0.98, 1.08]) * s.zoom}>
        <div style={{ position: "absolute", left: card.x, top: card.y }}>
          <Shot name="person-compose" width={W} height={440} radius={20} />
        </div>
        <div style={{
          position: "absolute", left: btn.x + 300, top: btn.y - 34, opacity: toast, transform: `translateZ(8px) translateX(${(1 - toast) * -30}px)`,
          background: "#067647", color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 26, borderRadius: 14, padding: "12px 22px",
          boxShadow: "0 16px 40px rgba(0,0,0,.35)", whiteSpace: "nowrap"
        }}>Copied to clipboard ✓</div>
        <Hand path={[[20, 1180, 820], [112, btn.x + 6, btn.y + 4], [230, btn.x + 6, btn.y + 4]]} clicks={[122]} z={4} />
      </Camera>
      <Caption text="The message, WRITTEN for you." start={14} />
    </Backdrop>
  );
};

// ---- 4. Follow-ups --------------------------------------------------------------------------

const FollowShot: React.FC = () => {
  const f = useCurrentFrame();
  const s = useStage();
  const W = 660;
  const k = W / POPUP_CSS_W;
  const due = rects.saved["#due-list li"];
  const card = { x: 560, y: 70 };
  const badge = 1 + 0.1 * Math.sin(ease(f, [30, 70], [0, Math.PI], Easing.linear));
  const write = { x: card.x + (due.x + 40) * k, y: card.y + (due.y + 20) * k };
  return (
    <Backdrop>
      <Camera scale={s.scale} y={s.y} rx={ease(f, [0, 200], [12, 4])} ry={ease(f, [0, 200], [-18, -6])} zoom={ease(f, [0, 200], [0.98, 1.1]) * s.zoom} focus={[960, 400]} focusAmt={s.zoom > 1 ? 0.6 : 0}>
        {/* On narrow frames the push would slide the icon off the edge; the tab's count says the same thing. */}
        {s.zoom === 1 ? (
          <div style={{ position: "absolute", left: 200, top: 300, transform: `translateZ(60px) scale(${badge})` }}>
            <Logo size={200} badge="3" />
          </div>
        ) : null}
        <div style={{ position: "absolute", left: card.x, top: card.y }}>
          <Shot name="saved" width={W} height={360} radius={20} />
        </div>
        <Hand path={[[30, 1200, 860], [120, write.x + 30, write.y + 6], [200, write.x + 30, write.y + 6]]} clicks={[130]} z={4} />
      </Camera>
      <Caption text="Never miss a FOLLOW-UP." start={14} />
    </Backdrop>
  );
};

// ---- 5. Fresh internships -------------------------------------------------------------------

const FindShot: React.FC = () => {
  const f = useCurrentFrame();
  const s = useStage();
  const W = 640;
  const results = rects.find["#board-results"];
  const pan = ease(f, [20, 190], [0, results.h - 360]);
  return (
    <Backdrop hue={1}>
      <Camera scale={s.scale} y={s.y} rx={ease(f, [0, 200], [16, 6])} ry={ease(f, [0, 200], [14, 2])} zoom={ease(f, [0, 200], [1.0, 1.08]) * s.zoom}>
        <div style={{ position: "absolute", left: (1440 - W) / 2, top: 60 }}>
          <Shot name="find" width={W} top={results.y - 8} height={400} pan={pan} radius={20} />
        </div>
      </Camera>
      <Caption text="Fresh internships, LIVE." start={14} />
    </Backdrop>
  );
};

// ---- 6. End card ------------------------------------------------------------------------------

const End: React.FC = () => {
  const f = useCurrentFrame();
  const a = useAspect();
  const logo = ease(f, [0, 40], [0, 1], ARRIVE);
  const pill = ease(f, [70, 100], [0, 1], ARRIVE);
  const url = ease(f, [86, 116], [0, 1], ARRIVE);
  return (
    <Backdrop>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", transform: `scale(${ease(f, [0, 240], [1, 1.04])})` }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, padding: "0 60px" }}>
          <div style={{ opacity: logo, transform: `translateY(${(1 - logo) * 40}px) scale(${0.8 + 0.2 * logo})` }}>
            <Logo size={a.vertical ? 220 : 180} />
          </div>
          <Words text="Sourcing Helper" start={18} size={a.vertical ? 116 : 124} stagger={6} />
          <Words text="Find them. Message them. Follow up." start={44} size={a.vertical ? 48 : 46} weight={600} stagger={4} color={V.dim} />
          <div style={{ display: "flex", flexDirection: a.wide ? "row" : "column", gap: 18, alignItems: "center", marginTop: 8 }}>
            <div style={{ opacity: pill, transform: `translateY(${(1 - pill) * 30}px)`, background: `linear-gradient(90deg, ${V.violet}, ${V.blue})`, color: "#fff", fontWeight: 800, fontSize: 32, borderRadius: 40, padding: "14px 34px", fontFamily: FONT }}>
              Free Chrome extension
            </div>
            <div style={{ opacity: url, transform: `translateY(${(1 - url) * 30}px)`, border: "1.5px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.06)", color: V.text, fontWeight: 600, fontSize: a.vertical ? 26 : 30, borderRadius: 40, padding: "14px 30px", whiteSpace: "nowrap", fontFamily: FONT }}>
              github.com/Doggo21345/linkedin-sourcing-helper
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
};

const SCENES: Record<string, React.FC> = { hook: Hook, product: Product, write: WriteShot, follow: FollowShot, find: FindShot, end: End };

export const TrailerV3: React.FC = () => (
  <AbsoluteFill style={{ background: V.bg }}>
    {/* Original track, synthesized by music/make_music.py from the same timeline. */}
    <Audio src={staticFile("music-v3.wav")} volume={0.9} />
    <TransitionSeries>
      {timeline.scenes.flatMap(({ id, frames }, i) => {
        const Scene = SCENES[id];
        const seq = (
          <TransitionSeries.Sequence key={id} durationInFrames={frames}>
            <Scene />
          </TransitionSeries.Sequence>
        );
        return i === 0 ? [seq] : [
          <TransitionSeries.Transition key={`t-${id}`} presentation={fade()} timing={linearTiming({ durationInFrames: timeline.transition, easing: MOVE })} />,
          seq
        ];
      })}
    </TransitionSeries>
  </AbsoluteFill>
);
