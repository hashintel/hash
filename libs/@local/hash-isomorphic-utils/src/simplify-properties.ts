import type { Entity as BpEntity } from "@blockprotocol/graph";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity, EntityPropertiesObject } from "@local/hash-subgraph";
import camelCase from "lodash/fp/camelCase";

/** @see https://stackoverflow.com/a/65015868/17217717 */
type CamelCase<S extends string> = S extends
  | `${infer P1}-${infer P2}${infer P3}`
  | `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>;

/**
 * A utility type that extracts the last segment of a string delimited by a separator
 */
type BeforeTrailingLast<
  CurrentString extends string,
  Separator extends string,
  PreviouslyExtractedSegment extends string = never,
> = CurrentString extends `${string}${Separator}${infer Segment}${Separator}`
  ? BeforeTrailingLast<`${Segment}${Separator}`, Separator, Segment>
  : CamelCase<PreviouslyExtractedSegment>;

/**
 * An entity properties object where the baseUrl keys have been replaced by the last segment of the URL, camelCased
 */
export type SimpleProperties<Properties extends EntityPropertiesObject> = {
  [Key in keyof Properties as BeforeTrailingLast<
    Extract<Key, string>,
    "/"
  >]: Properties[Key];
};

export type Simplified<T extends Entity | BpEntity> = Omit<T, "properties"> & {
  properties: SimpleProperties<T["properties"]>;
};

export const simplifyProperties = <T extends EntityPropertiesObject>(
  properties: T,
): SimpleProperties<T> => {
  return typedEntries(properties).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [camelCase(key.split("/").slice(-2, -1).pop())]: value,
    }),
    {} as SimpleProperties<T>,
  );
};
