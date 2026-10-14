# Trailer

A 27-second product trailer made with [Remotion](https://www.remotion.dev) (videos written in React),
in a SaaS motion-graphics style: kinetic type that slides in with motion blur and brightens from
grey, hard cuts on the beat between ink and paper scenes, and **real pieces of the extension's
popup** (the posting, Start here cards, the found email, message types, follow-up rows, job cards)
flying in one at a time. 60 fps, with an original soundtrack and sound effects (whooshes, pops,
clicks, typing, a notification chime) synthesized to match every animation.

Three formats from the same code: **16:9** (`Trailer`, for the README, YouTube, Product Hunt),
**1:1** (`TrailerSquare`, for LinkedIn and Instagram feeds), and **9:16** (`TrailerVertical`, for
TikTok, Reels, Shorts, and LinkedIn on phones). Earlier cuts are kept for comparison: `TrailerV1`
(37 s), `TrailerV2` (20 s, recreated UI), and `TrailerV3` (20 s, full popup screenshots).

The UI uses made-up people and companies (Northwind, Maya Chen...), so no real LinkedIn members or
other brands appear in the ad.

```bash
cd promo
npm install
node capture/capture.mjs  # re-shoot the popup into public/shots/ and public/parts/ (after UI changes)
python3 music/make_v4.py  # rebuild public/music.wav (music + sound effects) from src/v4.json
npm run studio            # live preview in the browser; edit src/ and it reloads
npm run render            # out/trailer.mp4
npm run render:square     # out/trailer-square.mp4
npm run render:vertical   # out/trailer-vertical.mp4
npm run render:all        # all three
```

- **Timing and sound effects:** `src/v4.json` lists the scenes (length in frames at 60 fps, ink or
  paper) and, per scene, named cues: the frame something happens and the sound it makes. The video
  reads the cue frames for its animation; `music/make_v4.py` reads the same file to place each sound
  and a whoosh on every cut. Move a cue, re-run the script, and picture and sound stay together.
- **UI pieces:** `capture/capture.mjs` serves the extension locally, opens `popup/popup.html` in
  headless Chrome with a fake `chrome.*` API holding the demo data, clicks into each state, and saves
  full screenshots (`public/shots/`) plus single elements (`public/parts/`, sizes in `parts.json`).
  Change the demo data in `fakeChrome()` at the top of that file.
- **Scenes:** each is a component in `src/Trailer.tsx` (Pain, Inbox, Turn, Intro, Find, Email, Write,
  Follow, Jobs, Triad, Cta). The building blocks (`Kinetic` type, `Blur`, `Stage`, `Part`, `FlyIn`,
  `Pointer`) are at the top of the same file, with the colors in `T`.
- **Font:** Inter (SIL Open Font License, `public/fonts/`), bundled so renders don't need the network.
- **Music:** original and synthesized (numpy only), so there's nothing to license: a dark pad and
  heartbeat for the problem, a riser and a drop into a 120 BPM groove when the product appears, and a
  bright final chord when the button is clicked.

Remotion is free for individuals and small companies; check its license if that changes.
