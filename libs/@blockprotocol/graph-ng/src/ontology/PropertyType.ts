import { AST } from "@effect/schema";
import * as S from "@effect/schema/Schema";
import {
  Effect,
  Either,
  Equal,
  Hash,
  Inspectable,
  Option,
  pipe,
  Pipeable,
  Predicate,
} from "effect";
import { globalValue } from "effect/GlobalValue";

import { InternalError } from "./DataType/error.js";
import { encodeSchema } from "./PropertyType/encode.js";
import * as Json from "../Json.js";
import { DecodeError, EncodeError } from "./PropertyType/error.js";
import { PropertyTypeSchema } from "./PropertyType/schema.js";
import * as PropertyTypeUrl from "./PropertyTypeUrl.js";
import { decodeSchema } from "./PropertyType/decode.js";
import { OntologyStore } from "./OntologyStore.js";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyType",
);
export type TypeId = typeof TypeId;

const LazyTypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/LazyPropertyType",
);
export type LazyTypeId = typeof LazyTypeId;

/** @internal */
export const AnnotationId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyType/Annotation",
);

export interface PropertyType<
  Out,
  In = Out,
  Id extends PropertyTypeUrl.PropertyTypeUrl = PropertyTypeUrl.PropertyTypeUrl,
  R = never,
> extends Equal.Equal,
    Pipeable.Pipeable,
    Inspectable.Inspectable {
  readonly [TypeId]: TypeId;

  readonly id: Id;
  readonly schema: S.Schema<Out, In, R>;
}

export interface LazyPropertyType<
  Out,
  In = Out,
  Id extends PropertyTypeUrl.PropertyTypeUrl = PropertyTypeUrl.PropertyTypeUrl,
  R = never,
> {
  readonly [LazyTypeId]: LazyTypeId;
  readonly id: Id;
  readonly schema: S.Schema<Out, In, R>;
}

interface PropertyTypeImpl<
  Out,
  In = Out,
  Id extends PropertyTypeUrl.PropertyTypeUrl = PropertyTypeUrl.PropertyTypeUrl,
  R = never,
> extends PropertyType<Out, In, Id, R> {}

interface LazyPropertyTypeImpl<
  Out,
  In = Out,
  Id extends PropertyTypeUrl.PropertyTypeUrl = PropertyTypeUrl.PropertyTypeUrl,
  R = never,
> extends LazyPropertyType<Out, In, Id, R> {
  readonly impl: PropertyTypeImpl<Out, In, Id, R>;
}

const PropertyTypeProto: Omit<PropertyTypeImpl<unknown>, "id" | "schema"> = {
  [TypeId]: TypeId,

  toJSON(this: PropertyTypeImpl<unknown>): unknown {
    return {
      _id: "PropertyType",
      id: this.id,
      schema: this.schema.ast.toJSON(),
    };
  },
  toString(this: PropertyTypeImpl<unknown>): string {
    return Inspectable.format(this.toJSON());
  },
  [Inspectable.NodeInspectSymbol]() {
    return this.toJSON();
  },

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    Pipeable.pipeArguments(this, arguments);
  },

  [Hash.symbol](this: PropertyTypeImpl<unknown>) {
    return pipe(
      Hash.hash(TypeId),
      Hash.combine(Hash.hash(this.id)),
      Hash.cached(this),
    );
  },
  [Equal.symbol]<T>(this: PropertyType<T>, that: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    if (!isPropertyType(that)) {
      return false;
    }

    return this.id === that.id;
  },
};

const schemaStorage = globalValue(
  Symbol.for("@blockprotocol/graph/ontology/PropertyType/schemaStorage"),
  () => new WeakMap<PropertyType<unknown>, PropertyTypeSchema>(),
);

export function isPropertyType(value: unknown): value is PropertyType<unknown> {
  return Predicate.hasProperty(value, TypeId);
}

function makeImpl<
  Out,
  In,
  Id extends PropertyTypeUrl.PropertyTypeUrl,
  R = never,
>(id: Id, schema: S.Schema<Out, In, R>): PropertyType<Out, In, Id, R> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const impl = Object.create(PropertyTypeProto);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  impl.id = id;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  impl.schema = schema.annotations({
    [AnnotationId]: () => impl as PropertyType<unknown>,
  });

  return impl as PropertyType<Out, In, Id, R>;
}

function toSchemaImpl<Out, In, R = never>(
  impl: S.Schema<Out, In, R>,
): Effect.Effect<PropertyTypeSchema, EncodeError> {
  return encodeSchema(impl.ast);
}

export function make<
  Out,
  In,
  Id extends PropertyTypeUrl.PropertyTypeUrl,
  R = never,
>(
  id: Id,
  schema: S.Schema<Out, In, R>,
): Effect.Effect<PropertyType<Out, In, Id, R>, EncodeError> {
  const impl = makeImpl(id, schema);

  return pipe(
    toSchemaImpl(impl.schema),
    Effect.tap((schema) =>
      schemaStorage.set(impl as unknown as PropertyType<unknown>, schema),
    ),
    Effect.map(() => impl),
  );
}

export function makeLazy<
  Out,
  In,
  Id extends PropertyTypeUrl.PropertyTypeUrl,
  R = never,
>(id: Id, schema: S.Schema<Out, In, R>): LazyPropertyType<Out, In, Id, R> {
  const impl = makeImpl(id, schema);

  return {
    [LazyTypeId]: LazyTypeId,
    id: impl.id,
    schema: impl.schema,
    impl,
  } satisfies LazyPropertyTypeImpl<Out, In, Id, R> as LazyPropertyType<
    Out,
    In,
    Id,
    R
  >;
}

export function validateLazy<
  Out,
  In,
  Id extends PropertyTypeUrl.PropertyTypeUrl,
  R = never,
>(
  lazyPropertyType: LazyPropertyType<Out, In, Id, R>,
): Effect.Effect<PropertyType<Out, In, Id, R>, EncodeError> {
  const { impl } = lazyPropertyType as LazyPropertyTypeImpl<Out, In, Id, R>;

  return pipe(
    toSchemaImpl(impl.schema),
    Effect.map(() => impl),
  );
}

export function makeOrThrow<
  Out,
  In,
  Id extends PropertyTypeUrl.PropertyTypeUrl,
  R = never,
>(id: Id, schema: S.Schema<Out, In, R>): PropertyType<Out, In, Id, R> {
  return Effect.runSync(make(id, schema));
}

export function parse<Out, In, Id extends string, R = never>(
  id: Id,
  schema: S.Schema<Out, In, R>,
): Effect.Effect<
  PropertyType<
    Out,
    In,
    Either.Either.Right<ReturnType<typeof PropertyTypeUrl.parse<Id>>>,
    R
  >,
  EncodeError
> {
  return pipe(
    PropertyTypeUrl.parse(id),
    Effect.mapError((error) => EncodeError.invalidUrl(error)),
    Effect.andThen((url) => make(url, schema)),
  );
}

export function parseOrThrow<Out, In, Id extends string, R = never>(
  id: Id,
  schema: S.Schema<Out, In>,
): PropertyType<
  Out,
  In,
  Either.Either.Right<ReturnType<typeof PropertyTypeUrl.parse<Id>>>,
  R
> {
  return Effect.runSync(parse(id, schema));
}

export function toSchema<
  Out,
  In,
  Id extends PropertyTypeUrl.PropertyTypeUrl,
  R = never,
>(
  propertyType: PropertyType<Out, In, Id, R>,
): Effect.Effect<PropertyTypeSchema, EncodeError> {
  const unknownDataType = propertyType as unknown as PropertyType<unknown>;
  const cached = schemaStorage.get(unknownDataType);
  if (cached !== undefined) {
    return Effect.succeed(cached);
  }

  return toSchemaImpl(propertyType.schema);
}

export const fromSchema = <E, R>(
  schema: PropertyTypeSchema,
  store: OntologyStore<E, R>,
): Effect.Effect<PropertyType<unknown, Json.Value>, DecodeError, R> =>
  Effect.gen(function* (_) {
    const { schema: inner, hydrate } = yield* _(decodeSchema(schema, store));

    const propertyType = yield* _(
      make(schema.$id, inner),
      Effect.mapError((cause) => DecodeError.encode(cause)),
    );

    hydrate(propertyType);

    return propertyType;
  });

/** @internal */
export const tryFromAST = (
  ast: AST.AST,
): Effect.Effect<PropertyType<unknown>, InternalError> =>
  Effect.gen(function* (_) {
    const annotation = AST.getAnnotation(ast, AnnotationId);
    if (Option.isNone(annotation)) {
      return yield* _(InternalError.annotation("missing"));
    }

    if (!Predicate.isFunction(annotation.value)) {
      return yield* _(InternalError.annotation("expected function"));
    }

    const propertyType: unknown = annotation.value();
    if (!isPropertyType(propertyType)) {
      return yield* _(
        InternalError.annotation("expected function to return `DataType`"),
      );
    }

    return propertyType;
  });

/** @internal */
export const getFromAST = (
  ast: AST.AST,
): Effect.Effect<Option.Option<PropertyType<unknown>>> =>
  pipe(tryFromAST(ast), Effect.option);

/** @internal */
export const isAST = (ast: AST.AST): boolean =>
  AST.getAnnotation(ast, AnnotationId).pipe(Option.isSome);

// TODO: fromSchema

export type { PropertyTypeSchema as Schema };
