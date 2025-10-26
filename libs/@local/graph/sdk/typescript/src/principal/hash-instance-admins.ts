import type { ActorEntityUuid, Team, WebId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";

import type { AuthenticationContext } from "../authentication-context.js";
import { getActorGroupRole } from "./actor-group.js";
import { getTeamByName } from "./team.js";

export const getInstanceAdminsTeam = async (
  ctx: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
): Promise<Omit<Team, "parentId"> & { webId: WebId }> =>
  getTeamByName(ctx.graphApi, authentication, "instance-admins").then(
    (team) => {
      if (!team) {
        throw new Error("Failed to get instance admins team");
      }
      if (team.parentId.actorGroupType !== "web") {
        throw new Error("Instance admins parent is not a web");
      }
      return {
        id: team.id,
        name: team.name,
        webId: team.parentId.id,
      };
    },
  );

/**
 * Check whether or not the user is a hash instance admin.
 *
 * @param params.user - the user that may be a hash instance admin.
 */
export const isUserHashInstanceAdmin = async (
  ctx: { graphApi: GraphApi },
  authentication: AuthenticationContext,
  { userAccountId }: { userAccountId: ActorEntityUuid },
): Promise<boolean> =>
  getInstanceAdminsTeam(ctx, authentication).then((team) =>
    getActorGroupRole(ctx.graphApi, authentication, {
      actorGroupId: team.id,
      actorId: userAccountId,
    }).then((role) => role === "member"),
  );
