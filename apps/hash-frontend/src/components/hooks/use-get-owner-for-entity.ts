import * as Sentry from "@sentry/nextjs";
import { useCallback } from "react";

import { extractWebIdFromEntityId } from "@blockprotocol/type-system";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

import type { EntityId, WebId } from "@blockprotocol/type-system";

export const useGetOwnerForEntity = () => {
  /*
   * This is a simple way of getting all users and orgs to find an entity's owner's name
   * This will not scale as it relies on all users and orgs being available in the frontend
   *
   * @todo H-2723 make it possible to request owners along with entities from the graph
   */
  const { users, loading: usersLoading } = useUsers();
  const { orgs, loading: orgsLoading } = useOrgs();

  const loading = usersLoading || orgsLoading;

  return useCallback(
    (params: { entityId: EntityId } | { webId: WebId }) => {
      const webId =
        "entityId" in params
          ? extractWebIdFromEntityId(params.entityId)
          : params.webId;

      if (loading || !users?.length || !orgs?.length) {
        return {
          webId,
          shortname: "",
          name: "",
          isOrg: false,
        };
      }

      const user = users.find(({ accountId }) => webId === accountId);

      if (user) {
        return {
          webId,
          shortname: user.shortname ?? "incomplete-user-account",
          name: user.displayName ?? "Unknown",
          isOrg: false,
        };
      }

      const org = orgs.find((candidate) => webId === candidate.webId);

      if (org) {
        return {
          webId,
          shortname: org.shortname,
          name: org.name,
          isOrg: true,
        };
      }

      Sentry.captureException(
        new Error(
          `Owner with accountId ${webId} not found in entities table – possibly a caching issue if it has been created mid-session`,
        ),
      );
      return {
        webId,
        shortname: "unknown",
        name: "Unknown",
        isOrg: false,
      };
    },
    [loading, orgs, users],
  );
};
