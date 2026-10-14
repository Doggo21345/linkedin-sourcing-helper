#!/usr/bin/env python3
"""Synthesizes the v4 trailer's soundtrack: music AND sound effects, from scratch.

Everything is timed from src/v4.json, the same file the video reads:
  scenes  -> where the cuts are; a whoosh lands on each one
  cues    -> per-scene sound effects (pop, click, typing, ding, boom...) at the
             exact frame the animation uses

Music: a dark, filtered pad for the problem (0 to "introducing"), a riser,
a drop into a 120 BPM groove when the product appears, and a bright final
chord once the call-to-action button is clicked.

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


GAIN = {"whoosh": 0.55, "swish": 0.28, "pop": 0.42, "click": 0.6, "tick": 0.3, "ticks": 0.32, "typing": 0.3,
        "ding": 0.55, "success": 0.5, "boom": 0.95, "riser": 0.5, "hit": 0.7, "shimmer": 0.4}


def make(kind, c):
    if kind == "ticks":
        return fx_ticks(c.get("len", 40))
    if kind == "typing":
        return fx_typing(c.get("len", 60))
    if kind == "riser":
        return fx_riser(c.get("len", 60))
    return {"whoosh": fx_whoosh, "swish": fx_swish, "pop": fx_pop, "click": fx_click, "tick": fx_tick,
            "ding": fx_ding, "success": fx_success, "boom": fx_boom, "hit": fx_hit, "shimmer": fx_shimmer}[kind]()


# A whoosh into every cut (the one into "introducing" gets the riser instead).
for s in V4["scenes"][1:]:
    if s["id"] == "intro":
        continue
    x, peak = fx_whoosh()
    sfx.add(x, sec(s["id"]) - peak, GAIN["whoosh"], pan=rng.uniform(-0.3, 0.3))

for scene, cues in V4["cues"].items():
    for name, c in cues.items():
        x, lead = make(c["sfx"], c)
        t = sec(scene, c["at"]) - lead
        if c["sfx"] == "riser":
            t = sec(scene, c["at"])
        pan = {"click": 0.15, "pop": rng.uniform(-0.25, 0.25), "tick": 0.1}.get(c["sfx"], 0.0)
        sfx.add(x, t, GAIN[c["sfx"]], pan)

# ---- Music ---------------------------------------------------------------------------------

# Am - F - C - G, two seconds (four beats) each.
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [33, 29, 36, 31]


def chord_at(t):
    return int(t // (4 * BEAT)) % 4


# Pad: whole track; dark and filtered before the drop, open after.
seg = 4 * BEAT
t = 0.0
while t < DUR:
    k = chord_at(t)
    n = int(seg * SR) + SR // 2
    tt = t_of(n)
    pad = sum(saw(hz(m), n, 8) + saw(hz(m) * 1.004, n, 8) for m in CHORDS[k]) / 6
    before = t < DROP
    cutoff = (500 + 1400 * min(1, t / DROP)) if before else 2600
    pad = lowpass(pad, cutoff) * np.minimum(1, tt / 0.4) * np.minimum(1, (n / SR - tt) / 0.5)
    g = (0.10 + 0.10 * min(1, t / DROP)) if before else 0.16
    if t >= END_CLICK - seg:
        g *= 0.6
    music.add(pad, t, g, pan=-0.1)
    t += seg

# Before the drop: a soft heartbeat kick from the inbox, ticking hats in the turn.
def kick(g=1.0):
    n = int(0.35 * SR)
    tt = t_of(n)
    f = 46 + 110 * np.exp(-tt / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * expdecay(n, 0.12) * g


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    return bandnoise(n, 7000, 16000) * expdecay(n, 0.05 if open_ else 0.012)


def clap():
    n = int(0.2 * SR)
    x = np.zeros(n)
    for d in (0, 0.008, 0.017):
        i = int(d * SR)
        m = n - i
        x[i:] += bandnoise(m, 900, 5000) * expdecay(m, 0.03 if d < 0.017 else 0.09)
    return x


b = 0
while b * BEAT < DROP - 0.1:
    t = b * BEAT
    if t >= sec("inbox") and b % 2 == 0:
        drums.add(kick(0.55), t, 0.8)
    if t >= sec("turn"):
        for s16 in range(4):
            drums.add(hat(), t + s16 * BEAT / 4, 0.08 + 0.04 * (s16 == 2))
    b += 1

# After the drop until the click: the groove.
b = int(np.ceil(DROP / BEAT))
while b * BEAT < END_CLICK - 0.02:
    t = b * BEAT
    k = chord_at(t)
    drums.add(kick(), t, 0.95)
    if b % 2 == 1:
        drums.add(clap(), t, 0.42, pan=0.05)
    drums.add(hat(True), t + BEAT / 2, 0.12, pan=0.2)
    for s16 in (1, 3):
        drums.add(hat(), t + s16 * BEAT / 4, 0.07, pan=-0.2)
    # Bass: root eighths, ducked under the kick.
    for e8 in range(2):
        n = int(BEAT / 2 * SR)
        tt = t_of(n)
        bass = lowpass(saw(hz(ROOTS[k]), n, 12), 420) * np.minimum(1, tt / 0.004) * expdecay(n, 0.16)
        bass *= np.minimum(1, tt / 0.07) if e8 == 0 else 1
        music.add(bass, t + e8 * BEAT / 2, 0.5)
    # Arpeggio pluck: 16ths through the chord, an octave up.
    notes = CHORDS[k] + [CHORDS[k][0] + 12]
    for s16 in range(4):
        m = notes[(b * 4 + s16) % 4] + 12
        n = int(0.22 * SR)
        pl = lowpass(saw(hz(m), n, 6), 3200 * expdecay(n, 0.05) + 300) * expdecay(n, 0.09)
        music.add(pl, t + s16 * BEAT / 4, 0.11, pan=0.35 if s16 % 2 else -0.35)
    b += 1

# The final chord: bright C major add9, ringing out after the click.
t = END_CLICK
n = int((DUR - t + 0.5) * SR)
tt = t_of(n)
chord = sum(saw(hz(m), n, 8) + saw(hz(m) * 1.003, n, 8) for m in [48, 55, 60, 64, 67, 74]) / 12
chord = lowpass(chord, 3000) * np.minimum(1, tt / 0.03) * np.exp(-tt / 3.0)
music.add(chord, t, 0.32)
music.add(bell(hz(76), DUR - t, 1.6), t + 0.05, 0.12, pan=0.2)

# ---- Mix -----------------------------------------------------------------------------------

m = music.stereo()
m = np.vstack([reverb(m[0], 2.0, 0.3), reverb(m[1], 2.1, 0.3)])
d = drums.stereo()
s = sfx.stereo()
s = np.vstack([reverb(s[0], 1.2, 0.18), reverb(s[1], 1.25, 0.18)])

# Duck the music under the boom so it hits clean.
duck = np.ones(N)
i = int(DROP * SR)
j = min(N, i + int(1.2 * SR))
duck[i:j] = 1 - 0.7 * np.exp(-t_of(j - i) / 0.35)
# Brief silence right before the drop, for contrast.
k0 = int((DROP - 0.12) * SR)
duck[k0:i] = np.linspace(1, 0.15, i - k0)

mix = (m * 0.9 + d * 0.85) * duck + s * 1.0
fade_out = np.clip((DUR - t_of(N)) / 1.5, 0, 1)
mix *= fade_out
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix *= 0.89 / np.max(np.abs(mix))

out = os.path.join(HERE, "..", "public", "music.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype(np.int16).tobytes())
print(f"wrote {os.path.normpath(out)}: {DUR:.2f} s, peak {np.max(np.abs(mix)):.2f}")
