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

export const useBlockProtocolCreateLinks = (
  /** Providing accountId here saves blocks from having to know it */
  sourceAccountId: string,
): {
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
        const { data, errors } = await runCreateLinksMutation({
          variables: {
            link: {
              ...action,
              sourceAccountId,
              destinationAccountId: sourceAccountId, // @todo handle cross-account links
            },
          },
        });
        if (!data) {
          throw new Error(`Could not create link: ${errors?.[0].message}`);
        }

        results.push(data.createLink);
      }
      return results;
    },
    [sourceAccountId, runCreateLinksMutation],
  );

  return {
    createLinks,
    createLinksLoading,
    createLinksError,
  };
};
