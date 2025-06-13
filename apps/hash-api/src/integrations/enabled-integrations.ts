export const enabledIntegrations = {
  linear:
    !!process.env.LINEAR_CLIENT_ID &&
    !!process.env.LINEAR_CLIENT_SECRET &&
    !!process.env.LINEAR_WEBHOOK_SECRET,
  googleSheets:
    !!process.env.GOOGLE_OAUTH_CLIENT_ID &&
    !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
} as const satisfies Record<string, boolean>;
