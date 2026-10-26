import { camelCase } from "lodash-es";

import { typedEntries } from "@local/advanced-types/typed-entries";

import type {
  Entity as BpEntity,
  EntityMetadata,
  PropertyObject,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

/** @see https://stackoverflow.com/a/65015868/17217717 */
type CamelCase<S extends string> = S extends
  // oxlint-disable-next-line eslint/no-redeclare -- repeating `infer` names across union members unifies them into one candidate set
  `${infer P1}-${infer P2}${infer P3}` | `${infer P1}_${infer P2}${infer P3}`
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
export type SimpleProperties<Properties extends PropertyObject> = {
  [
    Key in keyof Properties as BeforeTrailingLast<Extract<Key, string>, "/">
  ]: Properties[Key];
};

export interface Simplified<T extends HashEntity | BpEntity> {
  metadata: EntityMetadata;
  properties: SimpleProperties<T["properties"]>;
}

export const simplifyProperties = <T extends PropertyObject>(
  properties: T,
): SimpleProperties<T> => {
  // oxlint-disable-next-line typescript/no-restricted-types -- values are passed through untouched; only the keys change
  const simplifiedProperties: Record<string, unknown> = {};

  // this function is only called with property objects that follow the HASH URL/bp scheme
  for (const [key, value] of typedEntries(properties)) {
    const id = key.split("/").at(-2);

    // fallback to a non-simplified key if the key is not in the expected format
    if (id !== undefined && id !== "") {
      simplifiedProperties[camelCase(id)] = value;
    } else {
      simplifiedProperties[key] = value;
    }
  }

  // SAFETY: the keys were rewritten according to `SimpleProperties`, whose values are the original property values.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the key rewrite is not expressible to the type checker
  return simplifiedProperties as SimpleProperties<T>;
};
