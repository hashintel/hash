import { useMutation } from "@apollo/client";
import { useCallback, useState } from "react";

import { types } from "@hashintel/hash-shared/types";
import { extractBaseUri } from "@blockprotocol/type-system-web";
import { GraphQLError } from "graphql";
import {
  UpdatePersistedEntityMutation,
  UpdatePersistedEntityMutationVariables,
} from "../../graphql/apiTypes.gen";
import { mustGetEntity, Subgraph } from "../../lib/subgraph";
import { AuthenticatedUser, constructAuthenticatedUser } from "../../lib/user";
import { updatePersistedEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { useAuthenticatedUser } from "./useAuthenticatedUser";

type UpdateAuthenticatedUserParams = {
  shortname?: string;
  preferredName?: string;
};

export const useUpdateAuthenticatedUser = () => {
  const { authenticatedUser, refetch } = useAuthenticatedUser();

  const [updatePersistedEntity] = useMutation<
    UpdatePersistedEntityMutation,
    UpdatePersistedEntityMutationVariables
  >(updatePersistedEntityMutation, { errorPolicy: "all" });

  const [loading, setLoading] = useState<boolean>(false);

  const updateAuthenticatedUser = useCallback(
    async (
      params: UpdateAuthenticatedUserParams,
    ): Promise<{
      updatedAuthenticatedUser?: AuthenticatedUser;
      errors?: readonly GraphQLError[] | undefined;
    }> => {
      if (!params.shortname && !params.preferredName) {
        return { updatedAuthenticatedUser: authenticatedUser };
      }

      const [
        {
          data: { me: latestSubgraph },
        },
      ] = await refetch();

      const entityId = latestSubgraph.roots[0]!;

      /** @todo: use a partial update mutation instead */
      const { properties: currentProperties } = mustGetEntity({
        subgraph: latestSubgraph as unknown as Subgraph,
        entityId,
      });

      const { errors } = await updatePersistedEntity({
        variables: {
          entityId,
          updatedProperties: {
            ...currentProperties,
            ...(params.shortname
              ? {
                  [extractBaseUri(types.propertyType.shortName.propertyTypeId)]:
                    params.shortname,
                }
              : {}),
            ...(params.preferredName
              ? {
                  [extractBaseUri(
                    types.propertyType.preferredName.propertyTypeId,
                  )]: params.preferredName,
                }
              : {}),
          },
        },
      });

      if (errors && errors.length > 0) {
        return { errors };
      }

      const [
        {
          data: { me: updatedSubgraph },
        },
        kratosSession,
      ] = await refetch();

      const updatedAuthenticatedUser = constructAuthenticatedUser({
        userEntityId: updatedSubgraph.roots[0]!,
        /**
         * @todo: ensure this subgraph contains the incoming links of orgs
         * at depth 2 to support constructing the `members` of an `Org`.
         *
         * @see https://app.asana.com/0/1202805690238892/1203250435416412/f
         */
        subgraph: updatedSubgraph as unknown as Subgraph,
        kratosSession: kratosSession!,
      });

      return { updatedAuthenticatedUser };
    },
    [authenticatedUser, refetch, updatePersistedEntity],
  );

  return {
    updateAuthenticatedUser: async (params: UpdateAuthenticatedUserParams) => {
      try {
        setLoading(true);
        return updateAuthenticatedUser(params);
      } finally {
        setLoading(false);
      }
    },
    loading,
  };
};
