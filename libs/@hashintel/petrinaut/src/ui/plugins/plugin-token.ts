/**
 * A typed id for a service one plugin provides and others require.
 * List it under a manifest's `provides` or `requires`; `T` types both sides.
 *
 * @typeParam T - The service's type: the provider's value and the dependent's `api.deps` entry.
 */
export interface PluginToken<T> {
  /** Unique, namespaced id that Petrinaut matches `provides` and `requires` entries by. */
  readonly id: string;
  /**
   * Whether a dependent needs a provider to run; `false` on a token from
   * `optional()`. The editor throws when no plugin passed to it provides a
   * required token, and switches a dependent off while its provider is off.
   */
  readonly required: boolean;
  /**
   * This token as an optional requirement: when its provider is missing or
   * switched off, the dependent still runs and reads `undefined`.
   */
  optional(): PluginToken<T | undefined>;
  /** Type-only: carries `T` for inference. Never set at runtime. */
  readonly _value?: T;
}

/**
 * Creates a token for a service one plugin provides and others require.
 * Both plugins import the same token; Petrinaut connects them by its `id`.
 *
 * @typeParam T - The service's type, checked on the provider's value and given to dependents.
 * @param id - Unique, namespaced id, e.g. `website.brunch.conversation`.
 * @example
 * ```ts
 * const Conversation = definePluginToken<{ active: boolean }>(
 *   "website.brunch.conversation",
 * );
 * // brunchManifest declares `provides: { conversation: Conversation }`,
 * // and useBrunchPlugin returns `provides: { conversation: { active: true } }`.
 * // A dependent declares `requires: { brunch: Conversation.optional() }`
 * // and reads `api.deps.brunch?.active`.
 * ```
 */
export const definePluginToken = <T>(id: string): PluginToken<T> => {
  const make = <U>(required: boolean): PluginToken<U> => ({
    id,
    required,
    optional: () => make<U | undefined>(false),
  });

  return make<T>(true);
};

/**
 * The service type a token carries, as `provides` and `api.deps` see it.
 *
 * @typeParam Token - A token type, e.g. `typeof Conversation`.
 */
export type PluginTokenValue<Token> =
  Token extends PluginToken<infer T> ? T : never;
