/**
 * Record key constraints shared by export tables and input schemas.
 *
 * @internal
 */

/**
 * Maps a symbol key's entry to `never`, so a symbol-keyed entry is a type error.
 *
 * A HashQL name is a string. Runtime copies read string keys alone, so without this mapping a symbol-keyed entry would type-check and then be missing.
 */
export type StringKeyed<E> = {
  readonly [K in keyof E]: K extends symbol ? never : E[K];
};
