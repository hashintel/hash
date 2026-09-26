import type {
  PlaybackState,
  SDCPN,
  SimulationFrameState,
} from "@hashintel/petrinaut-core";

const placeLimit = 12;

/** "Queue 12, Agents busy 5, Done 40" in the model's own place order. */
const describeTokens = (
  frame: SimulationFrameState,
  definition: SDCPN,
): string => {
  const counts = definition.places
    .map((place) => ({
      name: place.name || place.id,
      tokenCount: frame.places[place.id]?.tokenCount,
    }))
    .filter(
      (entry): entry is { name: string; tokenCount: number } =>
        entry.tokenCount !== undefined,
    );
  if (counts.length === 0) return "";
  const shown = counts
    .slice(0, placeLimit)
    .map((entry) => `${entry.name} ${entry.tokenCount}`)
    .join(", ");
  const more =
    counts.length > placeLimit
      ? `, and ${counts.length - placeLimit} more places`
      : "";
  return ` Tokens now: ${shown}${more}.`;
};

/**
 * Quiet context for a playback transition on the canvas, whether the person
 * clicked the toolbar or asked the voice. Null when nothing changed. Frame
 * numbers are indices; the model's time units are not known here.
 */
export const describePlaybackChange = ({
  previous,
  next,
  frame,
  definition,
}: {
  readonly previous: PlaybackState;
  readonly next: PlaybackState;
  readonly frame: SimulationFrameState | null;
  readonly definition: SDCPN;
}): string | null => {
  if (previous === next) return null;
  const at = frame ? ` at frame ${frame.number}` : "";
  const tokens = frame ? describeTokens(frame, definition) : "";
  switch (next) {
    case "Playing":
      return previous === "Paused"
        ? `The simulation on the canvas resumed${at}.`
        : `The simulation on the canvas started playing${at}.${tokens}`;
    case "Paused":
      return `The simulation on the canvas paused${at}.${tokens} Describe what is on the canvas only from these numbers.`;
    case "Stopped":
      return "The simulation on the canvas was stopped and reset to the start.";
  }
};
