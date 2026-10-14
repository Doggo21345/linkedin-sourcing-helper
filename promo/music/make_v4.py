#!/usr/bin/env python3
"""Synthesizes the v4 trailer's soundtrack: music AND sound effects, from scratch.

Everything is timed from src/v4.json, the same file the video reads:
  scenes  -> where the cuts are; a whoosh lands on each one
  cues    -> per-scene sound effects (pop, click, typing, ding, boom...) at the
             exact frame the animation uses

Music: a music-box arpeggio and pad for the problem (0 to "introducing"), a
snare build and riser, a drop into a 120 BPM groove with a melody hook when the
product appears, and a bright final chord once the call-to-action button is
clicked.

Run: python3 music/make_v4.py   ->  public/music.wav
"""
import json
import os
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
V4 = json.load(open(os.path.join(HERE, "..", "src", "v4.json")))
FPS = V4["fps"]
SR = 44100
BEAT = 60 / V4["bpm"]
rng = np.random.default_rng(11)  # fixed seed: the same track every run

START = {}
_f = 0
for s in V4["scenes"]:
    START[s["id"]] = _f
    _f += s["frames"]
DUR = _f / FPS
N = int(DUR * SR)


def sec(scene, frame=0):
    return (START[scene] + frame) / FPS


def cue_t(scene, name):
    return sec(scene, V4["cues"][scene][name]["at"])


DROP = sec("intro")                    # the product appears
END_CLICK = cue_t("cta", "click")      # the button is clicked: drums stop


# ---- DSP helpers ---------------------------------------------------------------------------

def t_of(n):
    return np.arange(n) / SR


def lowpass(x, cutoff):
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * np.clip(cutoff, 10, SR / 2.2) / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def bandnoise(n, lo, hi):
    return highpass(lowpass(rng.standard_normal(n), hi), lo)


def expdecay(n, tau):
    return np.exp(-t_of(n) / tau)


def bell(f, dur, tau=0.5):
    n = int(dur * SR)
    t = t_of(n)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (tau / r ** 0.6)) for r, a in [(1, 1), (2.0, 0.35), (2.76, 0.25), (5.4, 0.08)])
    return x * np.minimum(1, t / 0.002)


def saw(f, n, harmonics=10):
    t = t_of(n)
    return sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, harmonics + 1)) * 0.6


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def reverb(x, seconds=1.6, mix=0.25):
    """Convolution with a decaying noise burst: cheap, smooth room."""
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-t_of(n) / (seconds / 5))
    ir = lowpass(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + wet * mix * 2.2


class Bus:
    def __init__(self):
        self.l = np.zeros(N + SR * 3)
        self.r = np.zeros(N + SR * 3)

    def add(self, sig, t, gain=1.0, pan=0.0):
        i = int(t * SR)
        if i < 0:
            sig, i = sig[-i:], 0
        j = min(len(self.l), i + len(sig))
        sig = sig[: j - i] * gain
        self.l[i:j] += sig * np.sqrt((1 - pan) / 2) * 1.414
        self.r[i:j] += sig * np.sqrt((1 + pan) / 2) * 1.414

    def stereo(self):
        return np.vstack([self.l[:N], self.r[:N]])


music, drums, sfx = Bus(), Bus(), Bus()

# ---- Sound effects -------------------------------------------------------------------------

def fx_whoosh(dur=0.55, peak=0.72):
    n = int(dur * SR)
    t = t_of(n) / dur
    shape = np.where(t < peak, (t / peak) ** 2.2, np.exp(-(t - peak) / (1 - peak) * 4))
    cut = 400 + 7000 * shape
    return highpass(lowpass(rng.standard_normal(n), cut), 180) * shape, peak * dur


def fx_swish():
    x, p = fx_whoosh(0.28, 0.6)
    return highpass(x, 900) * 0.8, p


def fx_pop():
    n = int(0.12 * SR)
    t = t_of(n)
    f = 380 + 700 * np.exp(-t / 0.018)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * expdecay(n, 0.04)
    return x + bandnoise(n, 2000, 9000) * expdecay(n, 0.004) * 0.3, 0.0


def fx_click():
    def one(g):
        n = int(0.03 * SR)
        return (bandnoise(n, 1500, 12000) * expdecay(n, 0.0025) + np.sin(2 * np.pi * 3200 * t_of(n)) * expdecay(n, 0.006) * 0.5) * g
    x = np.zeros(int(0.12 * SR))
    a = one(1.0)
    x[: len(a)] += a
    b = one(0.55)
    x[int(0.07 * SR): int(0.07 * SR) + len(b)] += b
    return x, 0.0


def fx_tick(pitch=2400):
    n = int(0.04 * SR)
    return np.sin(2 * np.pi * pitch * t_of(n)) * expdecay(n, 0.008) * 0.8 + bandnoise(n, 3000, 12000) * expdecay(n, 0.002) * 0.3, 0.0


def fx_ticks(length):
    # Fast at the start, slowing at the end, like the counter it follows.
    total = length / FPS
    out = np.zeros(int((total + 0.1) * SR))
    for k in range(22):
        u = k / 21
        t = total * (1 - (1 - u) ** 1.6)
        tk, _ = fx_tick(1800 + 900 * u)
        i = int(t * SR)
        out[i: i + len(tk)] += tk * (0.55 + 0.45 * u)
    return out, 0.0


def fx_typing(length):
    total = length / FPS
    out = np.zeros(int((total + 0.1) * SR))
    t = 0.0
    while t < total:
        n = int(0.035 * SR)
        g = rng.uniform(0.5, 1.0)
        key = bandnoise(n, 1200, rng.uniform(5000, 9000)) * expdecay(n, 0.006) + np.sin(2 * np.pi * rng.uniform(150, 220) * t_of(n)) * expdecay(n, 0.01) * 0.6
        i = int(t * SR)
        out[i: i + n] += key * g * 0.7
        t += rng.uniform(0.045, 0.085)
    return out, 0.0


def fx_ding():
    x = np.zeros(int(1.4 * SR))
    a = bell(hz(84), 1.2, 0.5)          # C6
    b = bell(hz(91), 1.2, 0.6)          # G6
    x[: len(a)] += a
    x[int(0.11 * SR): int(0.11 * SR) + len(b)] += b * 0.9
    return x * 0.6, 0.0


def fx_success():
    x = np.zeros(int(1.0 * SR))
    for k, m in enumerate([84, 88, 91]):  # C E G, up
        b = bell(hz(m), 0.8, 0.3)
        i = int(k * 0.065 * SR)
        x[i: i + len(b)] += b * (0.6 + 0.2 * k)
    return x * 0.5, 0.0


def fx_boom():
    n = int(2.2 * SR)
    t = t_of(n)
    f = 38 + 50 * np.exp(-t / 0.12)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * expdecay(n, 0.7)
    body = lowpass(rng.standard_normal(n), 1800 * np.exp(-t / 0.08) + 120) * expdecay(n, 0.25) * 0.8
    return np.tanh((sub + body) * 1.6) * 0.9, 0.0


def fx_riser(length):
    total = length / FPS
    n = int(total * SR)
    u = t_of(n) / total
    noise = lowpass(rng.standard_normal(n), 300 + 9000 * u ** 2) * u ** 1.6
    f = hz(45) * 2 ** (2.5 * u)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * u ** 2 * 0.25
    return (noise + tone) * 0.8, total   # peaks right at the cut


def fx_hit():
    n = int(0.6 * SR)
    t = t_of(n)
    f = 52 + 90 * np.exp(-t / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * expdecay(n, 0.22)
    snap = bandnoise(n, 800, 7000) * expdecay(n, 0.02) * 0.5
    return np.tanh((x + snap) * 1.4) * 0.8, 0.0


def fx_shimmer():
    x = np.zeros(int(2.6 * SR))
    for k, m in enumerate([96, 100, 103, 108]):
        b = bell(hz(m) * rng.uniform(0.997, 1.003), 2.4, 0.9)
        i = int(k * 0.05 * SR)
        x[i: i + len(b)] += b * 0.35
    return x * (0.6 + 0.4 * np.sin(2 * np.pi * 6 * t_of(len(x)))), 0.0


def fx_cut():
    """A camera cut inside a scene: a short whoosh into a soft thump."""
    x, peak = fx_whoosh(0.32, 0.8)
    n = int(0.25 * SR)
    f = 60 + 80 * np.exp(-t_of(n) / 0.02)
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * expdecay(n, 0.06) * 0.6
    j = int(peak * SR)
    out = np.zeros(max(len(x), j + n))
    out[: len(x)] += x
    out[j: j + n] += thump
    return out, peak


GAIN = {"cut": 0.5, "whoosh": 0.55, "swish": 0.28, "pop": 0.42, "click": 0.6, "tick": 0.3, "ticks": 0.32, "typing": 0.3,
        "ding": 0.55, "success": 0.5, "boom": 0.95, "riser": 0.5, "hit": 0.7, "shimmer": 0.4}


def make(kind, c):
    if kind == "ticks":
        return fx_ticks(c.get("len", 40))
    if kind == "typing":
        return fx_typing(c.get("len", 60))
    if kind == "riser":
        return fx_riser(c.get("len", 60))
    return {"cut": fx_cut, "whoosh": fx_whoosh, "swish": fx_swish, "pop": fx_pop, "click": fx_click, "tick": fx_tick,
            "ding": fx_ding, "success": fx_success, "boom": fx_boom, "hit": fx_hit, "shimmer": fx_shimmer}[kind]()


# A whoosh into every cut (the one into "introducing" gets the riser instead).
for s in V4["scenes"][1:]:
    if s["id"] == "intro":
        continue
    x, peak = fx_whoosh()
    sfx.add(x, sec(s["id"]) - peak, GAIN["whoosh"], pan=rng.uniform(-0.3, 0.3))

for scene, cues in V4["cues"].items():
    for name, c in cues.items():
        if c["sfx"] == "none":
            continue
        x, lead = make(c["sfx"], c)
        t = sec(scene, c["at"]) - lead
        if c["sfx"] == "riser":
            t = sec(scene, c["at"])
        pan = {"click": 0.15, "pop": rng.uniform(-0.25, 0.25), "tick": 0.1}.get(c["sfx"], 0.0)
        sfx.add(x, t, GAIN[c["sfx"]], pan)

# ---- Music ---------------------------------------------------------------------------------
# Written for laptop speakers and phones: the hook, chords, and bass all live in the
# 200 Hz - 4 kHz range those speakers actually play, with only a little sub underneath.

# Am - F - C - G, two seconds (four beats) each.
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [45, 41, 48, 43]                 # bass an octave higher than a club track, so it's heard
# The hook: eighth notes over each chord (None = rest). A minor, around 500-800 Hz.
HOOK = [
    [76, None, 72, 74, 76, None, 79, 76],
    [77, 76, 72, None, 69, None, 72, None],
    [76, None, 74, 72, 67, None, 72, 76],
    [74, None, 71, 67, 74, None, 71, None],
]
lead = Bus()   # kept out of the sidechain pump so the melody stays steady


def chord_at(t):
    return int(t // (4 * BEAT)) % 4


def supersaw(m, n, voices=5, spread=0.012):
    return sum(saw(hz(m) * (1 + spread * (v - (voices - 1) / 2) / voices), n, 9) for v in range(voices)) / voices


def pluck(m, dur=0.3, bright=4200, tau=0.12):
    n = int(dur * SR)
    tt = t_of(n)
    x = saw(hz(m), n, 10) * 0.6 + np.sign(np.sin(2 * np.pi * hz(m) * tt)) * 0.25
    return lowpass(x, bright * np.exp(-tt / 0.08) + 500) * np.minimum(1, tt / 0.003) * np.exp(-tt / tau)


def kick(g=1.0):
    n = int(0.32 * SR)
    tt = t_of(n)
    f = 52 + 120 * np.exp(-tt / 0.025)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * expdecay(n, 0.09) * 0.6
    click = bandnoise(n, 2000, 8000) * expdecay(n, 0.004) * 0.9   # the part small speakers hear
    return (body + click) * g


def hat(open_=False):
    n = int((0.16 if open_ else 0.05) * SR)
    return bandnoise(n, 6500, 16000) * expdecay(n, 0.05 if open_ else 0.012)


def clap():
    n = int(0.22 * SR)
    x = np.zeros(n)
    for d in (0, 0.009, 0.018):
        i = int(d * SR)
        x[i:] += bandnoise(n - i, 800, 6000) * expdecay(n - i, 0.025 if d < 0.018 else 0.11)
    return x


def snare_roll(t0, t1):
    """16ths into 32nds, getting louder: the build into the drop."""
    t = t0
    while t < t1 - 0.01:
        u = (t - t0) / (t1 - t0)
        drums.add(clap(), t, 0.12 + 0.45 * u ** 1.5)
        t += BEAT / 4 if u < 0.6 else BEAT / 8


kicks = []

# 1) Before the drop: a music-box arpeggio and a soft pad, opening up as the problem builds.
b = 0
while b * BEAT < DROP - 0.05:
    t = b * BEAT
    k = chord_at(t)
    notes = CHORDS[k] + [CHORDS[k][1] + 12]
    grow = min(1, t / DROP)
    for e8 in range(2):
        m = notes[(b * 2 + e8) % 4] + 12
        bl = bell(hz(m), 0.9, 0.35)
        music.add(bl, t + e8 * BEAT / 2, 0.10 + 0.08 * grow, pan=0.3 if e8 else -0.3)
    if b % 4 == 0:
        n = int(4 * BEAT * SR) + SR // 3
        tt = t_of(n)
        pad = sum(supersaw(m, n, 3) for m in CHORDS[k]) / 3
        pad = lowpass(pad, 900 + 2200 * grow) * np.minimum(1, tt / 0.5) * np.minimum(1, (n / SR - tt) / 0.4)
        music.add(pad, t, 0.07 + 0.08 * grow)
    if t >= sec("inbox") and b % 2 == 0:
        drums.add(kick(0.5), t, 0.7)
        kicks.append(t)
    if t >= sec("turn"):
        drums.add(hat(), t + BEAT / 2, 0.10)
    b += 1
snare_roll(DROP - 4 * BEAT, DROP - 0.06)

# 2) The drop to the click: four-on-the-floor, pumping chords, bass, and the hook.
b = int(np.ceil(DROP / BEAT))
while b * BEAT < END_CLICK - 0.02:
    t = b * BEAT
    k = chord_at(t)
    beat_in_bar = b % 4
    drums.add(kick(), t, 0.9)
    kicks.append(t)
    if b % 2 == 1:
        drums.add(clap(), t, 0.5, pan=0.05)
    drums.add(hat(True), t + BEAT / 2, 0.2, pan=0.2)
    for s16 in (1, 3):
        drums.add(hat(), t + s16 * BEAT / 4, 0.11, pan=-0.2)
    # Chords: a bright supersaw on every beat (the sidechain pump makes it breathe).
    n = int(BEAT * SR)
    tt = t_of(n)
    ch = sum(supersaw(m, n) for m in CHORDS[k] + [CHORDS[k][0] + 12]) / 4
    ch = lowpass(ch, 4200) * np.minimum(1, tt / 0.01) * np.minimum(1, (n / SR - tt) / 0.02)
    music.add(ch, t, 0.28, pan=-0.05)
    # Bass: offbeat eighths an octave up, with overtones a laptop can play.
    for e8 in range(2):
        n2 = int(BEAT / 2 * SR)
        tt2 = t_of(n2)
        bass = lowpass(saw(hz(ROOTS[k]), n2, 16), 1100) * np.minimum(1, tt2 / 0.004) * expdecay(n2, 0.14)
        bass += np.sin(2 * np.pi * hz(ROOTS[k] - 12) * tt2) * expdecay(n2, 0.14) * 0.2   # a little sub
        music.add(bass, t + e8 * BEAT / 2, 0.30 if e8 else 0.18)
    # Hook: eighth notes over the bar.
    bar_notes = HOOK[k]
    for e8 in range(2):
        m = bar_notes[beat_in_bar * 2 + e8]
        if m is not None:
            lead.add(pluck(m, 0.34, 5200, 0.16), t + e8 * BEAT / 2, 0.42, pan=0.08)
            lead.add(pluck(m + 12, 0.2, 6000, 0.08), t + e8 * BEAT / 2, 0.10, pan=-0.2)   # sparkle octave
    b += 1

# 3) The click: the beat stops, a bright final chord and a bell ring out.
t = END_CLICK
n = int((DUR - t + 0.5) * SR)
tt = t_of(n)
chord = sum(supersaw(m, n) for m in [48, 55, 60, 64, 67, 74]) / 6
chord = lowpass(chord, 3800) * np.minimum(1, tt / 0.02) * np.exp(-tt / 2.6)
music.add(chord, t, 0.30)
lead.add(pluck(76, 1.6, 5000, 0.7), t, 0.32)
lead.add(bell(hz(88), DUR - t, 1.4), t + 0.12, 0.10, pan=0.2)

# ---- Mix -----------------------------------------------------------------------------------

# Sidechain pump: the chords and bass duck on every kick and swell back.
pump = np.ones(N)
for kt in kicks:
    i = int(kt * SR)
    j = min(N, i + int(0.45 * SR))
    if i < N:
        pump[i:j] = np.minimum(pump[i:j], 1 - 0.65 * np.exp(-t_of(j - i) / 0.11))

m = music.stereo() * pump
m = np.vstack([reverb(m[0], 1.8, 0.22), reverb(m[1], 1.9, 0.22)])
ld = lead.stereo()
ld = np.vstack([reverb(ld[0], 1.6, 0.25), reverb(ld[1], 1.7, 0.25)])
d = drums.stereo()
s = sfx.stereo()
s = np.vstack([reverb(s[0], 1.2, 0.16), reverb(s[1], 1.25, 0.16)])

# Duck the music under the boom so it hits clean, with a breath of silence before the drop.
duck = np.ones(N)
i = int(cue_t("intro", "card") * SR)
j = min(N, i + int(1.0 * SR))
duck[i:j] = 1 - 0.55 * np.exp(-t_of(j - i) / 0.3)
k0, k1 = int((DROP - 0.1) * SR), int(DROP * SR)
duck[k0:k1] = np.linspace(1, 0.1, k1 - k0)

mix = (m * 1.0 + ld * 1.0 + d * 0.8) * duck + s * 0.85
for ch in range(2):
    mix[ch] = highpass(mix[ch], 32)          # nothing useful below 32 Hz
    mix[ch] -= 0.45 * lowpass(mix[ch], 140)  # tilt toward the mids that small speakers play
fade_out = np.clip((DUR - t_of(N)) / 1.5, 0, 1)
mix *= fade_out
mix = np.tanh(mix * 2.2) / np.tanh(2.2)
mix *= 0.89 / np.max(np.abs(mix))

out = os.path.join(HERE, "..", "public", "music.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype(np.int16).tobytes())
print(f"wrote {os.path.normpath(out)}: {DUR:.2f} s, peak {np.max(np.abs(mix)):.2f}")
