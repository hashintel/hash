import { useLazyQuery, useMutation } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { PropertyPatchOperation } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
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
import type { UserPreferences } from "../../shared/use-user-preferences";

type UpdateAuthenticatedUserParams = {
  shortname?: string;
  displayName?: string;
  location?: string;
  websiteUrl?: string;
  preferredPronouns?: string;
  preferences?: UserPreferences;
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
              ? mapGqlSubgraphFieldsFragmentToSubgraph<
                  EntityRootType<HashEntity>
                >(data.me.subgraph)
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
          preferences: applicationPreferences,
        } = params;
        for (const [key, value] of typedEntries({
          shortname,
          displayName,
          location,
          websiteUrl,
          preferredPronouns,
          applicationPreferences,
        })) {
          if (typeof value !== "undefined") {
            if (key === "websiteUrl" && !value) {
              /**
               * We need to explicitly remove the websiteUrl property if it is an empty string,
               * because an empty string won't pass the URL validation regex.
               */
              propertyPatches.push({
                path: [systemPropertyTypes.websiteUrl.propertyTypeBaseUrl],
                op: "remove",
              });
              continue;
            }

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
                    key === "applicationPreferences"
                      ? "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1"
                      : key === "websiteUrl"
                        ? "https://hash.ai/@h/types/data-type/uri/v/1"
                        : "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
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
