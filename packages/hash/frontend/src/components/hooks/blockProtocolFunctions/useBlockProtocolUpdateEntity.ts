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
import { convertApiEntityToBpEntity } from "../../../lib/entities";
import { addIdentifiersToMessageData } from "./shared";

export const useBlockProtocolUpdateEntity = (
  updateForPage: boolean = false,
): {
  updateEntity: EmbedderGraphMessageCallbacks["updateEntity"];
  updateEntityLoading: boolean;
} => {
  const [updateEntityFn, { loading: updateUnknownEntityLoading }] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityQuery);

  const [updatePageFn, { loading: updatePageLoading }] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage);

  const updateEntity: EmbedderGraphMessageCallbacks["updateEntity"] =
    useCallback(
      async (message) => {
        const { accountId, entityId, properties } =
          addIdentifiersToMessageData(message);

        return (updateForPage ? updatePageFn : updateEntityFn)({
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
      [updateEntityFn, updateForPage, updatePageFn],
    );

  // @todo consider removing this state and implementing loading locally
  const updateEntityLoading = updateUnknownEntityLoading || updatePageLoading;

  return {
    updateEntity,
    updateEntityLoading,
  };
};
