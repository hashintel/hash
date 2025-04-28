import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import type { Logger } from "@local/hash-backend-utils/logger";

import type { ImpureGraphContext } from "../graph/context-types";
import type { Org } from "../graph/knowledge/system-types/org";
import {
  createOrg,
  getOrgByShortname,
} from "../graph/knowledge/system-types/org";
import { createOrgMembershipLinkEntity } from "../graph/knowledge/system-types/org-membership";
import type { User } from "../graph/knowledge/system-types/user";
import { joinOrg } from "../graph/knowledge/system-types/user";
import type { PageDefinition } from "./seed-pages";
import { seedPages } from "./seed-pages";
import { ensureUsersAreSeeded } from "./seed-users";

// Seed Org with some pages.
const seedOrg = async (params: {
  logger: Logger;
  context: ImpureGraphContext<false, true>;
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

  await seedPages(authentication, pageTitles, sharedOrg.webId, params);

  logger.info(
    `Development Org with shortname = "${sharedOrg.shortname}" now has seeded pages.`,
  );

  return sharedOrg;
};

export const seedOrgsAndUsers = async (params: {
  logger: Logger;
  context: ImpureGraphContext<false, true>;
}): Promise<void> => {
  const { logger, context } = params;

  const createdUsers = await ensureUsersAreSeeded(params);

  if (createdUsers.length > 0) {
    const orgOwner = createdUsers.find(
      ({ shortname }) => shortname === "alice",
    )!;

    const sharedOrg = await seedOrg({ ...params, owner: orgOwner });

    for (const user of createdUsers) {
      if (
        extractWebIdFromEntityId(user.entity.metadata.recordId.entityId) !==
        orgOwner.accountId
      ) {
        /**
         * For users who AREN'T the org owner, we need to create their full membership,
         * including both the permission system membership, and the link entity in the graph.
         *
         * @todo H-4441 have the Graph handle memberOf link entity creation, as well as permisison handling.
         */
        await joinOrg(
          context,
          /** Only the org owner has permission to add members to the organizations */
          { actorId: orgOwner.accountId },
          {
            userEntityId: user.entity.metadata.recordId.entityId,
            orgEntityId: sharedOrg.entity.metadata.recordId.entityId,
          },
        );
      } else {
        /**
         * For the org owner, we only need to create the link entity in the graph,
         * as the permission system membership is created automatically by the Graph when the org is created.
         *
         * @todo H-4441 have the Graph handle memberOf link entity creation, as well as permisison handling.
         */
        await createOrgMembershipLinkEntity(
          context,
          {
            actorId: user.accountId,
          },
          {
            orgEntityId: sharedOrg.entity.metadata.recordId.entityId,
            userEntityId: user.entity.metadata.recordId.entityId,
          },
        );
      }

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
        user.accountId,
        params,
      );
      logger.info(
        `Seeded User with shortname = "${user.shortname}" now has seeded pages.`,
      );
    }
  }
};
