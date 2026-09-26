import { expect, test } from "vitest";

import { matchPlaybackCommand } from "./playback-command";

test.each([
  ["Play.", "play"],
  ["play it", "play"],
  ["Okay, play the simulation, please.", "play"],
  ["Let's start the simulation", "play"],
  ["Start playing", "play"],
  ["Resume it", "play"],
  ["Pause", "pause"],
  ["Can you pause the clock?", "pause"],
  ["pause it now", "pause"],
  ["Stop the simulation.", "stop"],
  ["Reset it", "stop"],
  ["stop playback", "stop"],
] as const)("routes %j to the canvas as %s", (transcript, command) => {
  expect(matchPlaybackCommand(transcript)).toBe(command);
});

test.each([
  "",
  "   ",
  "Stop.",
  "Stop!",
  "Reset",
  "Resume",
  "Continue",
  "Run the comparison",
  "Run it",
  "Play the simulation and add another agent",
  "The queue never gets that long, pause it.",
  "Pause the interview for a moment while I check something",
  "I'd like to pause and think about whether callers actually hang up",
  "Pause the simulation " + "x".repeat(70),
])("leaves %j to Brunch", (transcript) => {
  expect(matchPlaybackCommand(transcript)).toBeNull();
});
