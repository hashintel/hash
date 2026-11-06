/**
 * Brunch's named constants: the tool, signal, header, route and state-key
 * names that packages, apps and the website share. Environment variable names
 * live in the app that reads them.
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
 * built-in skill tools and `task` its built-in task tool; Flue exports no
 * constants for their names.
 */
export const brunchTools = {
  activateSkill: "activate_skill",
  draftPetrinautExperiment: "draft_petrinaut_experiment",
  ledgerCommit: "ledger_commit",
  ledgerCompile: "ledger_compile",
  ping: "ping",
  queryBasis: "query_basis",
  /** HASH's process page reads entities from the graph as the signed-in user. */
  queryHashEntities: "query_hash_entities",
  /** HASH's process page reads the entity types the signed-in user can see. */
  queryHashEntityTypes: "query_hash_entity_types",
  /** HASH's process page lists the signed-in user's own and org webs. */
  queryHashWebs: "query_hash_webs",
  readSkillResource: "read_skill_resource",
  task: "task",
} as const;

/**
 * The reads of the HASH graph that HASH's process page runs in band as the
 * signed-in user. Each is browser-executed, reads the graph rather than the
 * net, and never changes the bound document.
 */
export const hashGraphReadToolNames: ReadonlySet<string> = new Set([
  brunchTools.queryHashEntities,
  brunchTools.queryHashEntityTypes,
  brunchTools.queryHashWebs,
]);

/**
 * Signal types the browser delivers. Each doubles as the signal's tag name,
 * which is all of it Flue's history carries back to the browser.
 */
export const brunchSignals = {
  ledgerComments: "brunch.ledger-comments",
} as const;

/**
 * Where a browser host stores its owner key. Keeps its pre-rename name: it
 * addresses owner keys already stored in users' browsers, and a new name would
 * orphan their conversations.
 */
export const brunchOwnerKeyStorageKey = "brunch-principal-v1";

/**
 * Request headers that carry conversation identity. The owner key's header
 * name predates its rename from "principal" and is a wire name: changing it
 * needs a coordinated deploy of every client and server.
 */
export const brunchHeaders = {
  conversation: "x-brunch-conversation",
  ownerKey: "x-brunch-principal",
} as const;

/** Server routes and route segments. */
export const brunchRoutes = {
  /** Where agents mount; each serves under `<agents>/<route>`. */
  agents: "/agents",
  /** The Petrinaut agent's route; conversation identity remains its pinned `agentName`. */
  petrinautAgent: "petrinaut",
  /** Under an agent instance: where the bound browser claims and settles the calls issued to it. */
  browserCalls: "browser-calls",
  /** Cheap process-liveness probe; dependency readiness is established before listen. */
  health: "/health",
} as const;

/** Owner key for the stock Flue UI at `/`. Not a second ownership rule. */
export const localUiOwnerKey = "local";

/** Prefix of the conversation ID the Petrinaut website derives from a net ID. */
export const previewConversationIdPrefix = "petrinaut-preview:";
