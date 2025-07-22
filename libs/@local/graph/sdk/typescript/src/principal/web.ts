import type {
  Web,
  WebId,
  WebRole,
  WebRoleId,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";

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
): Promise<Web | null> =>
  graphAPI.getWebById(authentication.actorId, webId).then(({ data }) => {
    const web = data as Web | null;
    if (!web) {
      return null;
    }
    return web;
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
): Promise<Web | null> =>
  graphAPI
    .getWebByShortname(authentication.actorId, shortname)
    .then(({ data }) => {
      const web = data as Web | null;
      if (!web) {
        return null;
      }
      return web;
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
