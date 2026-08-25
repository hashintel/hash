export type VoiceProvider = "elevenlabs" | "openai";
export type VoiceElicitor = "brunch" | "mock";

export type VoiceExperimentSelection = {
  elicitor: VoiceElicitor;
  provider: VoiceProvider;
};

const legacySelections = {
  "elevenlabs-brunch": {
    elicitor: "brunch",
    provider: "elevenlabs",
  },
  "openai-realtime": {
    elicitor: "mock",
    provider: "openai",
  },
} as const satisfies Record<string, VoiceExperimentSelection>;

export const getVoiceExperimentLabel = ({
  elicitor,
  provider,
}: VoiceExperimentSelection): string =>
  `${provider === "openai" ? "OpenAI Realtime" : "ElevenLabs"} · ${
    elicitor === "brunch" ? "Brunch" : "mock tools"
  }`;

export const getVoiceExperimentSelection = (
  location: Pick<Location, "search">,
): VoiceExperimentSelection | null => {
  const searchParams = new URLSearchParams(location.search);
  const provider = searchParams.get("voiceProvider");
  const elicitor = searchParams.get("elicitor");

  if (provider !== null || elicitor !== null) {
    if (
      (provider !== "openai" && provider !== "elevenlabs") ||
      (elicitor !== "mock" && elicitor !== "brunch") ||
      (provider === "elevenlabs" && elicitor === "mock")
    ) {
      return null;
    }
    return { elicitor, provider };
  }

  const legacyExperiment = searchParams.get("voiceExperiment");
  return legacyExperiment && Object.hasOwn(legacySelections, legacyExperiment)
    ? legacySelections[legacyExperiment as keyof typeof legacySelections]
    : null;
};
