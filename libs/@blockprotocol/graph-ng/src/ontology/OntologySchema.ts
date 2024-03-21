import * as S from "@effect/schema/Schema";

import * as Json from "../Json.js";
import * as DataType from "./DataType.js";
import * as DataTypeUrl from "./DataTypeUrl.js";
import * as PropertyType from "./PropertyType.js";
import * as PropertyTypeUrl from "./PropertyTypeUrl.js";
import * as VersionedUrl from "../VersionedUrl.js";
import { Brand, Option, Predicate, Function } from "effect";

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

type PropertyTypeKey<T extends AnyPropertyType> = Brand.Brand.Unbranded<
  VersionedUrl.Base<T["id"]>
>;
type PropertyTypeSchema<T extends AnyPropertyType> = T["schema"];

type ReturnPropertyObjectEntry<T> = T extends AnyPropertyType
  ? {
      [K in PropertyTypeKey<T>]: PropertyTypeSchema<T>;
    }
  : T extends ReturnPropertyArray<infer U extends AnyPropertyType>
    ? {
        [K in PropertyTypeKey<U>]: S.array<PropertyTypeSchema<U>>;
      }
    : never;

type ReturnPropertyObjectStruct<T> = T extends [infer A]
  ? ReturnPropertyObjectEntry<A>
  : T extends [infer Head, ...infer Tail]
    ? ReturnPropertyObjectEntry<Head> & ReturnPropertyObjectStruct<Tail>
    : never;

type ReturnPropertyObject<T> = S.struct<ReturnPropertyObjectStruct<T>>;

export function propertyObject<
  Elements extends ReadonlyArray<
    AnyPropertyType | ReturnPropertyArray<AnyPropertyType>
  >,
>(...elements: Elements): ReturnPropertyObject<Elements> {
  return S.struct(
    Object.fromEntries(
      elements.map((element) => {
        if (Predicate.hasProperty(element, PropertyArrayId)) {
          return [
            VersionedUrl.base(element.type.id) as PropertyTypeKey<
              typeof element.type
            >,
            S.array(propertyType(element.type)).pipe(
              Option.isSome(element.minItems)
                ? S.minItems(element.minItems.value)
                : Function.identity,
              Option.isSome(element.maxItems)
                ? S.maxItems(element.maxItems.value)
                : Function.identity,
            ),
          ];
        } else {
          return [
            VersionedUrl.base(element.id) as PropertyTypeKey<typeof element>,
            propertyType(element) as S.Schema.Any,
          ];
        }
      }),
    ),
  ) as never;
}

const PropertyArrayId: unique symbol = Symbol(
  "@blockprotocol/graph/ontology/OntologySchema/PropertyArrayId",
);
type PropertyArrayId = typeof PropertyArrayId;
type ReturnPropertyArray<T extends AnyPropertyType> = {
  readonly [PropertyArrayId]: PropertyArrayId;
  readonly minItems: Option.Option<number>;
  readonly maxItems: Option.Option<number>;
  readonly type: T;
};

export function propertyArray<T extends AnyPropertyType>(
  type: T,
  annotations: { minItems?: number; maxItems?: number } = {},
): ReturnPropertyArray<T> {
  const minItems = Option.fromNullable(annotations["minItems"]);
  const maxItems = Option.fromNullable(annotations["maxItems"]);

  return {
    [PropertyArrayId]: PropertyArrayId,
    minItems,
    maxItems,
    type,
  };
}
