# Trailer

A 37-second product trailer made with [Remotion](https://www.remotion.dev) (videos written in React).
Two formats from the same code: **16:9** (`Trailer`, for the README, YouTube, Product Hunt) and
**1:1** (`TrailerSquare`, for LinkedIn and Instagram feeds).

Everything on screen is a recreation of the extension with made-up people and companies
(Northwind, Maya Chen...), so no real LinkedIn members or other brands appear in the ad.

```bash
cd promo
npm install
npm run studio          # live preview in the browser; edit src/ and it reloads
npm run render          # out/trailer.mp4
npm run render:square   # out/trailer-square.mp4
```

- **Change the words:** each scene is a small component in `src/Trailer.tsx` (Hook, Problem, Reveal,
  JobScene, WriteScene, FollowScene, FindScene, Cta). Scene lengths are in `LEN` at the top, in
  frames at 30 fps.
- **Change the demo data:** `src/theme.ts` (`DEMO`), and the lists at the top of each scene.
- **Colors and font:** `src/theme.ts`, matching the popup's own palette.
- **Music:** none is baked in. Add a track in your post editor, or drop an mp3 in `public/` and add
  Remotion's `<Audio>` to `Trailer`.

Remotion is free for individuals and small companies; check its license if that changes.
