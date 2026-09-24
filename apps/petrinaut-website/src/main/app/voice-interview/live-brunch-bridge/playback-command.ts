export type PlaybackCommand = "play" | "pause" | "stop";

const lead = String.raw`(?:(?:ok(?:ay)?|please|now|so|and|can you|could you|let'?s|just)[,\s]+)*`;
const target = String.raw`the\s+(?:simulation|sim|scenario|model|playback|animation|clock)`;
const optionalObject = String.raw`(?:\s+(?:it|this|that|${target}))?`;
const requiredObject = String.raw`\s+(?:it|this|that|${target})`;
const tail = String.raw`(?:[,\s]+(?:please|now|again|for me))?[.!?\s]*`;

const whole = (body: string) => new RegExp(`^${lead}(?:${body})${tail}$`, "iu");

const patterns: readonly [RegExp, PlaybackCommand][] = [
  [
    whole(
      String.raw`play${optionalObject}|start\s+(?:playing|playback)|start\s+${target}|resume${requiredObject}`,
    ),
    "play",
  ],
  [whole(String.raw`pause${optionalObject}|pause\s+playback`), "pause"],
  // A bare "stop" more often means "stop talking" or "stop that response",
  // which GPT-Live and the Stop button already handle. Only an explicit
  // target reaches the canvas.
  [
    whole(
      String.raw`(?:stop|reset)${requiredObject}|stop\s+(?:playing|playback)`,
    ),
    "stop",
  ],
];

/**
 * The short canvas commands the browser answers itself instead of sending to
 * Brunch. Only a whole utterance that is nothing but the command matches; a
 * remark that mentions playing or pausing inside a longer sentence is a
 * Brunch turn like any other.
 */
export const matchPlaybackCommand = (
  transcript: string,
): PlaybackCommand | null => {
  const text = transcript.trim();
  if (!text || text.length > 80) return null;
  for (const [pattern, result] of patterns) {
    if (pattern.test(text)) return result;
  }
  return null;
};
