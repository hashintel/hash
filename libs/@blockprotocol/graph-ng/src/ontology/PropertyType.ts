import * as S from "@effect/schema/Schema";

import * as DataType from "./DataType";
import * as PropertyTypeUrl from "./PropertyTypeUrl";

interface OneOfFrom<T> {
  oneOf: ReadonlyArray<T>;
}

interface OneOf<T> {
  oneOf: ReadonlyArray<T>;
}

const OneOf = <To, From, C>(
  oneOf: S.Schema<To, From, C>,
): S.Schema<OneOf<To>, OneOf<From>, C> =>
  S.struct({
    oneOf: S.array(oneOf).pipe(S.minLength(1)),
  });

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

interface PropertyTypeObject
  extends ReadonlyArray<PropertyType | Array<PropertyType>> {}

interface PropertyTypeObjectFrom
  extends ReadonlyArray<PropertyTypeFrom | Array<PropertyTypeFrom>> {}

const PropertyTypeObject: S.Schema<PropertyTypeObject, PropertyTypeObjectFrom> =
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  S.array(S.suspend(() => S.union(PropertyType, Array(PropertyType))));

interface ArrayOfPropertyValues extends Array<OneOf<PropertyValues>> {}
interface ArrayOfPropertyValuesFrom
  extends Array<OneOfFrom<PropertyValuesFrom>> {}

const ArrayOfPropertyValues: S.Schema<
  ArrayOfPropertyValues,
  ArrayOfPropertyValuesFrom
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
> = Array(OneOf(S.suspend(() => PropertyValues)));

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

interface PropertyType extends OneOf<PropertyValues> {
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
