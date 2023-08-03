import { typedEntries } from "@local/advanced-types/typed-entries";
import { UserProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { EntityPropertiesObject } from "@local/hash-subgraph";
import { camelCase } from "lodash";

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

export const simplifyProperties = <T extends EntityPropertiesObject>(
  properties: T,
): SimpleProperties<T> => {
  return typedEntries(properties).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [camelCase(key)]: value,
    }),
    {} as SimpleProperties<T>,
  );
};

const testProps: UserProperties = {
  "http://localhost:3000/@system-user/types/property-type/kratos-identity-id/":
    "aaa-123-456",
  "http://localhost:3000/@system-user/types/property-type/email/": [
    "alice@example.com",
  ],
  "http://localhost:3000/@system-user/types/property-type/shortname/": "alice",
  "http://localhost:3000/@system-user/types/property-type/preferred-name/":
    "Alice",
};

const test = simplifyProperties(testProps);
