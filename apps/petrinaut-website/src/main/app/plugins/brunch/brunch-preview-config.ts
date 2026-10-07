import { previewConversationIdPrefix } from "@hashintel/brunch-agent/constants";

export const resolveBrunchPreviewConfig = (endpoint: string | undefined) => {
  const configuredEndpoint = endpoint?.trim();
  return {
    chatEndpoint: configuredEndpoint || "/api/chat",
    isBrunchConfigured: Boolean(configuredEndpoint),
  };
};

/** The demo's Brunch endpoint, from `VITE_BRUNCH_CHAT_ENDPOINT`. */
export const brunchPreviewConfig = resolveBrunchPreviewConfig(
  import.meta.env.VITE_BRUNCH_CHAT_ENDPOINT,
);

export const createBrunchPreviewConversationId = (netId: string): string =>
  `${previewConversationIdPrefix}${netId}`;
