import { useMutation } from "@apollo/client";

import { BlockProtocolCreateLinkFn } from "@hashintel/block-protocol";
import { createLinkMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  CreateLinkMutation,
  CreateLinkMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolCreateLink = (
  /** Providing accountId here saves blocks from having to know it */
  sourceAccountId: string,
): {
  createLink: BlockProtocolCreateLinkFn;
  createLinkLoading: boolean;
  createLinkError: any;
} => {
  const [createFn, { loading: createLinkLoading, error: createLinkError }] =
    useMutation<CreateLinkMutation, CreateLinkMutationVariables>(
      createLinkMutation,
    );

  const createLink: BlockProtocolCreateLinkFn = useCallback(
    (payload) =>
      createFn({
        variables: {
          ...payload,
          sourceAccountId,
          destinationAccountId: sourceAccountId, // @todo handle cross-account links
        },
      }).then(({ data, errors }) => {
        if (!data) {
          throw new Error(`Could not create link: ${errors?.[0].message}`);
        }
        return data.createLink;
      }),
    [sourceAccountId, createFn],
  );

  return {
    createLink,
    createLinkLoading,
    createLinkError,
  };
};
