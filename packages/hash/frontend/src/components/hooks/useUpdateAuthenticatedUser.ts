import { useMutation } from "@apollo/client";
import { useCallback, useState } from "react";

import { types } from "@hashintel/hash-shared/types";
import { extractBaseUri } from "@blockprotocol/type-system-web";
import { GraphQLError } from "graphql";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/apiTypes.gen";
import { AuthenticatedUser, constructAuthenticatedUser } from "../../lib/user";
import { updateEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { useAuthenticatedUser } from "./useAuthenticatedUser";

type UpdateAuthenticatedUserParams = {
  shortname?: string;
  preferredName?: string;
};

export const useUpdateAuthenticatedUser = () => {
  const { authenticatedUser, refetch } = useAuthenticatedUser();

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation, { errorPolicy: "all" });

  const [loading, setLoading] = useState<boolean>(false);

  const updateAuthenticatedUser = useCallback(
    async (
      params: UpdateAuthenticatedUserParams,
    ): Promise<{
      updatedAuthenticatedUser?: AuthenticatedUser;
      errors?: readonly GraphQLError[] | undefined;
    }> => {
      try {
        setLoading(true);
        if (!params.shortname && !params.preferredName) {
          return { updatedAuthenticatedUser: authenticatedUser };
        }

        const [
          {
            data: { me: latestMeSubgraph },
          },
        ] = await refetch();

        const userEntity = getRoots(latestMeSubgraph)[0]!;

        /**
         * @todo: use a partial update mutation instead
         * @see https://app.asana.com/0/1202805690238892/1203285029221330/f
         */
        const { properties: currentProperties } = userEntity;

        const { errors } = await updateEntity({
          variables: {
            entityId: userEntity.metadata.editionId.baseId,
            updatedProperties: {
              ...currentProperties,
              ...(params.shortname
                ? {
                    [extractBaseUri(
                      types.propertyType.shortName.propertyTypeId,
                    )]: params.shortname,
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

        if (!kratosSession) {
          throw new Error(
            "The kratos session could not be re-fetched whilst updating the authenticated user",
          );
        }

        const updatedAuthenticatedUser = constructAuthenticatedUser({
          userEntityEditionId: updatedSubgraph.roots[0]!,
          /**
           * @todo: ensure this subgraph contains the incoming links of orgs
           * at depth 2 to support constructing the `members` of an `Org`.
           *
           * @see https://app.asana.com/0/1202805690238892/1203250435416412/f
           */
          subgraph: updatedSubgraph,
          kratosSession,
        });

        return { updatedAuthenticatedUser };
      } finally {
        setLoading(false);
      }
    },
    [authenticatedUser, refetch, updateEntity],
  );

  return [updateAuthenticatedUser, { loading }] as const;
};
