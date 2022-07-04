import { useMutation } from "@apollo/client";
import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { createLinkMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";

import {
  CreateLinkMutation,
  CreateLinkMutationVariables,
} from "../../../graphql/apiTypes.gen";
import {
  convertApiLinkToBpLink,
  parseEntityIdentifier,
} from "../../../lib/entities";

export const useBlockProtocolCreateLink = (): {
  createLink: EmbedderGraphMessageCallbacks["createLink"];
  createLinkLoading: boolean;
  createLinkError: any;
} => {
  const [
    runCreateLinksMutation,
    { loading: createLinkLoading, error: createLinkError },
  ] = useMutation<CreateLinkMutation, CreateLinkMutationVariables>(
    createLinkMutation,
  );

  const createLink: EmbedderGraphMessageCallbacks["createLink"] = useCallback(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for createLink",
            },
          ],
        };
      }
      const {
        sourceEntityId: bpFormattedSourceEntityId,
        destinationEntityId: bpFormattedDestinationEntityId,
        path,
      } = data;

      const { accountId: sourceAccountId, entityId: sourceEntityId } =
        parseEntityIdentifier(bpFormattedSourceEntityId);
      const { accountId: destinationAccountId, entityId: destinationEntityId } =
        parseEntityIdentifier(bpFormattedDestinationEntityId);

      const { data: responseData } = await runCreateLinksMutation({
        variables: {
          link: {
            path,
            sourceEntityId,
            sourceAccountId,
            destinationEntityId,
            destinationAccountId,
          },
        },
      });

      if (!responseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling createLink",
            },
          ],
        };
      }

      return {
        data: convertApiLinkToBpLink(responseData.createLink),
      };
    },
    [runCreateLinksMutation],
  );

  return {
    createLink,
    createLinkLoading,
    createLinkError,
  };
};
