import React from "react";
import { Composition } from "remotion";
import { Trailer, TRAILER_FRAMES } from "./Trailer";
import { TrailerV1, TRAILER_V1_FRAMES } from "./TrailerV1";
import { TrailerV2, TRAILER_V2_FRAMES } from "./TrailerV2";

// v3 runs at 60 fps for smooth motion; earlier cuts were 30.
export const FPS = 60;

export const Root: React.FC = () => (
  <>
    {/* 16:9 for the README, YouTube, and Product Hunt */}
    <Composition id="Trailer" component={Trailer} durationInFrames={TRAILER_FRAMES} fps={FPS} width={1920} height={1080} />
    {/* 1:1 for LinkedIn and Instagram feeds, where square takes more of the screen */}
    <Composition id="TrailerSquare" component={Trailer} durationInFrames={TRAILER_FRAMES} fps={FPS} width={1080} height={1080} />
    {/* 9:16 for TikTok, Instagram Reels, YouTube Shorts, and LinkedIn on phones */}
    <Composition id="TrailerVertical" component={Trailer} durationInFrames={TRAILER_FRAMES} fps={FPS} width={1080} height={1920} />
    {/* The first, slower version, kept for comparison */}
    <Composition id="TrailerV1" component={TrailerV1} durationInFrames={TRAILER_V1_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="TrailerV2" component={TrailerV2} durationInFrames={TRAILER_V2_FRAMES} fps={30} width={1920} height={1080} />
  </>
);
