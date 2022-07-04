import { useMutation } from "@apollo/client";

import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { useCallback } from "react";
import {
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { createEntityTypeMutation } from "../../../graphql/queries/entityType.queries";
import { convertApiEntityTypeToBpEntityType } from "../../../lib/entities";

export const useBlockProtocolCreateEntityType = (
  accountId: string,
): {
  createEntityType: EmbedderGraphMessageCallbacks["createEntityType"];
  createEntityTypeLoading: boolean;
  createEntityTypeError: any;
} => {
  const [
    createFn,
    { loading: createEntityTypeLoading, error: createEntityTypeError },
  ] = useMutation<CreateEntityTypeMutation, CreateEntityTypeMutationVariables>(
    createEntityTypeMutation,
  );

  const createEntityType: EmbedderGraphMessageCallbacks["createEntityType"] =
    useCallback(
      async ({ data }) => {
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
            responseData.createEntityType,
          ),
        };
      },
      [accountId, createFn],
    );

  return {
    createEntityType,
    createEntityTypeLoading,
    createEntityTypeError,
  };
};
