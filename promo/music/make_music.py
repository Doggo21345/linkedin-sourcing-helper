#!/usr/bin/env python3
"""Synthesizes the trailer's music from scratch, so it's original and free to use.

Timing comes from src/timeline.json, the same file the video reads, so the
music always lands on the cuts:
  hook        soft pads and a rising swell (tension)
  browser..   drums, bass, and an arpeggio drop in as the product appears
  every cut   a whoosh into it and a low hit on it
  end         drums drop out, a final chord rings and fades

Run: python3 music/make_music.py   ->  public/music.wav
"""
import json
import os
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, "..", "src", "timeline.json")))
FPS = TL["fps"]
STARTS = {}
_f = 0
for _s in TL["scenes"]:
    STARTS[_s["id"]] = _f / FPS
    _f += _s["frames"]
CUTS = sorted(v for v in STARTS.values() if v > 0)

SR = 44100
DUR = _f / FPS            # matches the video exactly
BPM = 120
BEAT = 60 / BPM           # 0.5 s
REVEAL = STARTS["browser"]  # the product appears: the drop
CTA = STARTS["end"]         # the end card
N = int(DUR * SR)
rng = np.random.default_rng(7)  # fixed seed: same track every run

# vi-IV-I-V in C (Am, F, C, G): bright but a little emotional. Two seconds each.
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [45, 41, 48, 43]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def t_of(n):
    return np.arange(n) / SR


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be a scalar or an array (for filter sweeps)."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # fine for 37 s; keeps the dependency list to numpy
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def saw(f, n, harmonics=8, detune=0.0):
    t = t_of(n)
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        out += np.sin(2 * np.pi * f * (1 + detune) * k * t) / k
    return out * 0.5


def env(n, a=0.01, d=0.1, s=0.7, r=0.2):
    """ADSR over n samples (release fits inside n)."""
    e = np.full(n, s)
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    A = min(A, n); e[:A] = np.linspace(0, 1, A, endpoint=False)
    D = min(D, max(0, n - A)); e[A:A + D] = np.linspace(1, s, D, endpoint=False)
    R = min(R, n); e[n - R:] *= np.linspace(1, 0, R)
    return e


L = np.zeros(N)
R_ = np.zeros(N)


def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i:i + len(sig)] += sig * gain * (1 - max(0, pan))
    R_[i:i + len(sig)] += sig * gain * (1 + min(0, pan))


def chord_at(t):
    return int(((t - REVEAL) // (4 * BEAT)) % 4) if t >= REVEAL else int((t // (4 * BEAT)) % 4)


# ---- Pads: the whole way through, wider and brighter after the reveal ------------
bar = 4 * BEAT
t = 0.0
while t < DUR:
    idx = chord_at(t + 0.001)
    # Bars run from 0 until the reveal, then restart on the reveal so the drums
    # land on a downbeat; the bar before it is cut short to meet it.
    nxt = t + bar if t >= REVEAL or t + bar <= REVEAL else REVEAL
    # Each chord releases as the next begins (a short overlap is a crossfade, not a clash).
    n = int((min(nxt, DUR) - t + 0.15) * SR)
    for note in CHORDS[idx]:
        for side, det in ((-0.7, -0.003), (0.7, 0.003)):  # slight detune per side = width
            s = saw(hz(note), n, harmonics=6, detune=det) * env(n, a=0.4, d=0.3, s=0.8, r=0.3)
            add(s, t, gain=0.05, pan=side)
    t = nxt

# ---- Swell into the reveal: filtered noise rising over 2 s ------------------------
n = int(2.0 * SR)
noise = rng.standard_normal(n)
swell = lowpass(noise, np.linspace(300, 6000, n)) * np.linspace(0, 1, n) ** 2 * 0.25
add(swell, REVEAL - 2.0, pan=0)

# ---- Drums, bass, arpeggio: reveal until the call to action -------------------------
def kick():
    n = int(0.35 * SR); tt = t_of(n)
    f = 45 + 75 * np.exp(-tt * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)


def clap():
    n = int(0.2 * SR); tt = t_of(n)
    x = rng.standard_normal(n)
    x = x - lowpass(x, 900)          # high-pass-ish
    return x * np.exp(-tt * 22) * 0.6


def hat():
    n = int(0.06 * SR); tt = t_of(n)
    x = rng.standard_normal(n)
    x = x - lowpass(x, 6000)
    return x * np.exp(-tt * 70) * 0.35


def pluck(f):
    n = int(0.28 * SR); tt = t_of(n)
    x = saw(f, n, harmonics=5) * np.exp(-tt * 14)
    return lowpass(x, 3500)


K, CL, H = kick(), clap(), hat()
beats = int((CTA - REVEAL) / BEAT)
for b in range(beats):
    tb = REVEAL + b * BEAT
    add(K, tb, gain=0.55)
    if b % 2 == 1:
        add(CL, tb, gain=0.22)
    add(H, tb + BEAT / 2, gain=0.18, pan=0.3)
    idx = chord_at(tb + 0.001)
    # Bass: root on eighths, ducked under the kick.
    for e in range(2):
        n = int(BEAT / 2 * SR)
        s = lowpass(saw(hz(ROOTS[idx]), n, harmonics=4), 500) * env(n, a=0.005, d=0.05, s=0.6, r=0.05)
        if e == 0:
            s *= np.linspace(0.3, 1, n) ** 0.5
        add(s, tb + e * BEAT / 2, gain=0.26)
    # Arpeggio: chord tones an octave up on sixteenths, panned gently.
    notes = CHORDS[idx] + [CHORDS[idx][0] + 12]
    for s16 in range(4):
        add(pluck(hz(notes[(b * 4 + s16) % 4] + 12)), tb + s16 * BEAT / 4, gain=0.07, pan=0.25 if s16 % 2 else -0.25)

# ---- Transitions: a whoosh into every cut and a low hit on it ----------------------
def whoosh(n):
    x = rng.standard_normal(n)
    return lowpass(x, np.linspace(400, 9000, n)) * np.linspace(0, 1, n) ** 2.2


def hit():
    n = int(0.5 * SR); tt = t_of(n)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-tt * 18)) / SR) * np.exp(-tt * 6)
    return boom


W, HIT = whoosh(int(0.32 * SR)), hit()
for cut in CUTS:
    add(W, cut - 0.32, gain=0.14, pan=0)
    add(HIT, cut, gain=0.35 if cut in (REVEAL, CTA) else 0.18)

# ---- Call to action: a ringing C major chord and a bell, then fade ----------------
n = int((DUR - CTA + 0.5) * SR)
for note in (48, 55, 60, 64, 67):
    s = saw(hz(note), n, harmonics=5) * env(n, a=0.05, d=1.0, s=0.5, r=2.5)
    add(s, CTA, gain=0.06, pan=0)
tt = t_of(n)
bell = (np.sin(2 * np.pi * hz(84) * tt) + 0.4 * np.sin(2 * np.pi * hz(91) * tt)) * np.exp(-tt * 1.6)
add(bell, CTA, gain=0.08)

# ---- Master: gentle glue, fades, normalize -----------------------------------------------
mix = np.stack([L, R_])
fade_in = np.minimum(1, t_of(N) / 0.6)
fade_out = np.clip((DUR - t_of(N)) / 2.5, 0, 1)
mix *= fade_in * fade_out
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 0.89 / np.max(np.abs(mix))       # about -1 dBFS peak

out = os.path.join(HERE, "..", "public", "music.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype(np.int16).tobytes())
print(f"wrote {os.path.normpath(out)}: {DUR:.2f} s, peak {np.max(np.abs(mix)):.2f}")
