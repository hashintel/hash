import { useMutation } from "@apollo/client";

import {
  BlockProtocolCreateLinksFunction,
  BlockProtocolLink,
} from "blockprotocol";
import {
  createLinkedAggregationMutation,
  createLinkMutation,
} from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  CreateLinkedAggregationOperationMutation,
  CreateLinkedAggregationOperationMutationVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";

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

  const [runCreateLinkedAggregationMutation] = useMutation<
    CreateLinkedAggregationOperationMutation,
    CreateLinkedAggregationOperationMutationVariables
  >(createLinkedAggregationMutation);

  const createLinks: BlockProtocolCreateLinksFunction = useCallback(
    async (actions) => {
      const results: BlockProtocolLink[] = [];
      // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
      for (const action of actions) {
        if (!action.sourceAccountId) {
          throw new Error("createLinks needs to be passed a sourceAccountId");
        }

        const baseFields = {
          path: action.path,
          sourceEntityId: action.sourceEntityId,
          sourceAccountId: action.sourceAccountId,
        };

        if ("operation" in action) {
          if (!action.operation.entityTypeId) {
            throw new Error(
              "entityTypeId is compulsory on operation while trying to create a linkedAggregation",
            );
          }

          const { data, errors } = await runCreateLinkedAggregationMutation({
            variables: {
              ...action,
              operation: {
                // @todo this shouldn't be necessary
                ...action.operation,
                entityTypeId: action.operation.entityTypeId,
              },
              sourceAccountId: action.sourceAccountId,
            },
          });
          if (!data) {
            throw new Error(`Could not create link: ${errors?.[0]!.message}`);
          }

          // @todo, add a proper typecheck. The GraphQL query for multiFilter { operator } returns String, but BlockProtocolLinkedAggregationUpdateMutationResults defines the exact type for operator. This typecast is used to typecast string to the one the query expects.
          results.push(
            data.createLinkedAggregation as unknown as BlockProtocolLink,
          );
        } else if (!("destinationAccountId" in action)) {
          throw new Error(
            "One of operation or destinationEntityId must be provided",
          );
        } else {
          const newLink = {
            ...baseFields,
            destinationEntityId: action.destinationEntityId,
            destinationAccountId: action.destinationAccountId
              ? action.destinationAccountId
              : action.sourceAccountId,
          };

          const { data, errors } = await runCreateLinksMutation({
            variables: {
              link: newLink,
            },
          });
          if (!data) {
            throw new Error(`Could not create link: ${errors?.[0]!.message}`);
          }

          results.push(data.createLink);
        }
      }
      return results;
    },
    [runCreateLinksMutation, runCreateLinkedAggregationMutation],
  );

  return {
    createLinks,
    createLinksLoading,
    createLinksError,
  };
};
