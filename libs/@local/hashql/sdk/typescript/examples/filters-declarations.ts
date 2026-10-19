/**
 * Minimal graph declarations for the Draft filter examples.
 *
 * These declarations cover only the entity fields and standard-library exports used by the examples. Generated bindings can supply these declarations without changing the query bodies.
 *
 * @module
 */
import { Result } from "effect";

import { Module } from "../src/main.js";

import type { Expression, Inputs, Type, TypeExpression } from "../src/main.js";

type Uuid = Type.Opaque<"::core::uuid::Uuid", Type.PrimitiveString>;
type ActorGroupEntityUuid = Type.Opaque<
  "::graph::types::principal::actor_group::ActorGroupEntityUuid",
  Uuid
>;
export type WebId = Type.Opaque<
  "::graph::types::principal::actor_group::web::WebId",
  ActorGroupEntityUuid
>;
type EntityType<Name extends string, Value extends Type.Any> = Type.Opaque<
  `::graph::types::knowledge::entity::${Name}`,
  Value
>;
export type EntityUuid = EntityType<"EntityUuid", Uuid>;
type DraftId = EntityType<"DraftId", Uuid>;
type None = Type.Opaque<"::core::option::None", Type.PrimitiveNull>;
type Draft = Type.Union<
  readonly [None, Type.Opaque<"::core::option::Some", DraftId>]
>;
type EntityId = EntityType<
  "EntityId",
  Type.Struct<{
    readonly web_id: WebId;
    readonly entity_uuid: EntityUuid;
    readonly draft_id: Draft;
  }>
>;
export type Entity = EntityType<
  "Entity",
  Type.Struct<{
    readonly metadata: EntityType<
      "EntityMetadata",
      Type.Struct<{
        readonly record_id: EntityType<
          "RecordId",
          Type.Struct<{ readonly entity_id: EntityId }>
        >;
        readonly archived: Type.PrimitiveBoolean;
      }>
    >;
  }>
>;
type EntityGraph = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Entity }>
>;
export type TemporalAxes = Type.Union<
  readonly [
    Type.Opaque<
      "::graph::temporal::PinnedTransactionTimeTemporalAxes",
      Type.Unknown
    >,
    Type.Opaque<
      "::graph::temporal::PinnedDecisionTimeTemporalAxes",
      Type.Unknown
    >,
  ]
>;
type CreateUuid = Type.Function<readonly [Type.PrimitiveString], Uuid>;
type CreateEntityUuid = Type.Function<readonly [Uuid], EntityUuid>;
type Entities = Type.Function<readonly [TemporalAxes], EntityGraph>;
type Now = Type.Function<readonly [], TemporalAxes>;
type Value<T extends Type.Any> = Expression.Expression<T, Inputs.Empty>;

export const uuid: Module.Module<{
  readonly values: { readonly Uuid: Value<CreateUuid> };
}> = Result.getOrThrow(
  Module.define("::core::uuid", {
    values: {
      Uuid: Module.value<CreateUuid>(),
    },
  }),
);
export const entity: Module.Module<{
  readonly types: {
    readonly EntityUuid: TypeExpression.TypeExpression<EntityUuid>;
  };
  readonly values: { readonly EntityUuid: Value<CreateEntityUuid> };
}> = Result.getOrThrow(
  Module.define("::graph::types::knowledge::entity", {
    types: { EntityUuid: Module.type<EntityUuid>() },
    values: {
      EntityUuid: Module.value<CreateEntityUuid>(),
    },
  }),
);
export const web: Module.Module<{
  readonly types: { readonly WebId: TypeExpression.TypeExpression<WebId> };
}> = Result.getOrThrow(
  Module.define("::graph::types::principal::actor_group::web", {
    types: { WebId: Module.type<WebId>() },
  }),
);
export const temporal: Module.Module<{
  readonly types: {
    readonly QueryTemporalAxes: TypeExpression.TypeExpression<TemporalAxes>;
  };
}> = Result.getOrThrow(
  Module.define("::graph::temporal", {
    types: { QueryTemporalAxes: Module.type<TemporalAxes>() },
  }),
);
export const kernel: Module.Module<{
  readonly types: {
    readonly Boolean: TypeExpression.TypeExpression<Type.PrimitiveBoolean>;
  };
}> = Result.getOrThrow(
  Module.define("::kernel::type", {
    types: { Boolean: Module.type<Type.PrimitiveBoolean>() },
  }),
);
export const head: Module.Module<{
  readonly values: { readonly entities: Value<Entities> };
}> = Result.getOrThrow(
  Module.define("::graph::head", {
    values: {
      entities: Module.value<Entities>(),
    },
  }),
);
export const temporary: Module.Module<{
  readonly values: { readonly decision_time_now: Value<Now> };
}> = Result.getOrThrow(
  Module.define("::graph::tmp", {
    values: {
      decision_time_now: Module.value<Now>(),
    },
  }),
);
