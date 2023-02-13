import { useLazyQuery, useMutation } from "@apollo/client";
import { extractBaseUri } from "@blockprotocol/type-system";
import { EntityId } from "@local/hash-graphql-shared/types";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { getRootsAsEntities } from "@local/hash-subgraph/src/stdlib/element/entity";
import { GraphQLError } from "graphql";
import { useCallback, useState } from "react";

import {
  MeQuery,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import { updateEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { meQuery } from "../../graphql/queries/user.queries";
import { AuthenticatedUser } from "../../lib/user-and-org";
import { useAuthInfo } from "../../pages/shared/auth-info-context";

type UpdateAuthenticatedUserParams = {
  shortname?: string;
  preferredName?: string;
};

export const useUpdateAuthenticatedUser = () => {
  const { authenticatedUser, refetch } = useAuthInfo();

  const [getMe] = useLazyQuery<MeQuery>(meQuery, { fetchPolicy: "no-cache" });

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
      if (!authenticatedUser) {
        throw new Error("There is no authenticated user to update.");
      }

      try {
        setLoading(true);
        if (!params.shortname && !params.preferredName) {
          return { updatedAuthenticatedUser: authenticatedUser };
        }

        const latestUserEntitySubgraph = await getMe()
          .then(({ data }) => data?.me)
          .catch(() => undefined);

        if (!latestUserEntitySubgraph) {
          throw new Error(
            "Could not get latest user entity when updating the authenticated user.",
          );
        }

        const latestUserEntity = getRootsAsEntities(
          latestUserEntitySubgraph,
        )[0]!;

        /**
         * @todo: use a partial update mutation instead
         * @see https://app.asana.com/0/1202805690238892/1203285029221330/f
         */
        const { properties: currentProperties } = latestUserEntity;

        const { errors } = await updateEntity({
          variables: {
            entityId: latestUserEntity.metadata.recordId.entityId as EntityId,
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

        const { authenticatedUser: updatedAuthenticatedUser } = await refetch();

        return { updatedAuthenticatedUser };
      } finally {
        setLoading(false);
      }
    },
    [authenticatedUser, refetch, updateEntity, getMe],
  );

  return [updateAuthenticatedUser, { loading }] as const;
};
