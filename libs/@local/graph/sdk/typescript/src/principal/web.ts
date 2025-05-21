import type {
  MachineId,
  WebId,
  WebRole,
  WebRoleId,
} from "@blockprotocol/type-system";
import type { GetWebResponse, GraphApi } from "@local/hash-graph-client";

import type { AuthenticationContext } from "../authentication-context.js";

/**
 * Retrieves a web by its ID.
 *
 * Returns the web if it exists, or `null` if not found.
 */
export const getWebById = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  webId: WebId,
): Promise<{ webId: WebId; machineId: MachineId; shortname?: string } | null> =>
  graphAPI.getWebById(authentication.actorId, webId).then(({ data }) => {
    const response = data as GetWebResponse | null;
    if (!response) {
      return null;
    }
    return {
      webId,
      machineId: response.machineId as MachineId,
      shortname: response.shortname,
    };
  });

/**
 * Retrieves a web by its shortname.
 *
 * Returns the web if it exists, or `null` if not found.
 */
export const getWebByShortname = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  shortname: string,
): Promise<{ webId: WebId; machineId: MachineId; shortname: string } | null> =>
  graphAPI
    .getWebByShortname(authentication.actorId, shortname)
    .then(({ data }) => {
      const response = data as GetWebResponse | null;
      if (!response) {
        return null;
      }
      return {
        webId: response.webId as WebId,
        machineId: response.machineId as MachineId,
        shortname,
      };
    });

/**
 * Returns all roles assigned to the given web.
 */
export const getWebRoles = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  webId: WebId,
): Promise<Record<WebRoleId, WebRole>> =>
  graphAPI
    .getWebRoles(authentication.actorId, webId)
    .then(({ data: roles }) => roles as Record<WebRoleId, WebRole>);
