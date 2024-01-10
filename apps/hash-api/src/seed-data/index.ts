import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { OwnedById } from "@local/hash-subgraph";

import type { ImpureGraphContext } from "../graph/context-types";
import type { Org } from "../graph/knowledge/system-types/org";
import {
  createOrg,
  getOrgByShortname,
} from "../graph/knowledge/system-types/org";
import type { User } from "../graph/knowledge/system-types/user";
import { joinOrg } from "../graph/knowledge/system-types/user";
import type { PageDefinition } from "./seed-pages";
import { seedPages } from "./seed-pages";
import { ensureUsersAreSeeded } from "./seed-users";

export const CACHED_DATA_TYPE_SCHEMAS: Record<VersionedUrl, string> = {
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1":
    "text/1.json",
  "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1":
    "number/1.json",
  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1":
    "boolean/1.json",
  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1":
    "object/1.json",
  "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1":
    "empty_list/1.json",
  "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1":
    "null/1.json",
};

export const CACHED_PROPERTY_TYPE_SCHEMAS: Record<VersionedUrl, string> = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/v/1":
    "original_source/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/v/1":
    "original_file_name/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/v/1":
    "file_size/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/v/1":
    "mime_type/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1":
    "description/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/v/1":
    "original_url/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/v/1":
    "file_name/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/v/1":
    "file_hash/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1":
    "display_name/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/v/1":
    "file_url/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/v/2":
    "textual_content/2.json",
  "https://blockprotocol.org/@hash/types/property-type/query/v/1":
    "query/1.json",
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1":
    "name/1.json",
};

export const CACHED_ENTITY_TYPE_SCHEMAS: Record<VersionedUrl, string> = {
  "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1":
    "link/1.json",
  "https://blockprotocol.org/@hash/types/entity-type/query/v/1": "query/1.json",
  "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1":
    "has_query/1.json",
  "https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/1":
    "thing/1.json",
};

// Seed Org with some pages.
const seedOrg = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
  owner: User;
}): Promise<Org> => {
  const authentication = { actorId: params.owner.accountId };
  const { logger, context } = params;

  const exampleOrgShortname = "example-org";
  const exampleOrgName = "Example";

  const existingOrg = await getOrgByShortname(context, authentication, {
    shortname: exampleOrgShortname,
  });

  if (existingOrg) {
    return existingOrg;
  }

  const sharedOrg = await createOrg(context, authentication, {
    name: exampleOrgName,
    shortname: exampleOrgShortname,
  });

  logger.info(
    `Development Org available with shortname = "${sharedOrg.shortname}"`,
  );

  const pageTitles: PageDefinition[] = [
    {
      title: "First",
    },
    {
      title: "Second",
    },
    {
      title: "Third",
    },
  ];

  await seedPages(
    authentication,
    pageTitles,
    sharedOrg.accountGroupId as OwnedById,
    params,
  );

  logger.info(
    `Development Org with shortname = "${sharedOrg.shortname}" now has seeded pages.`,
  );

  return sharedOrg;
};

export const seedOrgsAndUsers = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}): Promise<void> => {
  const { logger, context } = params;

  const createdUsers = await ensureUsersAreSeeded(params);

  if (createdUsers.length > 0) {
    const orgOwner = createdUsers.find(
      ({ shortname }) => shortname === "alice",
    )!;

    const sharedOrg = await seedOrg({ ...params, owner: orgOwner });

    for (const user of createdUsers) {
      await joinOrg(
        context,
        /** Only the org owner has permission to add members to the organizations */
        { actorId: orgOwner.accountId },
        {
          userEntityId: user.entity.metadata.recordId.entityId,
          orgEntityId: sharedOrg.entity.metadata.recordId.entityId,
        },
      );

      logger.info(
        `User with shortname = "${user.shortname}" joined org with shortname = '${sharedOrg.shortname}'`,
      );

      const pageTitles: PageDefinition[] = [
        {
          title: "First",
          nestedPages: [
            {
              title: "Middle",
              nestedPages: [
                {
                  title: "Leaf",
                },
              ],
            },
          ],
        },
        {
          title: "Second",
        },
        {
          title: "Third",
        },
      ];

      await seedPages(
        { actorId: user.accountId },
        pageTitles,
        user.accountId as OwnedById,
        params,
      );
      logger.info(
        `Seeded User with shortname = "${user.shortname}" now has seeded pages.`,
      );
    }
  }
};
