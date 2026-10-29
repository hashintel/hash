/**
 * Record key constraints shared by export tables and input schemas, and the constructor of an export table.
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

/**
 * Creates an empty export table without a prototype.
 *
 * A name the table lacks reads as `undefined`, as the type of an optional entry says, and a name such as `toString` or `__proto__` is an ordinary entry.
 */
export const emptyTable = <E>(): Partial<E> =>
  // SAFETY: an object without a prototype has no properties, which every `Partial<E>` allows.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.create returns any
  Object.create(null) as Partial<E>;
