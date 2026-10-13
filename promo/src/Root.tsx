import React from "react";
import { Composition } from "remotion";
import { Trailer, TRAILER_FRAMES } from "./Trailer";

export const FPS = 30;

export const Root: React.FC = () => (
  <>
    {/* 16:9 for the README, YouTube, and Product Hunt */}
    <Composition id="Trailer" component={Trailer} durationInFrames={TRAILER_FRAMES} fps={FPS} width={1920} height={1080} />
    {/* 1:1 for LinkedIn and Instagram feeds, where square takes more of the screen */}
    <Composition id="TrailerSquare" component={Trailer} durationInFrames={TRAILER_FRAMES} fps={FPS} width={1080} height={1080} />
  </>
);
