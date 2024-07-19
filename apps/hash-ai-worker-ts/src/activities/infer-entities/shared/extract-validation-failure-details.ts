import { stringify } from "../../shared/stringify.js";

const generateErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : stringify(error);

const isTrueObject = (object: unknown): object is object =>
  object !== null && typeof object === "object";

interface ContextObject {
  context: string;
  sources: ContextObject[];
}

const isContextObject = (object: unknown): object is ContextObject =>
  isTrueObject(object) &&
  "context" in object &&
  typeof object.context === "string" &&
  "sources" in object &&
  Array.isArray(object.sources);

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
 *                 },.
 */
export const extractErrorMessage = (error: unknown) => {
  try {
    if (
      isTrueObject(error) &&
      "status" in error &&
      isTrueObject(error.status) &&
      "contents" in error.status &&
      Array.isArray(error.status.contents) &&
      Array.isArray(error.status.contents[0]) &&
      isContextObject(error.status.contents[0][0])
    ) {
      const nestedContextObject = error.status.contents[0][0].sources[0];

      if (nestedContextObject) {
        const thisLevelContextMessage = nestedContextObject.context;

        const nestedAgainFailureMessages = nestedContextObject.sources.map(
          (source) => source.context,
        );

        return `Entity validation failed: ${
          nestedAgainFailureMessages.length > 0
            ? nestedAgainFailureMessages.join(", ")
            : thisLevelContextMessage
        }`;
      }
    }
  } catch {
     
    console.error(`Unexpected error message structure: ${stringify(error)}`);
  }

  return generateErrorMessage(error);
};
