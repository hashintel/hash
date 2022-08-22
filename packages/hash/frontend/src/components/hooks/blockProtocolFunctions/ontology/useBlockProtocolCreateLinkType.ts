import { useMutation } from "@apollo/client";
import { MessageCallback } from "@blockprotocol/core";
import { LinkType } from "@hashintel/hash-graph-client";

import { ReadOrModifyResourceError } from "@blockprotocol/graph";
import { useCallback } from "react";
import {
  CreateLinkTypeMutation,
  CreateLinkTypeMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { createLinkTypeMutation } from "../../../../graphql/queries/ontology/link-type.queries";

export type LinkTypeResponse = {
  linkTypeVersionedUri: string;
  linkType: LinkType;
};

export type LinkTypeRequest = {
  linkType: LinkTypeResponse["linkType"];
};

export type CreateLinkTypeMessageCallback = MessageCallback<
  LinkTypeRequest,
  null,
  LinkTypeResponse,
  ReadOrModifyResourceError
>;

export const useBlockProtocolCreateLinkType = (
  accountId: string,
  readonly?: boolean,
): {
  createLinkType: CreateLinkTypeMessageCallback;
} => {
  const [createFn] = useMutation<
    CreateLinkTypeMutation,
    CreateLinkTypeMutationVariables
  >(createLinkTypeMutation);

  const createLinkType: CreateLinkTypeMessageCallback = useCallback(
    async ({ data }) => {
      if (readonly) {
        return {
          errors: [
            {
              code: "FORBIDDEN",
              message: "Operation can't be carried out in readonly mode",
            },
          ],
        };
      }

      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for createEntityType",
            },
          ],
        };
      }

      const { linkType } = data;
      const { data: responseData } = await createFn({
        variables: {
          accountId,
          linkType,
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

      return {
        data: {
          linkTypeVersionedUri:
            responseData.createLinkType.linkTypeVersionedUri,
          linkType: responseData.createLinkType.linkType,
        },
      };
    },
    [accountId, createFn, readonly],
  );

  return {
    createLinkType,
  };
};
