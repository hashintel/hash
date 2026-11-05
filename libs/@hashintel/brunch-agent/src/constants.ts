/**
 * Brunch's named constants: the tool, signal, header, route and state-key
 * names that packages, apps and the website share. Environment variable names
 * live in the app that reads them.
 *
 * This module imports nothing but `@local/brunch-configs`, which imports
 * nothing, so the browser, plain Node and Flue builds can all load it.
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
  /**
   * HASH's process page saves the open net as a new version, once the person
   * approves it, through the editor's own Save.
   */
  appSaveNet: "app_save_net",
  draftPetrinautExperiment: "draft_petrinaut_experiment",
  /** HASH's process page reads entities from the graph as the signed-in user. */
  hashQueryEntities: "hash_query_entities",
  /** HASH's process page reads the entity types the signed-in user can see. */
  hashQueryEntityTypes: "hash_query_entity_types",
  /** HASH's process page lists the signed-in user's own and org webs. */
  hashQueryWebs: "hash_query_webs",
  ledgerCommit: "ledger_commit",
  /** The Petrinaut agent's Ledger map; the HASH agent's is `ledgerQuery`. */
  ledgerCompile: "ledger_compile",
  /** The HASH agent's Ledger map, the same tool as `ledgerCompile`. */
  ledgerQuery: "ledger_query",
  /** The HASH agent's basis query, the same tool as `queryBasis`. */
  ledgerQueryBasis: "ledger_query_basis",
  ping: "ping",
  /** The Petrinaut agent's basis query; the HASH agent's is `ledgerQueryBasis`. */
  queryBasis: "query_basis",
  readSkillResource: "read_skill_resource",
  task: "task",
} as const;

/**
 * Signal types the browser delivers. Each doubles as the signal's tag name,
 * which is all of it Flue's history carries back to the browser.
 */
export const brunchSignals = {
  ledgerComments: "brunch.ledger-comments",
} as const;

/**
 * Where a browser host stores its actor key. The value keeps its pre-rename
 * name: it addresses actor keys already stored in users' browsers, and a new
 * value would orphan their conversations.
 */
export const brunchActorKeyStorageKey = "brunch-principal-v1";

/**
 * The wire facts of reaching Brunch over HTTP, owned by `@local/brunch-configs`
 * so hash-api can share them without depending on this package.
 */
export {
  brunchExposedResponseHeaders,
  brunchHeaders,
  brunchRoutes,
  hashSessionCredential,
} from "@local/brunch-configs/wire";

/** Actor key for the stock Flue UI at `/`. Not a second ownership rule. */
export const localUiActorKey = "local";

/** Prefix of the conversation ID the Petrinaut website derives from a net ID. */
export const previewConversationIdPrefix = "petrinaut-preview:";
