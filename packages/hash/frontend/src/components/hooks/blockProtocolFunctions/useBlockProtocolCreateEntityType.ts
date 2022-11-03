import { useMutation } from "@apollo/client";

import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { useCallback } from "react";
import {
  DeprecatedCreateEntityTypeMutation,
  DeprecatedCreateEntityTypeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { deprecatedCreateEntityTypeMutation } from "../../../graphql/queries/entityType.queries";
import { convertApiEntityTypeToBpEntityType } from "../../../lib/entities";

export const useBlockProtocolCreateEntityType = (
  accountId: string,
  readonly?: boolean,
): {
  createEntityType: EmbedderGraphMessageCallbacks["createEntityType"];
} => {
  const [createFn] = useMutation<
    DeprecatedCreateEntityTypeMutation,
    DeprecatedCreateEntityTypeMutationVariables
  >(deprecatedCreateEntityTypeMutation);

  const createEntityType: EmbedderGraphMessageCallbacks["createEntityType"] =
    useCallback(
      async ({ data }) => {
        if (readonly) {
          return {
            errors: [
              {
                code: "FORBIDDEN",
                message: "Operation can't be carried out in readonly mode",
              },
            ],
          };
        }

        if (!data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "'data' must be provided for createEntityType",
              },
            ],
          };
        }

        const { schema } = data;
        const { data: responseData } = await createFn({
          variables: {
            accountId,
            description: (schema.description as string) ?? "",
            name: schema.title ?? "",
            schema,
          },
        });

        if (!responseData) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "Error calling createEntityType",
              },
            ],
          };
        }

        return {
          data: convertApiEntityTypeToBpEntityType(
            responseData.deprecatedCreateEntityType,
          ),
        };
      },
      [accountId, createFn, readonly],
    );

  return {
    createEntityType,
  };
};
