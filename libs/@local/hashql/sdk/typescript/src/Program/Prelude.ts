/**
 * A small default set of declarations for expression construction.
 *
 * Export types derive from the bound declarations, without a second list of semantic annotations. Generated declarations can supply the same module, type and value tables. This default includes primitive types, List, Dict, UUID identities, equality and addition. It is not a complete standard-library binding.
 *
 * This module also re-exports the semantic types of the declarations, such as {@link Semantic.Uuid | Prelude.Uuid} and the {@link Semantic.Arithmetic | Prelude.Arithmetic} signature.
 *
 * @module
 */
import { Result } from "effect";

import * as Module from "./Module.js";
import * as Scope from "./Scope.js";
import * as Structural from "./Structural.js";

import type * as Type from "../Type.js";
import type * as Expression from "./Expression.js";
import type * as Inputs from "./Inputs.js";
import type * as Semantic from "./PreludeTypes.js";
import type * as TypeExpression from "./TypeExpression.js";

export type * from "./PreludeTypes.js";

type TypeDeclaration<T extends Type.Any> = Module.Declaration<
  TypeExpression.TypeExpression<T>
>;
type ValueDeclaration<T extends Type.Any> = Module.Declaration<
  Expression.Expression<T, Inputs.Empty>
>;

// Descriptor annotations supply trusted semantic types that names and paths cannot infer.
const primitiveDeclarations: {
  readonly types: {
    readonly Integer: TypeDeclaration<Type.PrimitiveInteger>;
    readonly Number: TypeDeclaration<Type.PrimitiveNumber>;
    readonly String: TypeDeclaration<Type.PrimitiveString>;
    readonly Boolean: TypeDeclaration<Type.PrimitiveBoolean>;
    readonly Null: TypeDeclaration<Type.PrimitiveNull>;
    readonly Unknown: TypeDeclaration<Type.Unknown>;
    readonly Never: TypeDeclaration<Type.Never>;
    readonly List: Module.Declaration<
      TypeExpression.Constructor<Semantic.List>
    >;
    readonly Dict: Module.Declaration<
      TypeExpression.Constructor<Semantic.Dict>
    >;
  };
} = {
  types: {
    Integer: Module.type(),
    Number: Module.type(),
    String: Module.type(),
    Boolean: Module.type(),
    Null: Module.type(),
    Unknown: Module.type(),
    Never: Module.type(),
    List: Module.genericType(1),
    Dict: Module.genericType(2),
  },
};
const uuidDeclarations: {
  readonly types: { readonly Uuid: TypeDeclaration<Semantic.Uuid> };
  readonly values: {
    readonly Uuid: ValueDeclaration<
      Type.Function<readonly [Type.PrimitiveString], Semantic.Uuid>
    >;
  };
} = { types: { Uuid: Module.type() }, values: { Uuid: Module.value() } };
const entityDeclarations: {
  readonly types: { readonly EntityUuid: TypeDeclaration<Semantic.EntityUuid> };
  readonly values: {
    readonly EntityUuid: ValueDeclaration<
      Type.Function<readonly [Semantic.Uuid], Semantic.EntityUuid>
    >;
  };
} = {
  types: { EntityUuid: Module.type() },
  values: { EntityUuid: Module.value() },
};
const comparisonDeclarations: {
  readonly values: {
    readonly eq: ValueDeclaration<Type.GenericFunction<Semantic.Comparison>>;
  };
} = { values: { eq: Module.value() } };
const arithmeticDeclarations: {
  readonly values: {
    readonly add: ValueDeclaration<Type.GenericFunction<Semantic.Arithmetic>>;
  };
} = { values: { add: Module.value() } };

const primitives: Module.Module<typeof primitiveDeclarations> =
  Result.getOrThrow(Module.define("::kernel::type", primitiveDeclarations));
const uuid: Module.Module<typeof uuidDeclarations> = Result.getOrThrow(
  Module.define("::core::uuid", uuidDeclarations),
);
const entity: Module.Module<typeof entityDeclarations> = Result.getOrThrow(
  Module.define("::graph::types::knowledge::entity", entityDeclarations),
);
const cmp: Module.Module<typeof comparisonDeclarations> = Result.getOrThrow(
  Module.define("::core::cmp", comparisonDeclarations),
);
const math: Module.Module<typeof arithmeticDeclarations> = Result.getOrThrow(
  Module.define("::core::math", arithmeticDeclarations),
);

/**
 * The scope type of {@link builtin}.
 *
 * It derives the export types from the declaration tables without repeating their semantic annotations.
 */
export interface Builtin extends Scope.Scope<{
  readonly modules: {
    readonly entity: typeof entity;
    readonly uuid: typeof uuid;
    readonly cmp: typeof cmp;
    readonly math: typeof math;
  };
  readonly types: Omit<typeof primitives.types, "List" | "Dict"> & {
    readonly List: Structural.Constructor<Semantic.List>;
    readonly Dict: Structural.Constructor<Semantic.Dict>;
  } & typeof uuid.types &
    typeof entity.types;
  readonly values: typeof uuid.values &
    typeof entity.values &
    typeof cmp.values &
    typeof math.values;
}> {}

/**
 * The built-in declarations as module, type and value tables.
 *
 * - `types` holds `Integer`, `Number`, `String`, `Boolean`, `Null`, `Unknown`, `Never` and the generic `List` and `Dict`, all under `::kernel::type`. It also holds `Uuid` at `::core::uuid::Uuid` and `EntityUuid` at `::graph::types::knowledge::entity::EntityUuid`.
 * - `values` holds the constructors `Uuid` and `EntityUuid` at the same paths as their types, `eq` at `::core::cmp::eq` and `add` at `::core::math::add`.
 * - `modules` holds `uuid` at `::core::uuid`, `entity` at `::graph::types::knowledge::entity`, `cmp` at `::core::cmp` and `math` at `::core::math`. The `::kernel::type` module that declares the primitive types is not among them.
 *
 * `List` and `Dict` accept structural shorthand as well as type expressions, so `List(String)` and `List(Prelude.builtin.types.String)` emit the same type. `eq` accepts operands of any two types, which need not match. `add` accepts Integer and Number operands, as {@link Semantic.Arithmetic | Prelude.Arithmetic} describes. The SDK takes these signatures on trust, and the HashQL compiler checks the emitted calls.
 *
 * {@link @local/hashql!Program.Namespace.flatten | Namespace.flatten} joins the three tables of `builtin` into one object. In it, `Uuid` is both the type and its constructor. The module `cmp` exposes `eq` directly.
 *
 * @example <caption>Use built-in types and functions outside a program callback.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { Expression, Prelude } = Program;
 * const { types, values } = Prelude.builtin;
 * const compile = (value: Program.Expression.Value.Any): string =>
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(value)));
 *
 * assert.equal(
 *   compile(Expression.input("names", types.List(String))),
 *   '["::kernel::special_form::input","names","::kernel::type::List<::kernel::type::String>"]',
 * );
 * assert.equal(
 *   compile(values.add(Expression.input("offset", types.Integer), 1n)),
 *   '["::core::math::add",["::kernel::special_form::input","offset","::kernel::type::Integer"],{"#literal":1}]',
 * );
 * ```
 *
 * @example <caption>Use one flattened name as a type and as a value constructor.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { Expression, Namespace, Prelude } = Program;
 * const nil = "00000000-0000-0000-0000-000000000000";
 * const { Uuid, cmp } = Namespace.flatten(Prelude.builtin);
 * const result = cmp.eq(Expression.input("id", Uuid), Uuid(nil));
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(result))),
 *   `["::core::cmp::eq",["::kernel::special_form::input","id","::core::uuid::Uuid"],["::core::uuid::Uuid",{"#literal":"${nil}"}]]`,
 * );
 * ```
 */
export const builtin: Builtin = Scope.merge(Scope.empty, {
  modules: { entity, uuid, cmp, math },
  types: {
    ...primitives.types,
    List: Structural.constructor(primitives.types.List),
    Dict: Structural.constructor(primitives.types.Dict),
    ...uuid.types,
    ...entity.types,
  },
  values: { ...uuid.values, ...entity.values, ...cmp.values, ...math.values },
});
