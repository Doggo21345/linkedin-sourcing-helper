# Trailer

A 20-second product trailer made with [Remotion](https://www.remotion.dev) (videos written in React):
3D camera moves over a recreated browser, UI that pops out of the screen, a hand cursor, kinetic
type, and zoom cuts, with an original synthesized soundtrack.

Three formats from the same code: **16:9** (`Trailer`, for the README, YouTube, Product Hunt),
**1:1** (`TrailerSquare`, for LinkedIn and Instagram feeds), and **9:16** (`TrailerVertical`, for
TikTok, Reels, Shorts, and LinkedIn on phones). The first, slower 37-second cut is kept as
`TrailerV1` for comparison.

Everything on screen is a recreation of the extension with made-up people and companies
(Northwind, Maya Chen...), so no real LinkedIn members or other brands appear in the ad.

```bash
cd promo
npm install
npm run studio          # live preview in the browser; edit src/ and it reloads
npm run render          # out/trailer.mp4
npm run render:square   # out/trailer-square.mp4
npm run render:vertical # out/trailer-vertical.mp4
npm run render:all      # all three
```

- **Change the words or shots:** each scene is a component in `src/Trailer.tsx` (Hook, BrowserScene,
  RecruiterScene, WriteScene, FollowScene, FindScene, EndScene). The motion pieces (3D `Camera`,
  `Kinetic` type, `Hand` cursor, `Lift` pop-outs, `SceneZoom` cuts) are in `src/fx.tsx`.
- **Change timing:** scene lengths are in `src/timeline.json` (frames at 30 fps). The music script
  reads the same file, so re-run `python3 music/make_music.py` and the hits move with the cuts.
- **Change the demo data:** `src/theme.ts` (`DEMO`), and the lists at the top of each scene.
- **Colors and font:** `src/theme.ts`, matching the popup's own palette.
- **Music:** `public/music.wav` is an original track synthesized by `music/make_music.py` (numpy
  only), timed to the cuts: quiet pads for the hook, drums on the reveal at 7.2 s, a final chord on the
  call to action. Because it's generated, there's nothing to license. Change the chords, tempo, or
  sections in the script and run `python3 music/make_music.py` again.

Remotion is free for individuals and small companies; check its license if that changes.
