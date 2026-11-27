import { formatUuid } from "@hashintel/petrinaut-core";

/** A token value as the playground prints it. A UUID is a `bigint` at run time. */
export const formatValue = (value: unknown): string => {
  if (typeof value === "bigint") {
    return formatUuid(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return Object.is(value, -0) ? "-0" : String(value);
};
