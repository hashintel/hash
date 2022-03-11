import { useMutation } from "@apollo/client";

import { BlockProtocolCreateEntitiesFunction } from "blockprotocol";
import { createEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolCreateEntities = (): {
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
          if (!action.accountId) {
            throw new Error("createEntities needs to be passed an accountId");
          }

          return createFn({
            variables: {
              properties: action.data,
              entityTypeId: action.entityTypeId,
              entityTypeVersionId: action.entityTypeVersionId,
              accountId: action.accountId,
            },
          }).then(({ data }) => {
            if (!data) {
              throw new Error(
                `Could not create entity with action ${JSON.stringify(action)}`,
              );
            }
            return data.createEntity;
          });
        }),
      ),
    [createFn],
  );

  return {
    createEntities,
    createEntitiesLoading,
    createEntitiesError,
  };
};
