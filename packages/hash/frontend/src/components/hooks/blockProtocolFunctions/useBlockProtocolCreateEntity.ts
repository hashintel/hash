import { useMutation } from "@apollo/client";
import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";

import { createEntity as createEntityQuery } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { convertApiEntityToBpEntity } from "../../../lib/entities";

export const useBlockProtocolCreateEntity = (
  accountId: string,
): {
  createEntity: EmbedderGraphMessageCallbacks["createEntity"];
  createEntityLoading: boolean;
  createEntityError: any;
} => {
  const [createFn, { loading: createEntityLoading, error: createEntityError }] =
    useMutation<CreateEntityMutation, CreateEntityMutationVariables>(
      createEntityQuery,
    );

  const createEntity: EmbedderGraphMessageCallbacks["createEntity"] =
    useCallback(
      async ({ data }) => {
        if (!data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "'data' must be provided for createEntity",
              },
            ],
          };
        }
        const { entityTypeId, properties } = data;

        return createFn({
          variables: {
            properties,
            entityTypeId,
            accountId,
          },
        }).then(({ data: responseData }) => {
          if (!responseData) {
            return {
              errors: [
                {
                  code: "INVALID_INPUT",
                  message: "Error calling createEntity",
                },
              ],
            };
          }
          return {
            data: convertApiEntityToBpEntity(responseData.createEntity),
          };
        });
      },
      [accountId, createFn],
    );

  return {
    createEntity,
    createEntityLoading,
    createEntityError,
  };
};
