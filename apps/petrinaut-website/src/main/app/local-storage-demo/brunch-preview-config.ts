import {
  INTEGRATED_BRUNCH_MODE,
  STOCK_OVER_FLUE_MODE,
  type CanonicalPetrinautMode,
} from "@hashintel/brunch-agent-plugin-sdcpn";

export type BrunchEvaluationMode = "F" | "I";

const evaluationModes: Readonly<
  Record<BrunchEvaluationMode, CanonicalPetrinautMode>
> = {
  F: STOCK_OVER_FLUE_MODE,
  I: INTEGRATED_BRUNCH_MODE,
};

/** Build-time-only evaluation selection. Blank defaults to I; invalid labels fail. */
export const parseBrunchEvaluationMode = (
  value: string | undefined,
): BrunchEvaluationMode => {
  const candidate = value?.trim().toUpperCase();
  if (candidate === undefined || candidate === "") return "I";
  if (candidate === "F" || candidate === "I") return candidate;
  throw new Error(
    `Invalid VITE_BRUNCH_EVALUATION_MODE ${JSON.stringify(value)}; expected F or I.`,
  );
};

export const resolveBrunchPreviewConfig = (
  endpoint: string | undefined,
  evaluationOverride?: string,
) => {
  const configuredEndpoint = endpoint?.trim();
  const evaluationMode = parseBrunchEvaluationMode(evaluationOverride);
  return {
    chatEndpoint: configuredEndpoint || "/api/chat",
    isBrunchConfigured: Boolean(configuredEndpoint),
    evaluationMode,
    serverMode: evaluationModes[evaluationMode],
  };
};

export const createBrunchPreviewConversationId = (netId: string): string =>
  `petrinaut-preview:${netId}`;
