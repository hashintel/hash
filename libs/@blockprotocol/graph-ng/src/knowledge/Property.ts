import * as S from "@effect/schema/Schema";
import * as PropertyTypeUrl from "../ontology-v1/PropertyTypeUrl";
import * as Json from "../Json.js";

export const Property: S.Schema<Property, { id: string; value: Json.Value }> =
  S.struct({
    id: PropertyTypeUrl.PropertyTypeUrl,
    value: Json.Value,
  });

export interface Property<
  T extends PropertyTypeUrl.PropertyTypeUrl = PropertyTypeUrl.PropertyTypeUrl,
> {
  id: T;
  value: Json.Value;
}
