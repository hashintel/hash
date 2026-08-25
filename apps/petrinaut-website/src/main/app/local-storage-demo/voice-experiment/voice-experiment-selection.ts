export type VoiceProvider = "elevenlabs" | "openai";
export type VoiceElicitor = "brunch" | "mock";
export type VoiceDraftMode = "mock";

export type VoiceExperimentSelection = {
  draft?: VoiceDraftMode;
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
  draft,
  elicitor,
  provider,
}: VoiceExperimentSelection): string =>
  `${provider === "openai" ? "OpenAI Realtime" : "ElevenLabs"} · ${
    elicitor === "brunch" ? "Brunch" : "mock tools"
  }${draft === "mock" ? " · mock draft" : ""}`;

export const getVoiceExperimentSelection = (
  location: Pick<Location, "search">,
): VoiceExperimentSelection | null => {
  const searchParams = new URLSearchParams(location.search);
  const provider = searchParams.get("voiceProvider");
  const elicitor = searchParams.get("elicitor");
  const draft = searchParams.get("draft");

  if (draft !== null && draft !== "mock") {
    return null;
  }

  if (provider !== null || elicitor !== null) {
    if (
      (provider !== "openai" && provider !== "elevenlabs") ||
      (elicitor !== "mock" && elicitor !== "brunch") ||
      (provider === "elevenlabs" && elicitor === "mock")
    ) {
      return null;
    }
    return {
      ...(draft === "mock" ? { draft } : {}),
      elicitor,
      provider,
    };
  }

  const legacyExperiment = searchParams.get("voiceExperiment");
  return legacyExperiment && Object.hasOwn(legacySelections, legacyExperiment)
    ? {
        ...legacySelections[legacyExperiment as keyof typeof legacySelections],
        ...(draft === "mock" ? { draft } : {}),
      }
    : null;
};
