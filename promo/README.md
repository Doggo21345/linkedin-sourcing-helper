# Trailer

A 37-second product trailer made with [Remotion](https://www.remotion.dev) (videos written in React).
Three formats from the same code: **16:9** (`Trailer`, for the README, YouTube, Product Hunt),
**1:1** (`TrailerSquare`, for LinkedIn and Instagram feeds), and **9:16** (`TrailerVertical`, for
TikTok, Reels, Shorts, and LinkedIn on phones).

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

- **Change the words:** each scene is a small component in `src/Trailer.tsx` (Hook, Problem, Reveal,
  JobScene, WriteScene, FollowScene, FindScene, Cta). Scene lengths are in `LEN` at the top, in
  frames at 30 fps.
- **Change the demo data:** `src/theme.ts` (`DEMO`), and the lists at the top of each scene.
- **Colors and font:** `src/theme.ts`, matching the popup's own palette.
- **Music:** `public/music.wav` is an original track synthesized by `music/make_music.py` (numpy
  only), timed to the cuts: quiet pads for the hook, drums on the reveal at 7.2 s, a final chord on the
  call to action. Because it's generated, there's nothing to license. Change the chords, tempo, or
  sections in the script and run `python3 music/make_music.py` again. If you change scene lengths in
  `Trailer.tsx`, update `REVEAL` / `CTA` / `DUR` at the top of the script to match.

Remotion is free for individuals and small companies; check its license if that changes.
