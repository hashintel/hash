import { validate as isUuid } from "uuid";

import { entityIdFromComponents } from "@blockprotocol/type-system";

import { exampleTileBySlug } from "../../processes.page/example-tiles-data";

import type { User } from "../../../lib/user-and-org";
import type { ExampleTile } from "../../processes.page/example-tiles-data";
import type { EntityId, EntityUuid, WebId } from "@blockprotocol/type-system";

/**
 * The example a URL's `example` query names, when it names one of ours. Any
 * other value names none, so it never reaches a URL or the editor.
 */
export const exampleFromQuery = (slug: string | null): ExampleTile | null =>
  slug === null ? null : (exampleTileBySlug.get(slug) ?? null);

/** The webs `user` can create entities in: their own and their orgs'. */
export const creatableWebIds = (user: User): ReadonlySet<WebId> =>
  new Set<WebId>([
    user.accountId,
    ...user.memberOf.map(({ org }) => org.webId),
  ]);

/**
 * The id a draft's URL names for its first save, or `null` when the URL
 * can't name one: its uuid is malformed, or its web is not one the user can
 * create entities in.
 */
export const draftEntityIdFromQuery = ({
  uuid,
  draftWeb,
  creatableWebs,
}: {
  uuid: string;
  draftWeb: string;
  creatableWebs: ReadonlySet<WebId>;
}): EntityId | null => {
  if (!isUuid(uuid) || !creatableWebs.has(draftWeb as WebId)) {
    return null;
  }
  return entityIdFromComponents(draftWeb as WebId, uuid as EntityUuid);
};
