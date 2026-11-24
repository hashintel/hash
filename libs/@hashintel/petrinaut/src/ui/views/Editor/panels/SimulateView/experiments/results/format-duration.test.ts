import { expect, it } from "vitest";

import { formatDurationMs } from "./format-duration";

it.each([
  // Millisecond resolution below a second.
  [0, "0ms"],
  [3.4, "3ms"],
  [342, "342ms"],
  [999.4, "999ms"],
  // A rounding overflow carries into the next unit.
  [999.6, "1.00s"],
  [9_996, "10.0s"],
  [59_999.9, "1m 00s"],
  [3_599_800, "1h 00m"],
  // Seconds from a second on.
  [1_000, "1.00s"],
  [9_999, "10.0s"],
  [12_340, "12.3s"],
  [59_940, "59.9s"],
  // Minutes with padded seconds, never sixty of them.
  [60_000, "1m 00s"],
  [119_600, "2m 00s"],
  [125_000, "2m 05s"],
  [3_599_000, "59m 59s"],
  // Hours past an hour.
  [3_600_000, "1h 00m"],
  [4_020_000, "1h 07m"],
  // A negative duration is clamped.
  [-4, "0ms"],
])("formatDurationMs renders %d ms as %s", (milliseconds, expected) => {
  expect(formatDurationMs(milliseconds)).toBe(expected);
});
