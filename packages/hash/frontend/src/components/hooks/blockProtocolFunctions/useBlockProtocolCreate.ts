import { useMutation } from "@apollo/client";

import { BlockProtocolCreateFn } from "@hashintel/block-protocol";
import { createEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolCreate = (): {
  create: BlockProtocolCreateFn;
  createLoading: boolean;
  createError: any;
} => {
  const [createFn, { loading: createLoading, error: createError }] =
    useMutation<CreateEntityMutation, CreateEntityMutationVariables>(
      createEntity
    );

  const create: BlockProtocolCreateFn = useCallback(
    (actions) => {
      for (const action of actions) {
        void createFn({
          variables: {
            properties: action.data,
            entityTypeId: action.entityTypeId,
            entityTypeVersionId: action.entityTypeVersionId,
            accountId: action.pageAccountId,
            createdById: action.userId,
          },
        });
      }
    },
    [createFn]
  );

  return {
    create,
    createLoading,
    createError,
  };
};
