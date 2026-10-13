# Trailer

A 20-second product trailer made with [Remotion](https://www.remotion.dev) (videos written in React),
built from **real screenshots of the extension's popup**: a browser arrives, the cursor clicks the
extension icon, and the camera glides through Start here, the message writer, follow-ups, and the
Find tab, with crossfades between shots and an original synthesized soundtrack. 60 fps, eased
motion, no bouncy springs.

Three formats from the same code: **16:9** (`Trailer`, for the README, YouTube, Product Hunt),
**1:1** (`TrailerSquare`, for LinkedIn and Instagram feeds), and **9:16** (`TrailerVertical`, for
TikTok, Reels, Shorts, and LinkedIn on phones). Earlier cuts are kept for comparison: `TrailerV1`
(37 s, recreated UI) and `TrailerV2` (20 s, recreated UI with kinetic type).

The screenshots use made-up people and companies (Northwind, Maya Chen...), so no real LinkedIn
members or other brands appear in the ad.

```bash
cd promo
npm install
node capture/capture.mjs  # re-shoot the popup into public/shots/ (after changing the extension's UI)
npm run studio            # live preview in the browser; edit src/ and it reloads
npm run render            # out/trailer.mp4
npm run render:square     # out/trailer-square.mp4
npm run render:vertical   # out/trailer-vertical.mp4
npm run render:all        # all three
```

- **Screenshots:** `capture/capture.mjs` serves the extension locally, opens `popup/popup.html` in
  headless Chrome with a fake `chrome.*` API holding the demo data, clicks into each state, and saves
  3x PNGs plus `rects.json` (where buttons and lists are, so the cursor and camera aim at them).
  Change the demo data in `fakeChrome()` at the top of that file.
- **Change the words or shots:** each scene is a component in `src/Trailer.tsx` (Hook, Product,
  WriteShot, FollowShot, FindShot, End). The 3D `Camera`, `Hand` cursor, `Browser` frame, and
  `Backdrop` are in `src/fx.tsx`.
- **Change timing:** scene lengths and the crossfade length are in `src/timeline.json` (frames at
  60 fps). The music script reads the same file, so re-run `python3 music/make_music.py` and the
  hits move with the cuts.
- **Music:** `public/music.wav` is an original track synthesized by `music/make_music.py` (numpy
  only), timed to the cuts: quiet pads for the hook, drums on the product reveal, a whoosh into each
  cut, and a final chord on the call to action. Because it's generated, there's nothing to license.

Remotion is free for individuals and small companies; check its license if that changes.
