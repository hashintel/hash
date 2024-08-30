import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";

import { stringify } from "../../shared/stringify.js";

const generateErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : stringify(err);

const isTrueObject = (obj: unknown): obj is object =>
  obj !== null && typeof obj === "object";

type ContextObject = {
  context: string;
  sources: ContextObject[];
};

const isContextObject = (obj: unknown): obj is ContextObject =>
  isTrueObject(obj) &&
  "context" in obj &&
  typeof obj.context === "string" &&
  "sources" in obj &&
  Array.isArray(obj.sources);

/**
 * Extract validation failure messages from the error object, which at the time of writing looks like this:
 *
 * {
 *   "status": {
 *     "code": "INVALID_ARGUMENT",
 *     "message": "Entity validation failed",
 *     "contents": [
 *       [
 *         {
 *           "context": "Entity validation failed",
 *           "attachments": [],
 *           "sources": [
 *             {
 *               "context": "The properties of the entity do not match the schema",
 *               "attachments": [],
 *               "sources": [ // This might be empty depending on where the validation failure occurs
 *                 {
 *                   "context": "the property `https://hash.ai/@hash/types/property-type/title/` was specified, but not in the schema",
 *                   "attachments": [],
 *                   "sources": []
 *                 },
 */
export const extractErrorMessage = (err: unknown) => {
  try {
    if (
      isTrueObject(err) &&
      "status" in err &&
      isTrueObject(err.status) &&
      "contents" in err.status &&
      Array.isArray(err.status.contents) &&
      Array.isArray(err.status.contents[0]) &&
      isContextObject(err.status.contents[0][0])
    ) {
      const nestedContextObject = err.status.contents[0][0].sources[0];
      if (nestedContextObject) {
        const thisLevelContextMessage = nestedContextObject.context;

        const nestedAgainFailureMessages = nestedContextObject.sources.map(
          (source) => source.context,
        );

        return `Entity validation failed: ${
          nestedAgainFailureMessages.length
            ? nestedAgainFailureMessages.join(", ")
            : thisLevelContextMessage
        }`;
      }
    }
  } catch {
    // eslint-disable-next-line no-console
    console.error(`Unexpected error message structure: ${stringifyError(err)}`);
  }
  return generateErrorMessage(err);
};
