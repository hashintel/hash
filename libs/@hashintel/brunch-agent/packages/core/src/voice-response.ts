import * as v from "valibot";

export const BRUNCH_VOICE_TOOL_NAME = "brunch_set_voice_response";
export const BRUNCH_VOICE_DATA_NAME = "brunch-voice-response";

const nonBlankString = v.pipe(
  v.string(),
  v.check((text) => /\S/u.test(text), "Expected non-blank text."),
);

export const BrunchVoiceInputSchema = v.object({ speech: nonBlankString });
export const BrunchVoiceDataSchema = v.object({
  speech: nonBlankString,
  toolCallId: nonBlankString,
});

export type BrunchVoiceData = v.InferOutput<typeof BrunchVoiceDataSchema>;

export const parseBrunchVoiceData = (
  data: unknown,
): BrunchVoiceData | undefined => {
  const parsed = v.safeParse(BrunchVoiceDataSchema, data);
  return parsed.success ? parsed.output : undefined;
};
