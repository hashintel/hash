export const enabledIntegrations = {
  /**
   * Read only by the ontology migrations and system web seeding, to decide
   * whether to create the Linear types and the `@linear` web.
   */
  linear:
    !!process.env.LINEAR_CLIENT_ID &&
    !!process.env.LINEAR_CLIENT_SECRET &&
    !!process.env.LINEAR_WEBHOOK_SECRET,
  googleSheets:
    !!process.env.GOOGLE_OAUTH_CLIENT_ID &&
    !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
} as const satisfies Record<string, boolean>;
