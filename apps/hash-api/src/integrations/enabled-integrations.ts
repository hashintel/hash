export const enabledIntegrations = {
  linear: !!process.env.LINEAR_CLIENT_ID,
  googleSheets:
    !!process.env.GOOGLE_OAUTH_CLIENT_ID &&
    !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
} as const satisfies Record<string, boolean>;
