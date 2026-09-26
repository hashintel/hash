import { previewConversationIdPrefix } from "@hashintel/brunch-agent/constants";

export const resolveBrunchPreviewConfig = (endpoint: string | undefined) => {
  const configuredEndpoint = endpoint?.trim();
  return {
    chatEndpoint: configuredEndpoint || "/api/chat",
    isBrunchConfigured: Boolean(configuredEndpoint),
  };
};

export const createBrunchPreviewConversationId = (netId: string): string =>
  `${previewConversationIdPrefix}${netId}`;
