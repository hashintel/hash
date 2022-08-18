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
  readonly?: boolean,
): {
  createEntity: EmbedderGraphMessageCallbacks["createEntity"];
} => {
  const [createFn] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityQuery);

  const createEntity: EmbedderGraphMessageCallbacks["createEntity"] =
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
      [accountId, createFn, readonly],
    );

  return {
    createEntity,
  };
};
