import { camelCase } from "lodash-es";
import type { Entity as BpEntity } from "@blockprotocol/graph";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityMetadata,
  PropertyObject,
} from "@local/hash-graph-types/entity";

/** @see https://stackoverflow.com/a/65015868/17217717 */
type CamelCase<S extends string> = S extends
  | `${infer P1}-${infer P2}${infer P3}`
  | `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>;

/**
 * A utility type that extracts the last segment of a string delimited by a separator.
 */
type BeforeTrailingLast<
  CurrentString extends string,
  Separator extends string,
  PreviouslyExtractedSegment extends string = never,
> = CurrentString extends `${string}${Separator}${infer Segment}${Separator}`
  ? BeforeTrailingLast<`${Segment}${Separator}`, Separator, Segment>
  : CamelCase<PreviouslyExtractedSegment>;

/**
 * An entity properties object where the baseUrl keys have been replaced by the last segment of the URL, camelCased.
 */
export type SimpleProperties<Properties extends PropertyObject> = {
  [Key in keyof Properties as BeforeTrailingLast<
    Extract<Key, string>,
    "/"
  >]: Properties[Key];
};

export interface Simplified<T extends Entity | BpEntity> {
  metadata: EntityMetadata;
  properties: SimpleProperties<T["properties"]>;
}

export const simplifyProperties = <T extends PropertyObject>(
  properties: T,
): SimpleProperties<T> => {
  // this function is only called with property objects that follow the HASH URL/bp scheme
  return typedEntries(properties).reduce<SimpleProperties<T>>(
    (accumulator, [key, value]) => {
      // fallback to a non-simplified key if the key is not in the expected format
      const id = key.split("/").at(-2);
      const simplified = id ? camelCase(id) : key;

      return {
        ...accumulator,
        [simplified]: value,
      };
    },
    {},
  );
};
