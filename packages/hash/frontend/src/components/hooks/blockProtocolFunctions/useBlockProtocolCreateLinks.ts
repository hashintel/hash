import { useMutation } from "@apollo/client";

import {
  BlockProtocolCreateLinksFunction,
  BlockProtocolLink,
} from "blockprotocol";
import { createLinkMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";

import {
  CreateLinkMutation,
  CreateLinkMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolCreateLinks = (): {
  createLinks: BlockProtocolCreateLinksFunction;
  createLinksLoading: boolean;
  createLinksError: any;
} => {
  const [
    runCreateLinksMutation,
    { loading: createLinksLoading, error: createLinksError },
  ] = useMutation<CreateLinkMutation, CreateLinkMutationVariables>(
    createLinkMutation,
  );

  const createLinks: BlockProtocolCreateLinksFunction = useCallback(
    async (actions) => {
      const results: BlockProtocolLink[] = [];
      // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
      for (const action of actions) {
        if (!action.sourceAccountId) {
          throw new Error("createLinks needs to be passed a sourceAccountId");
        }

        if (!("destinationAccountId" in action)) {
          throw new Error(
            "One of operation or destinationEntityId must be provided",
          );
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
    createLinks,
    createLinksLoading,
    createLinksError,
  };
};
