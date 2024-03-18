import * as S from "@effect/schema/Schema";
import {
  Either,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import { encodeSchema } from "./PropertyType/encode.js";
import { EncodeError } from "./PropertyType/error.js";
import { PropertyTypeSchema } from "./PropertyType/schema.js";
import * as PropertyTypeUrl from "./PropertyTypeUrl.js";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyType",
);
export type TypeId = typeof TypeId;

/** @internal */
export const AnnotationId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyType/Annotation",
);

export interface PropertyType<Out, In = Out>
  extends Equal.Equal,
    Pipeable.Pipeable,
    Inspectable.Inspectable {
  [TypeId]: TypeId;

  readonly id: PropertyTypeUrl.PropertyTypeUrl;
  readonly schema: S.Schema<Out, In>;
}

interface PropertyTypeImpl<Out, In = Out> extends PropertyType<Out, In> {}

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
): Either.Either<PropertyTypeSchema, EncodeError> {
  return encodeSchema(impl.ast);
}

export function make<Out, In>(
  id: PropertyTypeUrl.PropertyTypeUrl,
  schema: S.Schema<Out, In>,
): Either.Either<PropertyType<Out, In>, EncodeError> {
  const impl = makeImpl(id, schema);

  return pipe(
    toSchemaImpl(impl.schema),
    Either.map(() => impl),
  );
}

export function makeOrThrow<Out, In>(
  id: PropertyTypeUrl.PropertyTypeUrl,
  schema: S.Schema<Out, In>,
): PropertyType<Out, In> {
  return Either.getOrThrow(make(id, schema));
}

export function parse<I extends string, Out, In>(
  id: I,
  schema: S.Schema<Out, In>,
): Either.Either<PropertyType<Out, In>, EncodeError> {
  return pipe(
    PropertyTypeUrl.parse(id),
    Either.mapLeft((error) => EncodeError.invalidUrl(error)),
    Either.andThen((id) => make(id, schema)),
  );
}

export function parseOrThrow<I extends string, Out, In>(
  id: I,
  schema: S.Schema<Out, In>,
): PropertyType<Out, In> {
  return Either.getOrThrow(parse(id, schema));
}

export function toSchema<Out, In>(
  propertyType: PropertyType<Out, In>,
): Either.Either<PropertyTypeSchema, EncodeError> {
  return toSchemaImpl(propertyType.schema);
}

// TODO: fromSchema

export type { PropertyTypeSchema as Schema };
