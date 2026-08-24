export type VoiceExperiment = "openai-realtime" | "elevenlabs-brunch";

export const voiceExperimentLabel = {
  "openai-realtime": "OpenAI Realtime",
  "elevenlabs-brunch": "ElevenLabs + Brunch",
} satisfies Record<VoiceExperiment, string>;

export const voiceExperimentMode = {
  "openai-realtime": "Native voice · dummy tools",
  "elevenlabs-brunch": "Speech edge · real elicitor",
} satisfies Record<VoiceExperiment, string>;

export const getVoiceExperiment = (
  location: Pick<Location, "search">,
): VoiceExperiment | null => {
  const value = new URLSearchParams(location.search).get("voiceExperiment");

  if (value === "openai-realtime" || value === "elevenlabs-brunch") {
    return value;
  }

  return null;
};
