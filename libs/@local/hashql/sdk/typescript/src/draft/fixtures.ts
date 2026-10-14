/**
 * Small trusted declarations for Draft query-construction tests.
 *
 * The vertex contains only the fields the tests project. These declarations exercise custom-prelude typing and syntax construction, not the graph service's complete entity or temporal schema.
 *
 * @module
 */
import { Result, pipe } from "effect";

import { Module, Prelude } from "../main.js";
import * as Scope from "../program/Scope.js";
import * as Draft from "./index.js";

import type { Expression, Inputs, Type, TypeExpression } from "../main.js";

export type Vertex = Type.Struct<{
  readonly metadata: Type.Struct<{
    readonly record_id: Type.Struct<{
      readonly entity_id: Type.Struct<{
        readonly entity_uuid: Prelude.EntityUuid;
      }>;
    }>;
  }>;
}>;
type Graph = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Vertex }>
>;
type Entities = Type.Function<readonly [Type.PrimitiveInteger], Graph>;
const declarations: {
  readonly types: {
    readonly Axis: Module.Declaration<
      TypeExpression.TypeExpression<Type.PrimitiveInteger>
    >;
  };
  readonly values: {
    readonly entities: Module.Declaration<
      Expression.Expression<Entities, Inputs.Empty>
    >;
  };
} = { types: { Axis: Module.type() }, values: { entities: Module.value() } };
const graph: Module.Module<typeof declarations> = pipe(
  Module.define("::test::graph", declarations),
  Result.getOrThrow,
);

export const scope: Scope.Merge<Prelude.Builtin, typeof graph> = Scope.merge(
  Prelude.builtin,
  graph,
);
export const axis: typeof graph.types.Axis = graph.types.Axis;
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the schema and callback construct a test program
export const program: Draft.Program<typeof scope> =
  Draft.withPrelude(scope).program;
