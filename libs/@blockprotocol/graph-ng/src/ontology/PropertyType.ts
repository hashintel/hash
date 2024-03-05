import * as S from "@effect/schema/Schema";
import * as PropertyTypeUrl from "./PropertyTypeUrl";
import * as PropertyTypeReference from "./PropertyTypeReference";
import * as DataTypeReference from "./DataTypeReference";
import * as BaseUrl from "../BaseUrl";
import * as VersionedUrl from "../VersionedUrl";

// TODO: Array version lol
const PropertiesObject = S.record(
  BaseUrl.BaseUrl,
  PropertyTypeReference.PropertyTypeReference,
).pipe(
  S.filter((record) =>
    Object.entries(record).every(([k, v]) => k === VersionedUrl.base(v.$ref)),
  ),
);

const PropertyValues = S.union(
  DataTypeReference.DataTypeReference,
  PropertiesObject,
);

export const PropertyType = S.struct({
  kind: S.literal("propertyType"),

  id: PropertyTypeUrl.PropertyTypeUrl,
  title: S.string,
  description: S.optional(S.string),

  oneOf: S.nonEmptyArray(PropertyValues),
});
