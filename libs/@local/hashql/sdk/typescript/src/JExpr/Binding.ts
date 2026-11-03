import { isReadonlyArray } from "../internal/array.js";
import * as Type from "./Type/index.js";

import type { Expression } from "./index.js";
import type * as Defs from "./schema.js";
import type * as Reference from "./Type/Reference.js";
import type { Record } from "effect";

/**
 * Binds `value` to `name` within `body`.
 *
 * The builder emits `name` as given, and the HashQL compiler checks that it is an identifier. To annotate the binding, pass `{ name, type }` with the type in constructor syntax, as {@link as} takes it. That emits `let name: type = value in body`, and the HashQL compiler checks that the value is compatible with the annotation.
 *
 * @category Bindings
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
const binding = (
  name: string | { readonly name: string; readonly type: Type.Type },
  value: Expression,
  body: Expression,
): Defs.CallType => {
  if (typeof name === "string") {
    return ["::kernel::special_form::let", name, value, body];
  }

  return [
    "::kernel::special_form::let",
    name.name,
    Type.toExpression(name.type),
    value,
    body,
  ];
};

export { binding as let };

/**
 * Items to import into the body of {@link use}.
 *
 * Use `"*"` for all items or an array for named imports. For aliases, supply a record from original name to local name: `{ entities: "allEntities" }` imports `entities` as `allEntities`. The alias `"_"` keeps the original name. An array becomes a `#tuple` of names and a record becomes a `#struct`, whose keys {@link make} checks as identifiers.
 *
 * @category Bindings
 * @since 0.1.0
 */
export type Imports =
  | "*"
  | readonly string[]
  | Record.ReadonlyRecord<string, string>;

const compileImports = (imports: Imports): Expression => {
  if (imports === "*") {
    return imports;
  }

  if (isReadonlyArray(imports)) {
    return { "#tuple": imports };
  }

  return { "#struct": imports };
};

/**
 * Imports items from the module at `path` into `body`.
 *
 * `path` is path text, such as `::core::math`, which the HashQL compiler resolves. {@link Imports} describes wildcard imports, named imports and aliases.
 *
 * @category Bindings
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
export const use = (
  path: string,
  imports: Imports,
  body: Expression,
): Defs.CallType => [
  "::kernel::special_form::use",
  path,
  compileImports(imports),
  body,
];

const compileName = (name: string | Reference.Reference): string => {
  if (typeof name === "string") {
    return name;
  }

  return Type.compile(name);
};

/**
 * Introduces a type alias in `body`.
 *
 * The alias denotes the same type as `type`. Use {@link newtype} for a distinct nominal type with a constructor. `name` is text emitted as given, such as `"Pair<T>"`, or reference type syntax, which compiles to the same form. Its generic list declares the alias's parameters, such as `T` or `T: Integer`.
 *
 * @category Bindings
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
const typeAlias = (
  name: string | Reference.Reference,
  type: Type.Type,
  body: Expression,
): Defs.CallType => [
  "::kernel::special_form::type",
  compileName(name),
  Type.toExpression(type),
  body,
];

export { typeAlias as type };

/**
 * Introduces a distinct type and its constructor in `body`.
 *
 * The constructor has the same name as the type. `name` accepts generic parameters as described by {@link typeAlias | type}.
 *
 * @category Bindings
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
export const newtype = (
  name: string | Reference.Reference,
  type: Type.Type,
  body: Expression,
): Defs.CallType => [
  "::kernel::special_form::newtype",
  compileName(name),
  Type.toExpression(type),
  body,
];
