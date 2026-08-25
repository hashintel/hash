export type VoiceProvider = "elevenlabs" | "openai";
export type VoiceElicitor = "brunch" | "mock";
export type VoiceProjector = "mock";

export type VoiceExperimentSelection = {
  elicitor: VoiceElicitor;
  projector?: VoiceProjector;
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
  projector,
  provider,
}: VoiceExperimentSelection): string =>
  `${provider === "openai" ? "OpenAI Realtime" : "ElevenLabs"} · ${
    elicitor === "brunch" ? "Brunch" : "mock tools"
  }${projector === "mock" ? " · mock projector" : ""}`;

export const getVoiceExperimentSelection = (
  location: Pick<Location, "search">,
): VoiceExperimentSelection | null => {
  const searchParams = new URLSearchParams(location.search);
  const provider = searchParams.get("voiceProvider");
  const elicitor = searchParams.get("elicitor");
  const projector = searchParams.get("projector");

  if (
    searchParams.has("draft") ||
    (projector !== null && projector !== "mock")
  ) {
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
      elicitor,
      ...(projector === "mock" ? { projector } : {}),
      provider,
    };
  }

  const legacyExperiment = searchParams.get("voiceExperiment");
  return legacyExperiment && Object.hasOwn(legacySelections, legacyExperiment)
    ? {
        ...legacySelections[legacyExperiment as keyof typeof legacySelections],
        ...(projector === "mock" ? { projector } : {}),
      }
    : null;
};
