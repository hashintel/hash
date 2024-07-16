import { useLazyQuery, useMutation } from "@apollo/client";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { PropertyPatchOperation } from "@local/hash-graph-types/entity";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
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

        const propertyPatches: PropertyPatchOperation[] = [];
        const {
          shortname,
          displayName,
          location,
          websiteUrl,
          preferredPronouns,
        } = params;
        for (const [key, value] of typedEntries({
          shortname,
          displayName,
          location,
          websiteUrl,
          preferredPronouns,
        })) {
          if (typeof value !== "undefined") {
            propertyPatches.push({
              path: [
                key === "displayName"
                  ? blockProtocolPropertyTypes.displayName.propertyTypeBaseUrl
                  : systemPropertyTypes[key].propertyTypeBaseUrl,
              ],
              op: "add",
              property: {
                value,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              },
            });
          }
        }

        const { errors } = await updateEntity({
          variables: {
            entityUpdate: {
              entityId: latestUserEntity.metadata.recordId.entityId,
              propertyPatches,
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
