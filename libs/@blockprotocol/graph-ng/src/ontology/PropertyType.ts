import { AST } from "@effect/schema";
import * as S from "@effect/schema/Schema";
import {
  Effect,
  Equal,
  Hash,
  Inspectable,
  Option,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import * as DataType from "./DataType.js";
import { InternalError } from "./DataType/error.js";
import { encodeSchema } from "./PropertyType/encode.js";
import { EncodeError } from "./PropertyType/error.js";
import { PropertyTypeSchema } from "./PropertyType/schema.js";
import * as PropertyTypeUrl from "./PropertyTypeUrl.js";

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

export interface PropertyType<Out, In = Out>
  extends Equal.Equal,
    Pipeable.Pipeable,
    Inspectable.Inspectable {
  readonly [TypeId]: TypeId;

  readonly id: PropertyTypeUrl.PropertyTypeUrl;
  readonly schema: S.Schema<Out, In>;
}

export interface LazyPropertyType<Out, In = Out> {
  readonly [LazyTypeId]: LazyTypeId;
  readonly schema: S.Schema<Out, In>;
}

interface PropertyTypeImpl<Out, In = Out> extends PropertyType<Out, In> {}

interface LazyPropertyTypeImpl<Out, In = Out>
  extends LazyPropertyType<Out, In> {
  readonly impl: PropertyTypeImpl<Out, In>;
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

export function isPropertyType(value: unknown): value is PropertyType<unknown> {
  return Predicate.hasProperty(value, TypeId);
}

function makeImpl<Out, In>(
  id: PropertyTypeUrl.PropertyTypeUrl,
  schema: S.Schema<Out, In>,
): PropertyType<Out, In> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const impl = Object.create(PropertyTypeProto);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  impl.id = id;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  impl.schema = schema.annotations({
    [AnnotationId]: () => impl as PropertyType<unknown>,
  });

  return impl as PropertyType<Out, In>;
}

function toSchemaImpl<Out, In>(
  impl: S.Schema<Out, In>,
): Effect.Effect<PropertyTypeSchema, EncodeError> {
  return encodeSchema(impl.ast);
}

export function make<Out, In>(
  id: PropertyTypeUrl.PropertyTypeUrl,
  schema: S.Schema<Out, In>,
): Effect.Effect<PropertyType<Out, In>, EncodeError> {
  const impl = makeImpl(id, schema);

  return pipe(
    toSchemaImpl(impl.schema),
    Effect.map(() => impl),
  );
}

export function makeLazy<Out, In>(
  id: PropertyTypeUrl.PropertyTypeUrl,
  schema: S.Schema<Out, In>,
): LazyPropertyType<Out, In> {
  const impl = makeImpl(id, schema);

  return {
    [LazyTypeId]: LazyTypeId,
    schema: impl.schema,
    impl,
  } satisfies LazyPropertyTypeImpl<Out, In> as LazyPropertyType<Out, In>;
}

export function validateLazy<Out, In>(
  lazyPropertyType: LazyPropertyType<Out, In>,
): Effect.Effect<PropertyType<Out, In>, EncodeError> {
  const { impl } = lazyPropertyType as LazyPropertyTypeImpl<Out, In>;

  return pipe(
    toSchemaImpl(impl.schema),
    Effect.map(() => impl),
  );
}

export function makeOrThrow<Out, In>(
  id: PropertyTypeUrl.PropertyTypeUrl,
  schema: S.Schema<Out, In>,
): PropertyType<Out, In> {
  return Effect.runSync(make(id, schema));
}

export function parse<I extends string, Out, In>(
  id: I,
  schema: S.Schema<Out, In>,
): Effect.Effect<PropertyType<Out, In>, EncodeError> {
  return pipe(
    PropertyTypeUrl.parse(id),
    Effect.mapError((error) => EncodeError.invalidUrl(error)),
    Effect.andThen((id) => make(id, schema)),
  );
}

export function parseOrThrow<I extends string, Out, In>(
  id: I,
  schema: S.Schema<Out, In>,
): PropertyType<Out, In> {
  return Effect.runSync(parse(id, schema));
}

export function toSchema<Out, In>(
  propertyType: PropertyType<Out, In>,
): Effect.Effect<PropertyTypeSchema, EncodeError> {
  return toSchemaImpl(propertyType.schema);
}

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

export const isolate = <A, I>(schema: S.Schema<A, I>): S.Schema<A, I> =>
  DataType.isAST(schema.ast) ? schema.pipe(S.filter(() => true)) : schema;

export type { PropertyTypeSchema as Schema };
