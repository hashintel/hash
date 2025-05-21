import type {
  Team,
  TeamId,
  TeamRole,
  TeamRoleId,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";

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
): Promise<Team | null> =>
  graphAPI.getTeamByName(authentication.actorId, name).then(({ data }) => {
    const team = data as Team | null;
    if (!team) {
      return null;
    }
    return team;
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
