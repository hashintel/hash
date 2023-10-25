import { Logger } from "@local/hash-backend-utils/logger";
import { OwnedById } from "@local/hash-subgraph";

import { ImpureGraphContext } from "../graph";
import {
  createOrg,
  getOrgByShortname,
  Org,
  OrgSize,
} from "../graph/knowledge/system-types/org";
import { joinOrg } from "../graph/knowledge/system-types/user";
import { systemAccountId } from "../graph/system-accounts";
import { PageDefinition, seedPages } from "./seed-pages";
import { ensureUsersAreSeeded } from "./seed-users";

// Seed Org with some pages.
const seedOrg = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}): Promise<Org> => {
  const authentication = { actorId: systemAccountId };
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
    providedInfo: {
      orgSize: OrgSize.ElevenToFifty,
    },
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
  const authentication = { actorId: systemAccountId };

  const createdUsers = await ensureUsersAreSeeded(params);

  if (createdUsers.length > 0) {
    const sharedOrg = await seedOrg(params);

    for (const user of createdUsers) {
      await joinOrg(context, authentication, {
        userEntityId: user.entity.metadata.recordId.entityId,
        orgEntityId: sharedOrg.entity.metadata.recordId.entityId,
      });

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
