export const enabledIntegrations = {
  linear: !!process.env.LINEAR_CLIENT_ID,
} as const satisfies Record<string, boolean>;
