export const resolveBrunchPreviewConfig = (endpoint: string | undefined) => {
  const configuredEndpoint = endpoint?.trim();
  return configuredEndpoint
    ? { chatEndpoint: configuredEndpoint, isBrunchConfigured: true }
    : { chatEndpoint: "/api/chat", isBrunchConfigured: false };
};

export const createBrunchPreviewConversationId = (netId: string): string =>
  `petrinaut-preview:${netId}`;
