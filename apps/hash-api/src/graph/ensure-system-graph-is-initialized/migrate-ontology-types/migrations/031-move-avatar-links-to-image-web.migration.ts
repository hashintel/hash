import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { relocateLinksToRightEntityWeb } from "../util";

import type { MigrationFunction } from "../types";

/**
 * This migration moves each `Has Avatar` link into the web of the avatar image it points at, where the link is in a
 * different web. A link outside the image's web is only visible to actors with a role in the web it happens to be in,
 * which for an organization's avatar excludes the other members of the organization.
 */
const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  await relocateLinksToRightEntityWeb(context, authentication, {
    linkEntityTypeBaseUrl:
      systemLinkEntityTypes.hasAvatar.linkEntityTypeBaseUrl,
  });

  return migrationState;
};

export default migrate;
