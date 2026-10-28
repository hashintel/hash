/**
 * Type-level module checks for named exports, generic aliases and optional namespaces.
 *
 * @module
 */
import { Result, pipe } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Module from "./Module.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";
import type * as TypeExpression from "./TypeExpression.js";

type Vertex = Type.Struct<{ readonly name: Type.PrimitiveString }>;
type OtherVertex = Type.Struct<{ readonly age: Type.PrimitiveInteger }>;
type Graph<T extends Type.Any> = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": T }>
>;
type VertexOf<T> = T extends Graph<infer V> ? V : never;

interface Filter extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [infer T, Type.Any]
    ? Type.Function<
        readonly [
          Graph<VertexOf<T>>,
          Type.Function<readonly [VertexOf<T>], Type.PrimitiveBoolean>,
        ],
        Graph<VertexOf<T>>
      >
    : Type.Function<readonly [never, never], Type.Never>;
}

interface List extends Type.TypeConstructor {
  readonly arity: 1;
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.List<T>
    : Type.Never;
}

interface Equal extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [
    infer L extends Type.Any,
    infer R extends Type.Any,
  ]
    ? Type.Function<readonly [L, R], Type.PrimitiveBoolean>
    : Type.Function<readonly [never, never], Type.Never>;
}

type Uuid = Type.Opaque<"::core::uuid::Uuid", Type.PrimitiveString>;
type Remainder = Type.Function<
  readonly [Type.PrimitiveInteger, Type.PrimitiveInteger],
  Type.PrimitiveInteger
>;

const kernelTypes = Result.getOrThrow(
  Module.define("::kernel::type", {
    types: {
      Integer: Module.type<Type.PrimitiveInteger>(),
      String: Module.type<Type.PrimitiveString>(),
      List: Module.genericType<List>(1),
    },
  }),
);
const math = Result.getOrThrow(
  Module.define("::core::math", {
    values: { rem: Module.value<Remainder>() },
  }),
);
const cmp = Result.getOrThrow(
  Module.define("::core::cmp", {
    values: { eq: Module.value<Type.GenericFunction<Equal>>() },
  }),
);
const uuid = Result.getOrThrow(
  Module.define("::core::uuid", {
    types: { Uuid: Module.type<Uuid>() },
    values: {
      Uuid: Module.value<
        Type.Function<readonly [Type.PrimitiveString], Uuid>
      >(),
    },
  }),
);
const body = Result.getOrThrow(
  Module.define("::graph::body", {
    values: { filter: Module.value<Type.GenericFunction<Filter>>() },
  }),
);
const modules = Result.getOrThrow(
  Module.root({
    kernel: Result.getOrThrow(
      Module.define("::kernel", { modules: { type: kernelTypes } }),
    ),
    core: Result.getOrThrow(
      Module.define("::core", { modules: { math, cmp, uuid } }),
    ),
    graph: Result.getOrThrow(Module.define("::graph", { modules: { body } })),
  }),
);
const prelude = {
  rem: modules.modules.core.modules.math.values.rem,
  eq: modules.modules.core.modules.cmp.values.eq,
  filter: modules.modules.graph.modules.body.values.filter,
  Integer: modules.modules.kernel.modules.type.types.Integer,
  List: modules.modules.kernel.modules.type.types.List,
};
const aliases = Result.getOrThrow(
  Module.define("::application", {
    values: { select: prelude.filter },
    types: { Sequence: prelude.List },
  }),
);

declare const integer: Expression.Expression<
  Type.PrimitiveInteger,
  Inputs.Empty
>;
declare const string: Expression.Expression<Type.PrimitiveString, Inputs.Empty>;
declare const vertices: Expression.Expression<Graph<Vertex>, Inputs.Empty>;
declare const predicate: Expression.Expression<
  Type.Function<readonly [Vertex], Type.PrimitiveBoolean>,
  Inputs.Empty
>;
declare const otherPredicate: Expression.Expression<
  Type.Function<readonly [OtherVertex], Type.PrimitiveBoolean>,
  Inputs.Empty
>;
declare const wrongResult: Expression.Expression<
  Type.Function<readonly [Vertex], Type.PrimitiveInteger>,
  Inputs.Empty
>;

describe("module_types", () => {
  test("module_call_types", () => {
    expectTypeOf(prelude.rem(integer, integer)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    expectTypeOf(prelude.eq(integer, string)).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty>
    >();
    expectTypeOf(uuid.values.Uuid(string)).toEqualTypeOf<
      Expression.Expression<Uuid, Inputs.Empty>
    >();
    expectTypeOf(uuid.types.Uuid).toEqualTypeOf<
      TypeExpression.TypeExpression<Uuid>
    >();
    // @ts-expect-error Remainder requires integers.
    prelude.rem(integer, string);
    // @ts-expect-error Remainder takes two operands.
    prelude.rem(integer);
    // @ts-expect-error Values and types occupy distinct namespaces.
    uuid.types.Uuid(string);
    // @ts-expect-error A newtype remains distinct from its representation.
    prelude.rem(uuid.values.Uuid(string), integer);
  });

  test("generic_alias", () => {
    expectTypeOf(body.values.filter(vertices, predicate)).toEqualTypeOf<
      Expression.Expression<Graph<Vertex>, Inputs.Empty>
    >();
    expectTypeOf(prelude.filter(vertices, predicate)).toEqualTypeOf<
      Expression.Expression<Graph<Vertex>, Inputs.Empty>
    >();
    expectTypeOf(aliases.values.select(vertices, predicate)).toEqualTypeOf<
      Expression.Expression<Graph<Vertex>, Inputs.Empty>
    >();
    // @ts-expect-error The predicate's vertex must match the graph's vertex.
    prelude.filter(vertices, otherPredicate);
    // @ts-expect-error A predicate returns Boolean.
    prelude.filter(vertices, wrongResult);
    // @ts-expect-error The source must be a graph.
    prelude.filter(integer, predicate);
    // @ts-expect-error Filter requires a predicate.
    prelude.filter(vertices);
    // @ts-expect-error Filter takes two operands.
    prelude.filter(vertices, predicate, integer);
  });

  test("generic_type", () => {
    expectTypeOf(prelude.List(prelude.Integer)).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.List<Type.PrimitiveInteger>>
    >();
    expectTypeOf(
      aliases.types.Sequence(kernelTypes.types.String),
    ).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
    >();
    expectTypeOf(prelude.List(prelude.List(prelude.Integer))).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.List<Type.List<Type.PrimitiveInteger>>>
    >();
    // @ts-expect-error List requires an element type.
    prelude.List();
    // @ts-expect-error List has exactly one type parameter.
    prelude.List(prelude.Integer, prelude.Integer);
    // @ts-expect-error A value expression is not a type expression.
    prelude.List(integer);
    // @ts-expect-error The constructor's arity comes from its declaration.
    Module.genericType<List>(2);
  });

  test("optional_namespaces", () => {
    const definition: {
      readonly types?: {
        readonly Integer: Module.Declaration<
          TypeExpression.TypeExpression<Type.PrimitiveInteger>
        >;
      };
    } = {};
    const optional = Result.getOrThrow(Module.define("::optional", definition));
    expectTypeOf(optional.types.Integer).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.PrimitiveInteger> | undefined
    >();
    // @ts-expect-error The entry is optional even though the namespace table always exists.
    expectTypeOf(optional.types.Integer.syntax);
  });

  test("optional_declarations", () => {
    const types: {
      readonly Integer?: Module.Declaration<
        TypeExpression.TypeExpression<Type.PrimitiveInteger>
      >;
    } = {};
    const optional = Result.getOrThrow(Module.define("::optional", { types }));
    expectTypeOf(optional.types.Integer).toEqualTypeOf<
      TypeExpression.TypeExpression<Type.PrimitiveInteger> | undefined
    >();
  });

  test("relocated_members", () => {
    const local = Result.getOrThrow(JExpr.Path.decodeResult("local"));
    const relocated = Result.getOrThrow(
      Module.relocate(modules.modules.core, local),
    );
    const piped = Result.getOrThrow(
      pipe(modules.modules.core, Module.relocate(local)),
    );
    expectTypeOf(piped).toEqualTypeOf<typeof relocated>();
    expectTypeOf(relocated.modules.math.values.rem).toEqualTypeOf<
      typeof prelude.rem
    >();
    expectTypeOf(relocated.modules.uuid.types.Uuid).toEqualTypeOf<
      TypeExpression.TypeExpression<Uuid>
    >();
    expectTypeOf(relocated.modules.uuid.values.Uuid(string)).toEqualTypeOf<
      Expression.Expression<Uuid, Inputs.Empty>
    >();
    // @ts-expect-error The relocated function retains its semantic parameter types.
    relocated.modules.math.values.rem(string, integer);
    // @ts-expect-error Relocation does not introduce undeclared names.
    expectTypeOf(relocated.modules.missing);

    const input = Expression.input("count", prelude.Integer);
    const source = Result.getOrThrow(
      Module.define("::inputs", { values: { count: input } }),
    );
    const moved = Result.getOrThrow(Module.relocate(source, local));
    expectTypeOf(moved.values.count).toEqualTypeOf<typeof input>();
    // @ts-expect-error An imported reference still carries its source input requirement.
    const closed: Expression.Expression<Type.PrimitiveInteger, Inputs.Empty> =
      moved.values.count;
    expectTypeOf(closed).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
  });

  test("unpreserved_extension", () => {
    const extended = Object.assign(prelude.Integer, { annotation: "extra" });
    // @ts-expect-error The type's rebinding operation does not promise to retain caller-added properties.
    expectTypeOf(Module.define("::extended", { types: { Integer: extended } }));
  });

  test("tree_members", () => {
    expectTypeOf(modules.modules.core.modules.math.values.rem).toEqualTypeOf<
      typeof prelude.rem
    >();
    // @ts-expect-error Missing modules do not become arbitrary string lookups.
    expectTypeOf(modules.modules.missing);
    // @ts-expect-error Empty namespaces retain their exact keys.
    expectTypeOf(math.types.Integer);
    // @ts-expect-error A module record is readonly.
    modules.modules.core = modules.modules.kernel;
    // @ts-expect-error A value export is readonly.
    math.values.rem = prelude.eq;
    // @ts-expect-error A value declaration cannot enter the type namespace.
    Module.define("::bad", { types: { value: Module.value<Remainder>() } });
    Result.getOrThrow(
      Module.define("::bad", {
        // @ts-expect-error A type declaration cannot enter the value namespace.
        values: { Integer: Module.type<Type.PrimitiveInteger>() },
      }),
    );
  });

  test("symbol_export", () => {
    const name = Symbol("not a HashQL name");
    expectTypeOf(
      Module.define("::exports", {
        // @ts-expect-error A symbol key cannot name a type export.
        types: { [name]: Module.type<Type.PrimitiveInteger>() },
      }),
    );
    expectTypeOf(
      Module.define("::exports", {
        // @ts-expect-error A symbol key cannot name a value export.
        values: { [name]: Module.value<Remainder>() },
      }),
    );
    expectTypeOf(
      // @ts-expect-error A symbol key cannot name a child module.
      Module.define("::exports", { modules: { [name]: math } }),
    );
    // @ts-expect-error A symbol key cannot name a root module.
    expectTypeOf(Module.root({ [name]: math }));
  });
});
