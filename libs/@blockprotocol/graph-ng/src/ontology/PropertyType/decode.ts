import * as S from "@effect/schema/Schema";
import {
  Effect,
  Function,
  MutableRef,
  Predicate,
  ReadonlyArray,
  ReadonlyRecord,
} from "effect";

import * as Json from "../../Json.js";
import * as DecodeContext from "../internal/DecodeContext.js";
import { OntologyStore } from "../OntologyStore.js";
import { PropertyType } from "../PropertyType.js";
import { PropertyTypeUrl } from "../PropertyTypeUrl.js";
import { DecodeError } from "./error.js";
import {
  ArrayOfPropertyValues,
  DataTypeReference,
  OneOf,
  PropertyTypeObject,
  PropertyTypeObjectValue,
  PropertyTypeReference,
  PropertyTypeSchema,
  PropertyValues,
} from "./schema.js";

type Context<R> = DecodeContext.DecodeContext<PropertyTypeUrl, R>;

const encodeDataTypeReference = <R>(
  schema: DataTypeReference,
  context: Context<R>,
): Effect.Effect<S.Schema<unknown, Json.Value>, DecodeError, R> =>
  Effect.gen(function* (_) {
    const dataType = yield* _(
      context.store.dataType(schema.$ref),
      Effect.mapError(DecodeError.fetchDataType),
    );

    return dataType.schema.pipe(S.filter(() => true));
  });

const encodePropertyTypeReference = <R>(
  schema: PropertyTypeReference,
  context: Context<R>,
): Effect.Effect<S.Schema<unknown, Json.Value>, DecodeError, R> =>
  Effect.gen(function* (_) {
    // check if our id is the same as our current one, in that case we're in recursion
    // and just take our little context box
    // the value is guaranteed to be there, because it has been populated once we exited the creation of types
    if (schema.$ref === context.root) {
      return S.suspend(() => MutableRef.get(context.type)!.schema);
    }

    const propertyType = yield* _(
      context.store.propertyType(schema.$ref),
      Effect.mapError(DecodeError.fetchPropertyType),
    );

    return propertyType.schema;
  });

const encodePropertyTypeObjectValue = <R>(
  schema: PropertyTypeObjectValue,
  context: Context<R>,
): Effect.Effect<S.Schema<unknown, Json.Value>, DecodeError, R> =>
  Effect.gen(function* (_) {
    if (Predicate.hasProperty(schema, "type")) {
      // Array
      const inner = yield* _(
        encodePropertyTypeReference(schema.items, context),
      );

      return S.array(inner).pipe(
        Predicate.isNotUndefined(schema.minItems)
          ? S.minItems(schema.minItems)
          : Function.identity,
        Predicate.isNotUndefined(schema.maxItems)
          ? S.maxItems(schema.maxItems)
          : Function.identity,
      ) as S.Schema<unknown, Json.Value>;
    } else {
      return yield* _(encodePropertyTypeReference(schema, context));
    }
  });

const encodePropertyTypeObject = <R>(
  schema: PropertyTypeObject,
  context: Context<R>,
): Effect.Effect<S.Schema<unknown, Json.Value>, DecodeError, R> =>
  Effect.gen(function* (_) {
    const encoded = yield* _(
      ReadonlyRecord.toEntries(schema.properties),
      ReadonlyArray.map(([key, value]) =>
        encodePropertyTypeObjectValue(value, context).pipe(
          Effect.andThen(
            (valueSchema) =>
              [
                key,
                schema.required.includes(key)
                  ? valueSchema
                  : S.optional(valueSchema),
              ] as const,
          ),
        ),
      ),
      Effect.all,
      Effect.map(ReadonlyRecord.fromEntries),
      Effect.map((record) => S.struct(record)),
    );

    return encoded as S.Schema<unknown, Json.Value>;
  });

const encodeArrayOfPropertyValues = <R>(
  schema: ArrayOfPropertyValues,
  context: Context<R>,
): Effect.Effect<S.Schema<unknown, Json.Value>, DecodeError, R> =>
  Effect.gen(function* (_) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const inner = yield* _(encodeOneOfPropertyValues(schema.items, context));

    return S.array(inner).pipe(
      Predicate.isNotUndefined(schema.minItems)
        ? S.minItems(schema.minItems)
        : Function.identity,
      Predicate.isNotUndefined(schema.maxItems)
        ? S.maxItems(schema.maxItems)
        : Function.identity,
    ) as S.Schema<unknown, Json.Value>;
  });

const encodePropertyValues = <R>(
  schema: PropertyValues,
  context: Context<R>,
): Effect.Effect<S.Schema<unknown, Json.Value>, DecodeError, R> =>
  Effect.gen(function* (_) {
    if (Predicate.hasProperty(schema, "type")) {
      // Object or Array
      switch (schema.type) {
        case "object":
          return yield* _(encodePropertyTypeObject(schema, context));
        case "array":
          return yield* _(encodeArrayOfPropertyValues(schema, context));
      }
    } else {
      // reference
      return yield* _(encodeDataTypeReference(schema, context));
    }
  });

const encodeOneOfPropertyValues = <R>(
  schema: OneOf<PropertyValues>,
  context: Context<R>,
): Effect.Effect<S.Schema<unknown, Json.Value>, DecodeError, R> =>
  Effect.gen(function* (_) {
    return yield* _(
      schema.oneOf,
      ReadonlyArray.map((value) => encodePropertyValues(value, context)),
      Effect.all,
      Effect.andThen((values) => S.union(...values)),
    );
  });

export const decodeSchema = <E, R>(
  schema: PropertyTypeSchema,
  store: OntologyStore<E, R>,
): Effect.Effect<
  {
    schema: S.Schema<unknown, Json.Value>;
    hydrate: (type: PropertyType<unknown, Json.Value>) => void;
  },
  DecodeError,
  R
> =>
  Effect.gen(function* (_) {
    const context = DecodeContext.make(schema.$id, store);

    return yield* _(
      encodeOneOfPropertyValues(schema, context),
      Effect.map(S.title(schema.title)),
      Effect.map(
        Predicate.isNotUndefined(schema.description)
          ? S.description(schema.description)
          : Function.identity,
      ),
      Effect.map((schema) => ({
        schema,
        hydrate: (type: PropertyType<unknown, Json.Value>) => {
          DecodeContext.hydrate(context, type);
        },
      })),
    );
  });
