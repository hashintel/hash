/**
 * A typed token names a service one plugin provides and another requires.
 *
 * The token is the identity, the type and the contract in one object that both
 * plugins import. The type parameter is phantom: at runtime only `id` exists,
 * and the plugin runtime matches a `requires` entry to a `provides` entry by
 * it. Compile time checks the provided value against `T`, and types the
 * dependent's `api.deps` entry as `T`.
 */
export interface PluginToken<T> {
  readonly id: string;
  /** Whether a missing provider fails the install (`true`) or yields `undefined`. */
  readonly required: boolean;
  /** The same token, resolving to `undefined` when nothing provides it. */
  optional(): PluginToken<T | undefined>;
  /** Phantom: carries `T` through inference. Never set. */
  readonly _value?: T;
}

export const definePluginToken = <T>(id: string): PluginToken<T> => {
  const make = <U>(required: boolean): PluginToken<U> => ({
    id,
    required,
    optional: () => make<U | undefined>(false),
  });

  return make<T>(true);
};

/** The value type a token resolves to in `api.deps`. */
export type PluginTokenValue<Token> =
  Token extends PluginToken<infer T> ? T : never;
