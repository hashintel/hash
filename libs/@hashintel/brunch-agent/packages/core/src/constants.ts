/**
 * Brunch's named constants: the tool, mode, signal, header, route, state-key
 * and environment-variable names that packages, apps and the website share.
 *
 * This module imports nothing, so the browser, plain Node and Flue builds can
 * all load it.
 */

/**
 * The product name.
 *
 * Settled as `brunch` (ADR-0001), which is a deliberate exception to the
 * spec's "nothing bakes 'brunch' into structure": the name-fog resolved in
 * favour of the working label rather than away from it. The rule that still
 * binds is the one about *function* — the prefix names who the tool belongs
 * to, never what it does, so `elicit_*` stays forbidden.
 *
 * Should the name ever move again, this constant is the only line that
 * changes; everything model-facing derives from it.
 */
export const brunchProductName = "brunch";

/**
 * Model-facing tool names. `activateSkill` and `readSkillResource` are Flue's
 * built-in skill tools; Flue exports no constants for their names.
 */
export const brunchTools = {
  activateSkill: "activate_skill",
  draftPetrinautExperiment: "draft_petrinaut_experiment",
  mutateWorkpiece: "mutate_workpiece",
  ping: "ping",
  queryWorkpiece: "query_workpiece",
  readPetrinautDocs: "read_petrinaut_docs",
  readSkillResource: "read_skill_resource",
  readWorkpiece: "read_workpiece",
} as const;

/** Conversation modes admitted as `initialData.mode`. */
export const brunchModes = {
  /** Minimal exact-Stock control running through Flue, without Brunch composition. */
  stockOverFlue: "canonical-petrinaut-tools",
  /** Product baseline: Brunch composition with Petrinaut's canonical catalogue. */
  integrated: "integrated-brunch-canonical",
} as const;

/** Flue signal names. */
export const brunchSignals = {
  /** Carries completed client-tool results back into the conversation. */
  clientToolResult: "client-tool-result",
} as const;

/** Request headers that carry conversation identity. */
export const brunchHeaders = {
  conversation: "x-brunch-conversation",
  principal: "x-brunch-principal",
} as const;

/** Server routes and route segments. */
export const brunchRoutes = {
  /** Browser-facing agent segment; conversation identity remains the agent's pinned `agentName`. */
  chatAgent: "chat",
  /** Cheap process-liveness probe; dependency readiness is established before listen. */
  health: "/health",
} as const;

/** Per-conversation persistent state keys. */
export const brunchStateKeys = {
  workpieceRevision: "brunch.workpiece.current.v1",
} as const;

/** Environment variable names read or written by Brunch source code. */
export const brunchEnv = {
  chatDbPath: "BRUNCH_CHAT_DB_PATH",
  chatModel: "BRUNCH_CHAT_MODEL",
  chatOrigin: "BRUNCH_CHAT_ORIGIN",
  chatPort: "BRUNCH_CHAT_PORT",
  chatThinking: "BRUNCH_CHAT_THINKING",
  corsAllowedOrigins: "BRUNCH_CORS_ALLOWED_ORIGINS",
  dbKind: "BRUNCH_DB_KIND",
  devDbPath: "BRUNCH_DEV_DB_PATH",
  modelStreamCancellationTimeoutMs:
    "BRUNCH_MODEL_STREAM_CANCELLATION_TIMEOUT_MS",
  modelStreamFirstEventTimeoutMs: "BRUNCH_MODEL_STREAM_FIRST_EVENT_TIMEOUT_MS",
  modelStreamIdleTimeoutMs: "BRUNCH_MODEL_STREAM_IDLE_TIMEOUT_MS",
  modelStreamReasoningStartTimeoutMs:
    "BRUNCH_MODEL_STREAM_REASONING_START_TIMEOUT_MS",
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
  smokeBaseUrl: "BRUNCH_SMOKE_BASE_URL",
  smokeConversationId: "BRUNCH_SMOKE_CONVERSATION_ID",
  smokeExpectedText: "BRUNCH_SMOKE_EXPECTED_TEXT",
  smokeMode: "BRUNCH_SMOKE_MODE",
  smokePrincipal: "BRUNCH_SMOKE_PRINCIPAL",
  smokePrompt: "BRUNCH_SMOKE_PROMPT",
  smokeRequestId: "BRUNCH_SMOKE_REQUEST_ID",
  stepAAccounting: "BRUNCH_STEP_A_ACCOUNTING",
  testKeepRecentTokens: "BRUNCH_TEST_KEEP_RECENT_TOKENS",
  /**
   * Website build variables, written by Node launchers. The website reads
   * them as literal `import.meta.env` accesses so that Vite can replace them.
   */
  viteChatEndpoint: "VITE_BRUNCH_CHAT_ENDPOINT",
  viteEvaluationMode: "VITE_BRUNCH_EVALUATION_MODE",
} as const;

/** A Flue tool result that delegates execution to the connected client. */
export const awaitingClient = "client" as const;

/** Info string of the fenced Runbook IR block in a workpiece. */
export const runbookIrFence = "runbook-ir";

/** Principal for the stock Flue UI at `/`. Not a second ownership rule. */
export const localUiPrincipal = "local";

/** Prefix of the conversation ID the Petrinaut website derives from a net ID. */
export const previewConversationIdPrefix = "petrinaut-preview:";
