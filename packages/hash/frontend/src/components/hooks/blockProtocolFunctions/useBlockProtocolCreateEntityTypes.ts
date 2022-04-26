import { useMutation } from "@apollo/client";

import { BlockProtocolCreateEntityTypesFunction } from "blockprotocol";
import { createEntityType } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import {
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolCreateEntityTypes = (): {
  createEntityTypes: BlockProtocolCreateEntityTypesFunction;
  createEntityTypesLoading: boolean;
  createEntityTypesError: any;
} => {
  const [
    createFn,
    { loading: createEntityTypesLoading, error: createEntityTypesError },
  ] = useMutation<CreateEntityTypeMutation, CreateEntityTypeMutationVariables>(
    createEntityType,
  );

  const createEntityTypes: BlockProtocolCreateEntityTypesFunction = useCallback(
    (actions) =>
      Promise.all(
        actions.map((action) => {
          if (!action.accountId) {
            throw new Error(
              "createEntityTypes needs to be passed an accountId",
            );
          }

          return createFn({
            variables: {
              ...action,
              accountId: action.accountId,
              description: (action.schema.description as string) ?? "",
              name: (action.schema.title as string) ?? "",
            },
          }).then(({ data }) => {
            if (!data) {
              throw new Error(
                `Could not create entity type with action ${JSON.stringify(
                  action,
                )}`,
              );
            }
            return {
              entityTypeId: data.createEntityType.entityId,
              ...data.createEntityType.properties,
            };
          });
        }),
      ),
    [createFn],
  );

  return {
    createEntityTypes,
    createEntityTypesLoading,
    createEntityTypesError,
  };
};
