import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";

export const stringifyResults = (items: object[]) =>
  items
    .map((item) =>
      Object.entries(item)
        .map(([key, value]) => `${key}: ${stringifyPropertyValue(value)}`)
        .join("\n"),
    )
    .join("---------------\n");
