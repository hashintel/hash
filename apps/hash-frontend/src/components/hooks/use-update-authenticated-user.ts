import { useLazyQuery, useMutation } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import type { GraphQLError } from "graphql";
import { useCallback, useState } from "react";

import type {
  MeQuery,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import { updateEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { meQuery } from "../../graphql/queries/user.queries";
import type { User } from "../../lib/user-and-org";
import { useAuthInfo } from "../../pages/shared/auth-info-context";

type UpdateAuthenticatedUserParams = {
  shortname?: string;
  displayName?: string;
  location?: string;
  websiteUrl?: string;
  preferredPronouns?: string;
};

export const useUpdateAuthenticatedUser = () => {
  const { authenticatedUser, refetch } = useAuthInfo();

  const [getMe] = useLazyQuery<MeQuery>(meQuery, {
    fetchPolicy: "cache-and-network",
  });

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation, { errorPolicy: "all" });

  const [loading, setLoading] = useState<boolean>(false);

  const updateAuthenticatedUser = useCallback(
    async (
      params: UpdateAuthenticatedUserParams,
    ): Promise<{
      updatedAuthenticatedUser?: User;
      errors?: readonly GraphQLError[] | undefined;
    }> => {
      if (!authenticatedUser) {
        throw new Error("There is no authenticated user to update.");
      }

      try {
        setLoading(true);
        if (Object.keys(params).length === 0) {
          return { updatedAuthenticatedUser: authenticatedUser };
        }

        const latestUserEntitySubgraph = await getMe()
          .then(({ data }) => {
            const subgraph = data
              ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
                  data.me.subgraph,
                )
              : undefined;

            return subgraph;
          })
          .catch(() => undefined);

        if (!latestUserEntitySubgraph) {
          throw new Error(
            "Could not get latest user entity when updating the authenticated user.",
          );
        }

        const latestUserEntity = getRoots(latestUserEntitySubgraph)[0]!;

        /**
         * @todo: use a partial update mutation instead
         * @see https://app.asana.com/0/1202805690238892/1203285029221330/f
         */
        const { properties: currentProperties } = latestUserEntity;

        const { errors } = await updateEntity({
          variables: {
            entityUpdate: {
              entityId: latestUserEntity.metadata.recordId.entityId,
              updatedProperties: {
                ...currentProperties,
                ...(params.shortname
                  ? {
                      [extractBaseUrl(
                        systemPropertyTypes.shortname.propertyTypeId,
                      )]: params.shortname,
                    }
                  : {}),
                ...(params.displayName
                  ? {
                      [extractBaseUrl(
                        blockProtocolPropertyTypes.displayName.propertyTypeId,
                      )]: params.displayName,
                    }
                  : {}),
                ...(typeof params.location !== "undefined"
                  ? {
                      [extractBaseUrl(
                        systemPropertyTypes.location.propertyTypeId,
                      )]: params.location,
                    }
                  : {}),
                ...(typeof params.websiteUrl !== "undefined"
                  ? {
                      [extractBaseUrl(
                        systemPropertyTypes.websiteUrl.propertyTypeId,
                      )]: params.websiteUrl,
                    }
                  : {}),
                ...(typeof params.preferredPronouns !== "undefined"
                  ? {
                      [extractBaseUrl(
                        systemPropertyTypes.preferredPronouns.propertyTypeId,
                      )]: params.preferredPronouns,
                    }
                  : {}),
              },
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
