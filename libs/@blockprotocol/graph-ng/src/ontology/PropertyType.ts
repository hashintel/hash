import * as S from "@effect/schema/Schema";

import * as DataType from "./DataType";
import * as PropertyTypeUrl from "./PropertyTypeUrl";
import { Function, Predicate } from "effect";
import * as VersionedUrl from "../VersionedUrl";
import * as Property from "../knowledge/Property";
import * as Json from "../internal/Json";

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

type ValueSchemaOneOfPropertyValues<T extends PropertyTypeUrl.PropertyTypeUrl> =
  ValueSchemaPropertyValues<T>;

// TODO: more tuple variants
function makeValueSchemaOneOfPropertyValues<
  T extends PropertyTypeUrl.PropertyTypeUrl,
  A extends ReadonlyArray<PropertyValues<T>> = ReadonlyArray<PropertyValues<T>>,
>(
  value: OneOf<PropertyValues<T>, A>,
): A extends [infer B extends PropertyValues<infer B1>]
  ? ValueSchemaOneOfPropertyValues<B1>
  : ValueSchemaOneOfPropertyValues<T> {
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

type ValueSchemaProperty<T extends PropertyTypeUrl.PropertyTypeUrl> = S.Schema<
  Property.Property<T>,
  Json.Value
>;

function makeValueSchemaProperty<T extends PropertyTypeUrl.PropertyTypeUrl>(
  url: T,
): ValueSchemaProperty<T> {
  return S.transform(
    Json.Value,
    Property.Property,
    (value) => ({
      id: url,
      value,
    }),
    (value) => value.value,
  ) as never;
}

type ValueSchemaArrayPropertyType<T extends PropertyTypeUrl.PropertyTypeUrl> =
  ReturnType<typeof makeValueSchemaArrayProperty<T>>;

function makeValueSchemaArrayProperty<
  T extends PropertyTypeUrl.PropertyTypeUrl,
>(value: Array<T>) {
  return S.array(makeValueSchemaProperty(value.items)).pipe(
    Predicate.isNotUndefined(value.minItems)
      ? S.minItems(value.minItems)
      : Function.identity,
    Predicate.isNotUndefined(value.maxItems)
      ? S.maxItems(value.maxItems)
      : Function.identity,
  );
}

interface PropertyTypeObject
  extends ReadonlyArray<
    PropertyTypeUrl.PropertyTypeUrl | Array<PropertyTypeUrl.PropertyTypeUrl>
  > {}

interface PropertyTypeObjectFrom
  extends ReadonlyArray<
    | S.Schema.From<typeof PropertyTypeUrl.PropertyTypeUrl>
    | Array<S.Schema.From<typeof PropertyTypeUrl.PropertyTypeUrl>>
  > {}

const PropertyTypeObject: S.Schema<PropertyTypeObject, PropertyTypeObjectFrom> =
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  S.array(
    S.suspend(() =>
      S.union(
        PropertyTypeUrl.PropertyTypeUrl,
        Array(PropertyTypeUrl.PropertyTypeUrl),
      ),
    ),
  );

type ValueSchemaPropertyTypeObjectSingleUnknown<
  T extends PropertyTypeUrl.PropertyTypeUrl,
> = S.Schema<
  {
    [key in VersionedUrl.Base<T>]:
      | S.Schema.To<ValueSchemaProperty<T>>
      | S.Schema.To<ValueSchemaArrayPropertyType<T>>;
  },
  {
    [key in VersionedUrl.Base<T>]: Json.Value;
  }
>;

type ValueSchemaPropertyTypeObjectSingleProperty<
  T extends PropertyTypeUrl.PropertyTypeUrl,
> = S.Schema<
  {
    [key in VersionedUrl.Base<T>]: S.Schema.To<ValueSchemaProperty<T>>;
  },
  {
    [key in VersionedUrl.Base<T>]: Json.Value;
  }
>;

type ValueSchemaPropertyTypeObjectSingleArray<
  T extends PropertyTypeUrl.PropertyTypeUrl,
> = S.Schema<
  {
    [key in VersionedUrl.Base<T>]: S.Schema.To<ValueSchemaArrayPropertyType<T>>;
  },
  {
    [key in VersionedUrl.Base<T>]: Json.Value;
  }
>;

function makeValueSchemaPropertyTypeObjectSingle<
  T extends PropertyTypeUrl.PropertyTypeUrl,
  U extends T | Array<T> = T | Array<T>,
>(
  value: U,
): [U] extends [Array<T>]
  ? ValueSchemaPropertyTypeObjectSingleArray<T>
  : [U] extends [T]
    ? ValueSchemaPropertyTypeObjectSingleProperty<T>
    : ValueSchemaPropertyTypeObjectSingleUnknown<T> {
  let valueSchema;
  let valueBase;

  if (Predicate.hasProperty(value, "items")) {
    valueSchema = makeValueSchemaArrayProperty(value);
    valueBase = VersionedUrl.base(value.items);
  } else {
    valueSchema = makeValueSchemaProperty(value);
    valueBase = VersionedUrl.base(value);
  }

  // never here because of generics
  return S.struct({
    [valueBase]: valueSchema,
  }) as never;
}

// TODO: more tuple versions c:
function makeValueSchemaPropertyTypeObject<T extends PropertyTypeObject>(
  value: T,
): T extends [infer A extends PropertyTypeUrl.PropertyTypeUrl]
  ? ReturnType<typeof makeValueSchemaPropertyTypeObjectSingle<A>>
  : ValueSchemaPropertyTypeObjectSingleUnknown<PropertyTypeUrl.PropertyTypeUrl> {
  return value
    .map((value) => {
      return makeValueSchemaPropertyTypeObjectSingle(value);
    })
    .reduce(
      (acc, value) => S.extend(acc, value) as never,
      S.struct({}),
    ) as never;
}

interface ArrayOfPropertyValues<
  T extends PropertyTypeUrl.PropertyTypeUrl = PropertyTypeUrl.PropertyTypeUrl,
> extends Array<OneOf<PropertyValues<T>>> {}
interface ArrayOfPropertyValuesFrom
  extends Array<OneOfFrom<PropertyValuesFrom>> {}

const ArrayOfPropertyValues: S.Schema<
  ArrayOfPropertyValues,
  ArrayOfPropertyValuesFrom
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
> = Array(OneOf(S.suspend(() => PropertyValues)));

type ValueSchemaArrayOfPropertyValues<
  T extends PropertyTypeUrl.PropertyTypeUrl = PropertyTypeUrl.PropertyTypeUrl,
> = S.Schema<
  readonly S.Schema.To<ValueSchemaOneOfPropertyValues<T>>[],
  readonly S.Schema.From<ValueSchemaOneOfPropertyValues<T>>[]
>;

function makeValueSchemaArrayOfPropertyValues<
  T extends PropertyTypeUrl.PropertyTypeUrl,
>(value: Array<OneOf<PropertyValues<T>>>): ValueSchemaArrayOfPropertyValues<T> {
  let values = makeValueSchemaOneOfPropertyValues(value.items);

  // TODO: idk if that's correct here tbh
  return S.array(values).pipe(
    Predicate.isNotUndefined(value.minItems)
      ? S.minItems(value.minItems)
      : Function.identity,
    Predicate.isNotUndefined(value.maxItems)
      ? S.maxItems(value.maxItems)
      : Function.identity,
  ) as never;
}

type PropertyValues<
  T extends PropertyTypeUrl.PropertyTypeUrl = PropertyTypeUrl.PropertyTypeUrl,
> = DataType.DataType | PropertyTypeObject | ArrayOfPropertyValues<T>;

type PropertyValuesFrom =
  | S.Schema.From<typeof DataType.DataType>
  | PropertyTypeObjectFrom
  | ArrayOfPropertyValuesFrom;

const PropertyValues: S.Schema<PropertyValues, PropertyValuesFrom> = S.union(
  DataType.DataType,
  PropertyTypeObject,
  ArrayOfPropertyValues,
);

type ValueSchemaPropertyValues<T extends PropertyTypeUrl.PropertyTypeUrl> =
  S.Schema<
    | S.Schema.To<DataType.ValueSchema<DataType.DataType>>
    | S.Schema.To<ReturnType<typeof makeValueSchemaPropertyTypeObject>>
    | S.Schema.To<ValueSchemaArrayOfPropertyValues<T>>,
    Json.Value
  >;

function makeValueSchemaPropertyValues<
  T extends PropertyTypeUrl.PropertyTypeUrl,
>(value: PropertyValues<T>): ValueSchemaPropertyValues<T> {
  if (Predicate.hasProperty(value, "kind")) {
    return DataType.makeValueSchema(value) as never;
  }

  if (Predicate.hasProperty(value, "items")) {
    return makeValueSchemaArrayOfPropertyValues(value) as never;
  }

  return makeValueSchemaPropertyTypeObject(value) as never;
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

type ValueSchema<T extends PropertyTypeUrl.PropertyTypeUrl> =
  ValueSchemaOneOfPropertyValues<T>;

function makeValueSchemaPropertyType(
  value: PropertyType,
): ValueSchema<PropertyTypeUrl.PropertyTypeUrl> {
  return makeValueSchemaOneOfPropertyValues(value);
}

//TODO: maybe instead of a full tree, once we hit another data type (via reference or such) we just fallback
// to an opaque value, that is tagged with that type and can be resolved later. That removes any of the annoying
// circular dependencies and such, and makes the validation lighter (although a bit more cumbersome to use) as one
// needs to generate and pass in the schema for every type, but it allows for easier validation and such.
// if we just have: `Property<T>($id, value)` and then `PropertyType.resolve($type, value)` that should work, and we
// can use the same type in the graph!
