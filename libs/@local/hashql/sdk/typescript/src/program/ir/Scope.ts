import type * as Expression from "../Expression.js";
import type * as Module from "../Module.js";
import type * as TypeExpression from "../TypeExpression.js";
import type { ReadonlyRecord } from "effect/Record";

/** An inspectable namespace without fixing its concrete key set. */
interface Universe<Value> extends ReadonlyRecord<string, Value> {}

export interface Scope {
  readonly modules: Universe<Module.Any>;
  readonly values: Universe<Expression.Any>;
  readonly types: Universe<TypeExpression.Export>;
}

export interface Definition {
  readonly modules?: Scope["modules"];
  readonly values?: Scope["values"];
  readonly types?: Scope["types"];
}

// oxlint-disable-next-line typescript/no-generated-empty-object-type -- an empty universe has no names
type EmptyNames = Record<never, never>;

type Names<D extends Definition, Key extends keyof Scope> =
  D extends ReadonlyRecord<Key, infer Exports extends Scope[Key]>
    ? Exports
    : EmptyNames;

export interface From<D extends Definition> {
  readonly modules: Names<D, "modules">;
  readonly values: Names<D, "values">;
  readonly types: Names<D, "types">;
}

export type Empty = From<EmptyNames>;

export type Extend<Before, Added> = Readonly<Omit<Before, keyof Added> & Added>;

export interface Merge<Before extends Scope, Added extends Definition> {
  readonly modules: Extend<Before["modules"], Names<Added, "modules">>;
  readonly values: Extend<Before["values"], Names<Added, "values">>;
  readonly types: Extend<Before["types"], Names<Added, "types">>;
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- combines separate namespaces rather than transforming the first argument
export const merge = <Before extends Scope, const Added extends Definition>(
  before: Before,
  added: Added,
): Merge<Before, Added> => {
  const combined = Object.freeze({
    modules: Object.freeze({ ...before.modules, ...added.modules }),
    values: Object.freeze({ ...before.values, ...added.values }),
    types: Object.freeze({ ...before.types, ...added.types }),
  });

  // SAFETY: each spread copies one namespace, with later names replacing earlier ones.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- object spread erases the per-key override mapping
  return combined as Merge<Before, Added>;
};

export const empty: Empty = Object.freeze({
  modules: Object.freeze({}),
  values: Object.freeze({}),
  types: Object.freeze({}),
});
