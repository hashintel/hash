import { useLazyQuery, useMutation } from "@apollo/client";
import { useCallback, useEffect, useRef, useState } from "react";

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
import { rebaseUserPreferences } from "./use-update-authenticated-user/rebase-preferences";
import { authenticatedUserUpdateQueue } from "./use-update-authenticated-user/serial-queue";

import type {
  MeQuery,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import type { User } from "../../lib/user-and-org";
import type { UserPreferences } from "../../shared/use-user-preferences";
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

  /**
   * An update waits in the queue while the updates before it run, and those
   * refetch the authenticated user as they land. What an update needs is
   * therefore read from here when its turn comes, rather than captured in a
   * closure when it was enqueued.
   */
  const latestRef = useRef({ authenticatedUser, getMe, refetch, updateEntity });
  useEffect(() => {
    latestRef.current = { authenticatedUser, getMe, refetch, updateEntity };
  });

  /**
   * The queue is shared between every instance of this hook, but `loading`
   * describes the updates this instance is waiting on.
   */
  const inFlightCountRef = useRef(0);

  const updateAuthenticatedUser = useCallback(
    async (
      params: UpdateAuthenticatedUserParams,
    ): Promise<{
      updatedAuthenticatedUser?: User;
      errors?: readonly GraphQLError[] | undefined;
    }> => {
      /**
       * The preferences the caller built `params.preferences` from, captured
       * now, while it is still what they last rendered, so that their change
       * can be rebased onto the server's preferences when their turn comes.
       */
      const preferencesWhenEnqueued =
        latestRef.current.authenticatedUser?.preferences;

      inFlightCountRef.current += 1;
      setLoading(true);

      try {
        return await authenticatedUserUpdateQueue.enqueue(async () => {
          const {
            authenticatedUser: currentUser,
            getMe: getMeNow,
            refetch: refetchNow,
            updateEntity: updateEntityNow,
          } = latestRef.current;

          if (!currentUser) {
            throw new Error("There is no authenticated user to update.");
          }

          if (Object.keys(params).length === 0) {
            return { updatedAuthenticatedUser: currentUser };
          }

          const latestUserEntitySubgraph = await getMeNow()
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
            preferences,
          } = params;

          const preferencesOnServer = latestUserEntity.properties[
            systemPropertyTypes.applicationPreferences.propertyTypeBaseUrl
          ] as UserPreferences | undefined;

          const applicationPreferences = preferences
            ? rebaseUserPreferences({
                base: preferencesWhenEnqueued,
                next: preferences,
                latest: preferencesOnServer,
              })
            : undefined;

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

          const { errors } = await updateEntityNow({
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
            await refetchNow();

          return { updatedAuthenticatedUser };
        });
      } finally {
        inFlightCountRef.current -= 1;
        if (inFlightCountRef.current === 0) {
          setLoading(false);
        }
      }
    },
    [],
  );

  return [updateAuthenticatedUser, { loading }] as const;
};
