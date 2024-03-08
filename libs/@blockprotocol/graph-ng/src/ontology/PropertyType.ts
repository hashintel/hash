import * as S from "@effect/schema/Schema";

import * as DataType from "./DataType";
import * as PropertyTypeUrl from "./PropertyTypeUrl";
import { Function, Predicate } from "effect";
import * as VersionedUrl from "../VersionedUrl";

interface OneOfFrom<T> {
  oneOf: ReadonlyArray<T>;
}

interface OneOf<T, A extends ReadonlyArray<T> = ReadonlyArray<T>> {
  oneOf: A;
}

const OneOf = <To, From, C>(
  oneOf: S.Schema<To, From, C>,
): S.Schema<OneOf<To>, OneOf<From>, C> =>
  S.struct({
    oneOf: S.array(oneOf).pipe(S.minItems(1)),
  });

function makeValueSchemaOneOfPropertyValues<A extends PropertyValues>(
  value: OneOf<PropertyValues, [A]>,
): ReturnType<typeof makeValueSchemaArrayOfPropertyValues<A>>;
function makeValueSchemaOneOfPropertyValues<
  A extends PropertyValues,
  B extends PropertyValues,
>(
  value: OneOf<PropertyValues, [A, B]>,
): ReturnType<typeof makeValueSchemaArrayOfPropertyValues<A>> &
  ReturnType<typeof makeValueSchemaArrayOfPropertyValues<B>>;

function makeValueSchemaOneOfPropertyValues(
  value: OneOf<PropertyValues>,
): ReturnType<typeof makeValueSchemaArrayOfPropertyValues>;

function makeValueSchemaOneOfPropertyValues(
  value: OneOf<PropertyValues>,
): never {
  return S.union(
    ...value.oneOf.map((value) => makeValueSchemaPropertyValues(value)),
  ) as never;
}

interface Array<T> {
  minItems?: number | undefined;
  maxItems?: number | undefined;

  items: T;
}

const Array = <To, From, C>(
  items: S.Schema<To, From, C>,
): S.Schema<Array<To>, Array<From>, C> =>
  S.struct({
    minItems: S.optional(S.number.pipe(S.int(), S.positive())),
    maxItems: S.optional(S.number.pipe(S.int(), S.positive())),

    items,
  });

function makeValueSchemaArrayPropertyType<T extends PropertyType>(
  value: T,
): ReturnType<typeof makeValueSchemaPropertyType<T>>;
function makeValueSchemaArrayPropertyType(
  value: PropertyType,
): ReturnType<typeof makeValueSchemaPropertyType>;

function makeValueSchemaArrayPropertyType(value: Array<PropertyType>) {
  return S.array(makeValueSchemaPropertyType(value.items)).pipe(
    Predicate.isNotUndefined(value.minItems)
      ? S.minItems(value.minItems)
      : Function.identity,
    Predicate.isNotUndefined(value.maxItems)
      ? S.maxItems(value.maxItems)
      : Function.identity,
  );
}

interface PropertyTypeObject
  extends ReadonlyArray<PropertyType | Array<PropertyType>> {}

interface PropertyTypeObjectFrom
  extends ReadonlyArray<PropertyTypeFrom | Array<PropertyTypeFrom>> {}

const PropertyTypeObject: S.Schema<PropertyTypeObject, PropertyTypeObjectFrom> =
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  S.array(S.suspend(() => S.union(PropertyType, Array(PropertyType))));

function makeValueSchemaPropertyTypeObjectSingle<
  T extends PropertyType<A>,
  A extends ReadonlyArray<PropertyValues>,
>(
  value: PropertyType<A>,
): {
  [key in VersionedUrl.Base<T["id"]>]: ReturnType<
    typeof makeValueSchemaPropertyType<T>
  >;
};
function makeValueSchemaPropertyTypeObjectSingle<T extends Array<PropertyType>>(
  value: T,
): {
  [key in VersionedUrl.Base<T["items"]["id"]>]: ReturnType<
    typeof makeValueSchemaArrayPropertyType<T>
  >;
};

function makeValueSchemaPropertyTypeObjectSingle(
  value: PropertyType | Array<PropertyType>,
) {
  let valueSchema;
  let valueBase;

  if (Predicate.hasProperty(value, "kind")) {
    valueSchema = makeValueSchemaPropertyType(value);
    valueBase = VersionedUrl.base(value.id);
  } else {
    valueSchema = makeValueSchemaArrayPropertyType(value);
    valueBase = VersionedUrl.base(value.items.id);
  }

  return {
    [valueBase]: valueSchema,
  };
}

function makeValueSchemaPropertyTypeObject<T extends PropertyType>(
  value: T,
): ReturnType<typeof makeValueSchemaPropertyTypeObjectSingle<T>>;
function makeValueSchemaPropertyTypeObject<T extends Array<PropertyType>>(
  value: T,
): ReturnType<typeof makeValueSchemaArrayPropertyType<T>>;
function makeValueSchemaPropertyTypeObject(
  value: PropertyType,
): ReturnType<typeof makeValueSchemaPropertyType>;

function makeValueSchemaPropertyTypeObject(value: PropertyTypeObject) {
  return value
    .map((value) => {
      return makeValueSchemaPropertyTypeObjectSingle(value);
    })
    .reduce((acc, value) => ({ ...acc, ...value }), {});
}

interface ArrayOfPropertyValues extends Array<OneOf<PropertyValues>> {}
interface ArrayOfPropertyValuesFrom
  extends Array<OneOfFrom<PropertyValuesFrom>> {}

const ArrayOfPropertyValues: S.Schema<
  ArrayOfPropertyValues,
  ArrayOfPropertyValuesFrom
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
> = Array(OneOf(S.suspend(() => PropertyValues)));

function makeValueSchemaArrayOfPropertyValues(value: ArrayOfPropertyValues) {
  return S.array(makeValueSchemaOneOfPropertyValues(value.items)).pipe(
    Predicate.isNotUndefined(value.minItems)
      ? S.minItems(value.minItems)
      : Function.identity,
    Predicate.isNotUndefined(value.maxItems)
      ? S.maxItems(value.maxItems)
      : Function.identity,
  );
}

type PropertyValues =
  | DataType.DataType
  | PropertyTypeObject
  | ArrayOfPropertyValues;

type PropertyValuesFrom =
  | S.Schema.From<typeof DataType.DataType>
  | PropertyTypeObjectFrom
  | ArrayOfPropertyValuesFrom;

const PropertyValues: S.Schema<PropertyValues, PropertyValuesFrom> = S.union(
  DataType.DataType,
  PropertyTypeObject,
  ArrayOfPropertyValues,
);

// function makeValueSchemaPropertyValues<T extends DataType.DataType>(
//   value: T,
// ): ReturnType<typeof DataType.makeValueSchema<T>>;

// TODO: this needs to function properly!
// function makeValueSchemaPropertyValues<T extends DataType.DataType>(
//   value: T,
// ): ReturnType<typeof DataType.makeValueSchema<T>>;
function makeValueSchemaPropertyValues(
  value: DataType.DataType,
): ReturnType<typeof DataType.makeValueSchema>;
function makeValueSchemaPropertyValues<T extends PropertyTypeObject>(
  value: T,
): ReturnType<typeof makeValueSchemaPropertyTypeObject<T>>;
function makeValueSchemaPropertyValues<T extends ArrayOfPropertyValues>(
  value: T,
): ReturnType<typeof makeValueSchemaArrayOfPropertyValues<T>>;
function makeValueSchemaPropertyValues(
  value: PropertyValues,
):
  | ReturnType<typeof DataType.makeValueSchema>
  | ReturnType<typeof makeValueSchemaPropertyTypeObject>
  | ReturnType<typeof makeValueSchemaArrayOfPropertyValues>;

function makeValueSchemaPropertyValues(value: PropertyValues) {
  if (Predicate.hasProperty(value, "kind")) {
    return DataType.makeValueSchema(value);
  }

  throw new Error("Not implemented");
  // if (Predicate.hasProperty(value, "items")) {
  //   return makeValueSchemaArrayOfPropertyValues(value);
  // }
  //
  // return makeValueSchemaPropertyTypeObject(value);
}

interface PropertyType<
  A extends ReadonlyArray<PropertyValues> = ReadonlyArray<PropertyValues>,
> extends OneOf<PropertyValues, A> {
  kind: "propertyType";

  id: PropertyTypeUrl.PropertyTypeUrl;
  title: string;
  description?: string | undefined;
}

interface PropertyTypeFrom extends OneOfFrom<PropertyValuesFrom> {
  kind: "propertyType";

  id: S.Schema.From<typeof PropertyTypeUrl.PropertyTypeUrl>;
  title: string;
  description?: string | undefined;
}

export const PropertyType: S.Schema<PropertyType, PropertyTypeFrom> = S.extend(
  S.struct({
    kind: S.literal("propertyType"),

    id: PropertyTypeUrl.PropertyTypeUrl,
    title: S.string,
    description: S.optional(S.string),
  }),

  OneOf(PropertyValues),
);

function makeValueSchemaPropertyType<A extends PropertyValues>(
  value: PropertyType<[A]>,
): ReturnType<typeof makeValueSchemaOneOfPropertyValues<A>>;
function makeValueSchemaPropertyType<T extends PropertyValues>(
  value: PropertyType<ReadonlyArray<T>>,
): ReturnType<typeof makeValueSchemaOneOfPropertyValues<T>>;

function makeValueSchemaPropertyType(value: PropertyType) {
  return makeValueSchemaOneOfPropertyValues(value);
}

//TODO: maybe instead of a full tree, once we hit another data type (via reference or such) we just fallback
// to an opaque value, that is tagged with that type and can be resolved later. That removes any of the annoying
// circular dependencies and such, and makes the validation lighter (although a bit more cumbersome to use) as one
// needs to generate and pass in the schema for every type, but it allows for easier validation and such.
// if we just have: `Property<T>($id, value)` and then `PropertyType.resolve($type, value)` that should work, and we
// can use the same type in the graph!
