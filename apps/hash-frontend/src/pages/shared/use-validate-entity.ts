import { useLazyQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { PropertyObjectWithMetadata } from "@local/hash-graph-types/entity";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import { useCallback } from "react";

import type {
  ValidateEntityQuery,
  ValidateEntityQueryVariables,
} from "../../graphql/api-types.gen";
import { validateEntityQuery } from "../../graphql/queries/knowledge/entity.queries";

type ContextObject = {
  context: string;
  sources: ContextObject[];
};

const isContextObject = (obj: unknown): obj is ContextObject =>
  !!obj &&
  typeof obj === "object" &&
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
const extractValidationErrors = (err: unknown) => {
  try {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      err.status &&
      typeof err.status === "object" &&
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

        return nestedAgainFailureMessages.length
          ? nestedAgainFailureMessages
          : thisLevelContextMessage;
      }
    }
  } catch {
    // eslint-disable-next-line no-console
    console.error(`Unexpected error message structure: ${stringifyError(err)}`);
  }
  return stringifyError(err);
};

export const useValidateEntity = () => {
  const [validate, { loading }] = useLazyQuery<
    ValidateEntityQuery,
    ValidateEntityQueryVariables
  >(validateEntityQuery, {
    fetchPolicy: "network-only",
  });

  const validateEntity = useCallback(
    async ({
      entityTypeIds,
      properties,
    }: {
      entityTypeIds: VersionedUrl[];
      properties: PropertyObjectWithMetadata;
    }) => {
      try {
        await validate({
          variables: {
            components: {
              linkData: true,
              linkValidation: true,
              numItems: true,
              requiredProperties: true,
            },
            entityTypes: entityTypeIds,
            properties,
          },
        });

        return true;
      } catch (err) {
        return extractValidationErrors(err);
      }
    },
    [validate],
  );

  return {
    loading,
    validateEntity,
  };
};
