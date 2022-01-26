import { useMutation } from "@apollo/client";

import { BlockProtocolCreateEntitiesFunction } from "blockprotocol";
import { createEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolCreateEntities = (
  /** Providing accountId here saves blocks from having to know it */
  accountId: string,
): {
  createEntities: BlockProtocolCreateEntitiesFunction;
  createEntitiesLoading: boolean;
  createEntitiesError: any;
} => {
  const [
    createFn,
    { loading: createEntitiesLoading, error: createEntitiesError },
  ] = useMutation<CreateEntityMutation, CreateEntityMutationVariables>(
    createEntity,
  );

  const createEntities: BlockProtocolCreateEntitiesFunction = useCallback(
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
        }),
      ),
    [accountId, createFn],
  );

  return {
    createEntities,
    createEntitiesLoading,
    createEntitiesError,
  };
};
