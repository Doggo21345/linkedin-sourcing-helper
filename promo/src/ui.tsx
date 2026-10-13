// Building blocks: animated text, and a recreation of the extension's popup.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { C, FONT } from "./theme";

/** 0 -> 1 spring starting at `delay` frames. */
export function useIn(delay = 0, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.6 } });
}

/** Fades the whole scene out over its last `frames` frames. */
export function useOut(duration: number, frames = 10) {
  const frame = useCurrentFrame();
  return interpolate(frame, [duration - frames, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

/** Square or vertical: stack the caption above the product instead of beside it. */
export function useIsSquare() {
  const { width, height } = useVideoConfig();
  return width / height < 1.2;
}

/** 9:16 (Reels, TikTok, Shorts): lots of height, so the product can be bigger. */
export function useIsVertical() {
  const { width, height } = useVideoConfig();
  return height / width > 1.4;
}

/** A line of text that rises and fades in. `caps` words get the accent color. */
export const Line: React.FC<{ text: string; delay?: number; size?: number; color?: string; weight?: number; caps?: boolean }> = ({
  text, delay = 0, size = 84, color = C.white, weight = 800, caps = true
}) => {
  const p = useIn(delay);
  const words = text.split(" ");
  return (
    <div
      style={{
        fontFamily: FONT, fontSize: size, fontWeight: weight, color, lineHeight: 1.12, letterSpacing: -1,
        opacity: p, transform: `translateY(${(1 - p) * 30}px)`, textAlign: "center"
      }}
    >
      {words.map((w, i) => {
        // Words written in ALL CAPS are the emphasis, shown in the accent blue.
        const emph = caps && w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w);
        return (
          <span key={i} style={{ color: emph ? "#5aa9ff" : undefined }}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
};

/** Feature caption: "1" badge, title, subtitle. */
export const Caption: React.FC<{ n: number; title: string; sub: string; delay?: number }> = ({ n, title, sub, delay = 0 }) => {
  const p = useIn(delay);
  const square = useIsSquare();
  const vertical = useIsVertical();
  return (
    <div style={{ fontFamily: FONT, opacity: p, transform: `translateX(${(1 - p) * -40}px)`, maxWidth: square ? 920 : 640, zoom: vertical ? 1.3 : 1 }}>
      <div style={{ display: "inline-block", background: C.accent, color: "#fff", fontWeight: 800, fontSize: 28, borderRadius: 999, padding: "6px 18px", marginBottom: 22 }}>
        {n} of 4
      </div>
      <div style={{ color: C.white, fontWeight: 800, fontSize: square ? 58 : 64, lineHeight: 1.08, letterSpacing: -1 }}>{title}</div>
      <div style={{ color: "#a9b4c8", fontWeight: 500, fontSize: square ? 30 : 32, marginTop: 18, lineHeight: 1.35 }}>{sub}</div>
    </div>
  );
};

/** The extension popup's frame: header, tabs, and a body. */
export const Popup: React.FC<{ tab: string; children: React.ReactNode; delay?: number; badge?: string }> = ({
  tab, children, delay = 0, badge
}) => {
  const p = useIn(delay, 16);
  const square = useIsSquare();
  const vertical = useIsVertical();
  const tabs = ["Job", "Person", "Find", "Saved"];
  return (
    <div
      style={{
        width: 380, background: C.card, borderRadius: 14, fontFamily: FONT, color: C.fg, fontSize: 13,
        boxShadow: "0 30px 80px rgba(0,0,0,.45)", overflow: "hidden",
        // zoom (not a scale transform) so text is laid out, and rendered, at the
        // bigger size: sharp, and it takes its real space next to the caption.
        zoom: vertical ? 2.4 : square ? 1.55 : 1.95,
        transform: `scale(${0.92 + 0.08 * p})`, opacity: p, transformOrigin: "center"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 0" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Sourcing Helper</div>
        <div style={{ color: C.muted, fontSize: 16 }}>⚙︎</div>
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, margin: "8px 14px 0" }}>
        {tabs.map((t) => (
          <div
            key={t}
            style={{
              flex: 1, textAlign: "center", padding: "7px 0", fontWeight: 600, fontSize: 12,
              color: t === tab ? C.accent : C.muted, borderBottom: `2px solid ${t === tab ? C.accent : "transparent"}`
            }}
          >
            {t}
            {t === "Saved" && badge ? (
              <span style={{ marginLeft: 4, background: C.redBg, color: C.red, borderRadius: 8, padding: "0 6px", fontSize: 11 }}>{badge}</span>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
};

export const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: C.muted, margin: "10px 0 6px", fontWeight: 600 }}>{children}</div>
);

/** A link card that pops in, optionally glowing as "the one to click". */
export const LinkCard: React.FC<{ label: string; why?: string; delay: number; glow?: number }> = ({ label, why, delay, glow = 0 }) => {
  const p = useIn(delay);
  return (
    <div
      style={{
        border: `1px solid ${C.accent}`, borderRadius: 7, padding: "8px 10px", margin: "5px 0", color: C.accent,
        opacity: p, transform: `translateY(${(1 - p) * 10}px)`,
        boxShadow: glow ? `0 0 0 ${3 * glow}px rgba(10,102,194,${0.25 * glow})` : "none",
        background: glow ? `rgba(234,243,251,${glow})` : "#fff"
      }}
    >
      <div style={{ fontWeight: 600 }}>{label}</div>
      {why ? <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{why}</div> : null}
    </div>
  );
};

/** Types `text` out over `frames` frames starting at `delay`. */
export function useTyped(text: string, delay: number, frames: number) {
  const frame = useCurrentFrame();
  const n = Math.round(interpolate(frame, [delay, delay + frames], [0, text.length], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad)
  }));
  return text.slice(0, n);
}

export const Button: React.FC<{ children: React.ReactNode; primary?: boolean; pressed?: number }> = ({ children, primary, pressed = 0 }) => (
  <div
    style={{
      display: "inline-block", borderRadius: 16, padding: "5px 12px", fontSize: 12, marginRight: 6,
      border: `1px solid ${C.accent}`, background: primary ? C.accent : "#fff", color: primary ? "#fff" : C.accent,
      transform: `scale(${1 - 0.06 * pressed})`
    }}
  >
    {children}
  </div>
);
