import type {
  ActorGroupId,
  TeamId,
  TeamRole,
  TeamRoleId,
} from "@blockprotocol/type-system";
import type { GetTeamResponse, GraphApi } from "@local/hash-graph-client";

import type { AuthenticationContext } from "../authentication-context.js";

/**
 * Retrieves a web by its shortname.
 *
 * Returns the web if it exists, or `null` if not found.
 */
export const getTeamByName = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  name: "instance-admins",
): Promise<{
  teamId: TeamId;
  parentId: ActorGroupId;
  name: string;
} | null> =>
  graphAPI.getTeamByName(authentication.actorId, name).then(({ data }) => {
    const response = data as GetTeamResponse | null;
    if (!response) {
      return null;
    }
    return {
      teamId: response.teamId as TeamId,
      parentId: response.parentId as ActorGroupId,
      name,
    };
  });

/**
 * Returns all roles assigned to the given team.
 */
export const getTeamRoles = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  teamId: TeamId,
): Promise<Record<TeamRoleId, TeamRole>> =>
  graphAPI
    .getTeamRoles(authentication.actorId, teamId)
    .then(({ data: roles }) => roles as Record<TeamRoleId, TeamRole>);
