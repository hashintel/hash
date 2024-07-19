export const enabledIntegrations = {
  linear: Boolean(process.env.LINEAR_CLIENT_ID),
  googleSheets:
    Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
} as const satisfies Record<string, boolean>;
