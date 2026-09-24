import { type CanonicalPetrinautMode } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  brunchEnv,
  brunchModes,
  previewConversationIdPrefix,
} from "@hashintel/brunch-agent/constants";

export type BrunchEvaluationMode = "F" | "I";

const evaluationModes: Readonly<
  Record<BrunchEvaluationMode, CanonicalPetrinautMode>
> = {
  F: brunchModes.stockOverFlue,
  I: brunchModes.integrated,
};

/** Build-time-only evaluation selection. Blank defaults to I; invalid labels fail. */
export const parseBrunchEvaluationMode = (
  value: string | undefined,
): BrunchEvaluationMode => {
  const candidate = value?.trim().toUpperCase();
  if (candidate === undefined || candidate === "") return "I";
  if (candidate === "F" || candidate === "I") return candidate;
  throw new Error(
    `Invalid ${brunchEnv.viteEvaluationMode} ${JSON.stringify(value)}; expected F or I.`,
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
  `${previewConversationIdPrefix}${netId}`;
