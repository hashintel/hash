import { useMutation } from "@apollo/client";
import {
  EmbedderGraphMessageCallbacks
} from "@blockprotocol/graph";
import { createLinkMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";

import {
  CreateLinkMutation,
  CreateLinkMutationVariables,
} from "../../../graphql/apiTypes.gen";

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
      const { data: responseData } = await runCreateLinksMutation({
        variables: {
          link: {
            path,
            sourceEntityId,
            sourceAccountId,
            destinationEntityId: action.destinationEntityId,
            destinationAccountId: action.destinationAccountId
              ? action.destinationAccountId
              : action.sourceAccountId,
          },
        },
      });

      if (!responseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling createEntityType",
            },
          ],
        };
      }
    }
      const results: BlockProtocolLink[] = [];
      // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
      for (const action of actions) {
        if (!action.sourceAccountId) {
          throw new Error("createLink needs to be passed a sourceAccountId");
        }

        const { data, errors } = await runCreateLinksMutation({
          variables: {
            link: {
              path: action.path,
              sourceEntityId: action.sourceEntityId,
              sourceAccountId: action.sourceAccountId,
              destinationEntityId: action.destinationEntityId,
              destinationAccountId: action.destinationAccountId
                ? action.destinationAccountId
                : action.sourceAccountId,
            },
          },
        });

        if (!data) {
          throw new Error(`Could not create link: ${errors?.[0]!.message}`);
        }

        results.push(data.createLink);
      }
      return results;
    },
    [runCreateLinksMutation],
  );

  return {
    createLink,
    createLinkLoading,
    createLinkError,
  };
};
