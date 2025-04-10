import type { EntityId, WebId } from "@blockprotocol/type-system";
import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import * as Sentry from "@sentry/nextjs";
import { useCallback } from "react";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

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
        };
      }

      const owner =
        users.find((user) => webId === user.accountId) ??
        orgs.find((org) => webId === org.webId);

      if (!owner) {
        Sentry.captureException(
          new Error(
            `Owner with accountId ${webId} not found in entities table – possibly a caching issue if it has been created mid-session`,
          ),
        );
        return {
          webId,
          shortname: "unknown",
        };
      }

      return {
        webId,
        shortname: owner.shortname ?? "incomplete-user-account",
      };
    },
    [loading, orgs, users],
  );
};
