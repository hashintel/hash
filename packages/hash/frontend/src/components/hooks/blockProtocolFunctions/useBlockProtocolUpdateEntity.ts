import { useMutation } from "@apollo/client";
import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { updateEntity as updateEntityQuery } from "@hashintel/hash-shared/queries/entity.queries";
import { updatePage } from "@hashintel/hash-shared/queries/page.queries";
import { useCallback } from "react";

import {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "../../../graphql/apiTypes.gen";
import {
  convertApiEntityToBpEntity,
  parseEntityIdentifier,
} from "../../../lib/entities";
import { addIdentifiersToMessageData } from "./shared";

export const useBlockProtocolUpdateEntity = (): {
  updateEntity: EmbedderGraphMessageCallbacks["updateEntity"];
  updateEntityLoading: boolean;
  updateEntityError: any;
} => {
  const [
    updateEntityFn,
    { loading: updateUnknownEntityLoading, error: updateUnknownEntityError },
  ] = useMutation<UpdateEntityMutation, UpdateEntityMutationVariables>(
    updateEntityQuery,
  );

  const [updatePageFn, { loading: updatePageLoading, error: updatePageError }] =
    useMutation<UpdatePageMutation, UpdatePageMutationVariables>(updatePage);

  const updateEntity: EmbedderGraphMessageCallbacks["updateEntity"] =
    useCallback(
      async (message) => {
        const { accountId, entityId, entityTypeId, properties } =
          addIdentifiersToMessageData(message);

        return (entityTypeId === "Page" ? updatePageFn : updateEntityFn)({
          variables: {
            accountId,
            entityId,
            properties,
          },
        }).then(({ data: apiResponseData }) => {
          if (!apiResponseData) {
            return {
              errors: [
                {
                  code: "INVALID_INPUT",
                  message: "Error calling updateEntity",
                },
              ],
            };
          }
          return {
            data:
              "updatePage" in apiResponseData
                ? { ...apiResponseData.updatePage, properties: {} } // @todo fix this
                : convertApiEntityToBpEntity(apiResponseData.updateEntity),
          };
        });
      },
      [updateEntityFn, updatePageFn],
    );

  const updateEntityLoading = updateUnknownEntityLoading || updatePageLoading;
  const updateEntityError = updateUnknownEntityError ?? updatePageError;

  return {
    updateEntity,
    updateEntityLoading,
    updateEntityError,
  };
};
