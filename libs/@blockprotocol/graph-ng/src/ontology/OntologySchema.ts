import * as S from "@effect/schema/Schema";
import { Brand, Function, Option, Predicate } from "effect";

import * as Json from "../Json.js";
import * as VersionedUrl from "../VersionedUrl.js";
import * as DataType from "./DataType.js";
import * as DataTypeUrl from "./DataTypeUrl.js";
import * as PropertyType from "./PropertyType.js";
import * as PropertyTypeUrl from "./PropertyTypeUrl.js";

export const dataType = <
  Out,
  In extends Json.Value,
  Id extends DataTypeUrl.DataTypeUrl,
  R,
>(
  type: DataType.DataType<Out, In, Id, R>,
): S.Schema<Out, In, R> => type.schema.pipe(S.filter(() => true));

export const propertyType = <
  Out,
  In,
  Id extends PropertyTypeUrl.PropertyTypeUrl,
  R,
>(
  type: PropertyType.PropertyType<Out, In, Id, R>,
): S.Schema<Out, In, R> => type.schema;

type AnyPropertyType = PropertyType.PropertyType<
  any,
  any,
  PropertyTypeUrl.PropertyTypeUrl,
  unknown
>;
type AnyLazyPropertyType = PropertyType.LazyPropertyType<
  any,
  any,
  PropertyTypeUrl.PropertyTypeUrl,
  unknown
>;
interface HasPropertyTypeUrl {
  readonly id: PropertyTypeUrl.PropertyTypeUrl;
}

type LazyPropertyTypeFn<T extends AnyLazyPropertyType> = {
  id: PropertyTypeUrl.PropertyTypeUrl;
  fn: () => T;
};

type PropertyTypeKey<T extends HasPropertyTypeUrl> = Brand.Brand.Unbranded<
  VersionedUrl.Base<T["id"]>
>;

type PropertyTypeSchema<T> = T extends AnyPropertyType
  ? T["schema"]
  : T extends LazyPropertyTypeFn<infer U>
    ? S.suspend<
        S.Schema.Type<U["schema"]>,
        S.Schema.Encoded<U["schema"]>,
        S.Schema.Context<U["schema"]>
      >
    : never;

type ReturnPropertyObjectEntry<T> = T extends AnyPropertyType
  ? {
      [K in PropertyTypeKey<T>]: PropertyTypeSchema<T>;
    }
  : T extends ReturnPropertyArray<infer U>
    ? {
        [K in PropertyTypeKey<U>]: S.array<PropertyTypeSchema<U>>;
      }
    : T extends LazyPropertyTypeFn<infer U>
      ? {
          [K in PropertyTypeKey<U>]: PropertyTypeSchema<T>;
        }
      : never;

type ReturnPropertyObjectStruct<T> = T extends [infer A]
  ? ReturnPropertyObjectEntry<A>
  : T extends [infer Head, ...infer Tail]
    ? ReturnPropertyObjectEntry<Head> & ReturnPropertyObjectStruct<Tail>
    : never;

type ReturnPropertyObject<T> = S.struct<ReturnPropertyObjectStruct<T>>;

type PropertyObjectEntry =
  | AnyPropertyType
  | LazyPropertyTypeFn<AnyLazyPropertyType>;

/**
 * Utility function to create a `S.struct` declaration from a tuple of property types.
 *
 * Each parameter can be one of several:
 * * A property type
 * * A lazy property type
 * * An array of property types
 *
 * The array of property types can be constructed with [`propertyArray`].
 *
 * The lazy property type needs to be a record with the keys `id` and `fn`, where `fn` will be executed
 * in a suspend. The `id` is required to generate the key for the property type, as one cannot use `S.suspend` for keys.
 *
 * @param elements
 */
export function propertyObject<
  Elements extends ReadonlyArray<
    PropertyObjectEntry | ReturnPropertyArray<PropertyObjectEntry>
  >,
>(...elements: Elements): ReturnPropertyObject<Elements> {
  return S.struct(
    Object.fromEntries(
      elements.map((element) => {
        function valueSchema(element: PropertyObjectEntry) {
          if (Predicate.hasProperty(element, "fn")) {
            // we have a lazy property type
            return S.suspend(() => element.fn().schema);
          } else {
            return propertyType(element);
          }
        }

        function key(element: PropertyObjectEntry): string {
          return VersionedUrl.base(element.id);
        }

        if (Predicate.hasProperty(element, PropertyArrayId)) {
          // we have an array property, the entry could either be a property type or a lazy property type
        }

        if (Predicate.hasProperty(element, PropertyArrayId)) {
          return [
            key(element.entry),
            S.array(valueSchema(element.entry)).pipe(
              Option.isSome(element.minItems)
                ? S.minItems(element.minItems.value)
                : Function.identity,
              Option.isSome(element.maxItems)
                ? S.maxItems(element.maxItems.value)
                : Function.identity,
            ),
          ];
        } else {
          return [key(element), valueSchema(element)];
        }
      }),
    ),
  ) as never;
}

const PropertyArrayId: unique symbol = Symbol(
  "@blockprotocol/graph/ontology/OntologySchema/PropertyArrayId",
);
type PropertyArrayId = typeof PropertyArrayId;
type ReturnPropertyArray<T extends PropertyObjectEntry> = {
  readonly [PropertyArrayId]: PropertyArrayId;
  readonly minItems: Option.Option<number>;
  readonly maxItems: Option.Option<number>;
  readonly entry: T;
};

/**
 * Utility function to create a `S.array` declaration from a property type.
 *
 * The `entry` parameter can be one of several:
 * * A property type
 * * A lazy property type
 *
 * The lazy property type needs to be a record with the keys `id` and `fn`, where `fn` will be executed
 * in a suspend. The `id` is required to generate the key for the property type, as one cannot use `S.suspend` for keys.
 */
export function propertyArray<T extends PropertyObjectEntry>(
  entry: T,
  annotations: { minItems?: number; maxItems?: number } = {},
): ReturnPropertyArray<T> {
  const minItems = Option.fromNullable(annotations.minItems);
  const maxItems = Option.fromNullable(annotations.maxItems);

  return {
    [PropertyArrayId]: PropertyArrayId,
    minItems,
    maxItems,
    entry,
  };
}
