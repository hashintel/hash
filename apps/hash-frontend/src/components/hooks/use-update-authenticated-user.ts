import { useLazyQuery, useMutation } from "@apollo/client";
import { useCallback, useState } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { updateEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { meQuery } from "../../graphql/queries/user.queries";
import { useAuthInfo } from "../../pages/shared/auth-info-context";
import {
  mergeUserPreferences,
  trackPendingPreferencesUpdate,
} from "../../shared/use-user-preferences";

import type {
  MeQuery,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import type { User } from "../../lib/user-and-org";
import type {
  UserPreferences,
  UserPreferencesUpdate,
} from "../../shared/use-user-preferences";
import type { EntityRootType } from "@blockprotocol/graph";
import type { PropertyPatchOperation } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { GraphQLError } from "graphql";

type UpdateAuthenticatedUserParams = {
  shortname?: string;
  displayName?: string;
  location?: string;
  websiteUrl?: string;
  preferredPronouns?: string;
  preferences?: UserPreferencesUpdate;
};

/**
 * User updates are serialized through this queue so that each one fetches the
 * user entity only after the previous update (and its refetch) has settled.
 * Without it, concurrent updates each read the same stale entity and the whole
 * `preferences` object written last silently reverts the others' changes.
 */
let userUpdateQueue: Promise<unknown> = Promise.resolve();

const enqueueUserUpdate = <T>(update: () => Promise<T>): Promise<T> => {
  const result = userUpdateQueue.then(update, update);
  userUpdateQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

export const useUpdateAuthenticatedUser = () => {
  const { authenticatedUser, refetch } = useAuthInfo();

  const [getMe] = useLazyQuery<MeQuery>(meQuery, {
    fetchPolicy: "network-only",
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

      if (Object.keys(params).length === 0) {
        return { updatedAuthenticatedUser: authenticatedUser };
      }

      const removePendingPreferencesUpdate = params.preferences
        ? trackPendingPreferencesUpdate(params.preferences)
        : undefined;

      setLoading(true);
      try {
        return await enqueueUserUpdate(async () => {
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

          const {
            shortname,
            displayName,
            location,
            websiteUrl,
            preferredPronouns,
            preferences: preferencesUpdate,
          } = params;

          const applicationPreferences = preferencesUpdate
            ? mergeUserPreferences(
                latestUserEntity.properties[
                  systemPropertyTypes.applicationPreferences.propertyTypeBaseUrl
                ] as UserPreferences | undefined,
                preferencesUpdate,
              )
            : undefined;

          const propertyPatches: PropertyPatchOperation[] = [];
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

          const { authenticatedUser: updatedAuthenticatedUser } =
            await refetch();

          return { updatedAuthenticatedUser };
        });
      } finally {
        removePendingPreferencesUpdate?.();
        setLoading(false);
      }
    },
    [authenticatedUser, refetch, updateEntity, getMe],
  );

  return [updateAuthenticatedUser, { loading }] as const;
};
