/**
 * Environment variables the Brunch server reads under any `NODE_ENV`, and
 * that launchers set for it.
 *
 * Turbo runs `dev` in strict environment mode, so `turbo.json` forwards
 * exactly these to that task. A name that only one script or a test-only
 * code path reads is declared in that module instead.
 * `test/architecture/environment-names.test.ts` holds the declarations,
 * Turbo's lists and every mention of a `BRUNCH_*` name in the repository
 * together.
 *
 * This module imports nothing, so the server, the panel's Vite config and
 * plain Node launchers can all load it.
 */
export const brunchEnv = {
  /**
   * hash-api's origin, the name hash-api and HASH's frontend read. The HASH
   * agent's route asks its `me` query who a request's session belongs to.
   * Unset or empty, every request on that route is refused.
   */
  apiOrigin: "API_ORIGIN",
  chatDbPath: "BRUNCH_CHAT_DB_PATH",
  chatModel: "BRUNCH_CHAT_MODEL",
  chatPort: "BRUNCH_CHAT_PORT",
  chatThinking: "BRUNCH_CHAT_THINKING",
  corsAllowedOrigins: "BRUNCH_CORS_ALLOWED_ORIGINS",
  dbKind: "BRUNCH_DB_KIND",
  devDbPath: "BRUNCH_DEV_DB_PATH",
  /**
   * HASH's exact origins, which may call the HASH agent's route with the
   * user's session cookie. Blank grants no cross-origin access to that route.
   */
  hashCorsAllowedOrigins: "BRUNCH_HASH_CORS_ALLOWED_ORIGINS",
  /**
   * `true` mounts the HASH agent's route and identity route on a production
   * server; anything else leaves them off there. Development and tests mount
   * them regardless.
   */
  hashAgentEnabled: "BRUNCH_HASH_AGENT_ENABLED",
  panelPort: "BRUNCH_PANEL_PORT",
  /** The dedicated Postgres fields; the SQLite store rejects every one of them. */
  postgres: {
    authMode: "BRUNCH_POSTGRES_AUTH_MODE",
    awsRegion: "BRUNCH_POSTGRES_AWS_REGION",
    database: "BRUNCH_POSTGRES_DATABASE",
    host: "BRUNCH_POSTGRES_HOST",
    password: "BRUNCH_POSTGRES_PASSWORD",
    port: "BRUNCH_POSTGRES_PORT",
    tlsCaPath: "BRUNCH_POSTGRES_TLS_CA_PATH",
    user: "BRUNCH_POSTGRES_USER",
  },
  stepAAccounting: "BRUNCH_STEP_A_ACCOUNTING",
  testKeepRecentTokens: "BRUNCH_TEST_KEEP_RECENT_TOKENS",
} as const;
