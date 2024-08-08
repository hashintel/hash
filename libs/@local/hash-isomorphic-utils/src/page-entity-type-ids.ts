import type { VersionedUrl } from "@blockprotocol/type-system";

import { generateVersionedUrlMatchingFilter } from "./graph-queries.js";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "./ontology-type-ids.js";

export const pageEntityTypeIds: VersionedUrl[] = [
  systemEntityTypes.canvas.entityTypeId,
  systemEntityTypes.document.entityTypeId,
];

/**
 * Whether or not this Versioned URL is one which belongs to a 'Page'.
 * We have two types of 'Page', 'Document' and 'Canvas'.
 * In some places we want to show a user their 'Pages'.
 *
 * This function allows checking whether an entityTypeId is that of a 'Page',
 * by a check against the two types of 'Page' we know currently exist.
 *
 * One potential alternative would be to check whether an entity's type
 * inherits from 'Page'. This would be required if we want users to
 * be able to create their own page types which showed where we list 'Pages'.
 */
export const isPageEntityTypeId = (entityTypeId: VersionedUrl) =>
  pageEntityTypeIds.includes(entityTypeId);

/**
 * A structural query filter to match against any of the system-defined Page types.
 */
export const pageEntityTypeFilter = {
  /**
   * We specify each of these page types individually rather than Page, which they both inherit from,
   * because checking against types involving inheritance is currently slow.
   * Once H-392 is implemented we can replace it with a single check against 'page', and remove ignoreParents
   * @todo update this once H-392 is implemented
   */
  any: pageEntityTypeIds.map((entityTypeId) =>
    generateVersionedUrlMatchingFilter(entityTypeId, { ignoreParents: true }),
  ),
};

export const contentLinkEntityTypeIds: VersionedUrl[] = [
  systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId,
  systemLinkEntityTypes.hasSpatiallyPositionedContent.linkEntityTypeId,
];

export const isContentLinkEntityTypeId = (entityTypeId: VersionedUrl) =>
  contentLinkEntityTypeIds.includes(entityTypeId);

/**
 * Generate a structural query filter for the types which link a block in a Block Collection to its content.
 */
export const contentLinkTypeFilter = {
  any: contentLinkEntityTypeIds.map((entityTypeId) =>
    generateVersionedUrlMatchingFilter(entityTypeId, { ignoreParents: true }),
  ),
};
