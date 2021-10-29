import { useMutation } from "@apollo/client";

import { BlockProtocolCreateFn } from "@hashintel/block-protocol";
import { createEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolCreate = (
  /** Providing accountId here saves blocks from having to know it */
  accountId: string
): {
  create: BlockProtocolCreateFn;
  createLoading: boolean;
  createError: any;
} => {
  const [createFn, { loading: createLoading, error: createError }] =
    useMutation<CreateEntityMutation, CreateEntityMutationVariables>(
      createEntity
    );

  const create: BlockProtocolCreateFn = useCallback(
    (actions) =>
      Promise.all(
        actions.map((action) => {
          return createFn({
            variables: {
              properties: action.data,
              entityTypeId: action.entityTypeId,
              entityTypeVersionId: action.entityTypeVersionId,
              accountId: action.accountId ?? accountId,
            },
          }).then(({ data }) => data?.createEntity);
        })
      ),
    [accountId, createFn]
  );

  return {
    create,
    createLoading,
    createError,
  };
};
