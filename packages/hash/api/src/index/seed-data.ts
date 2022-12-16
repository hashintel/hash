import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { OrgModel, OrgSize } from "./auth/model";
import { ensureUsersAreSeeded } from "./seed-data/seed-users";
import { PageDefinition, seedPages } from "./seed-data/seed-pages";
import { systemUserAccountId } from "./auth/model/entity.model/entity-type/graph/system-user";

// Seed Org with some pages.
const seedOrg = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}): Promise<OrgModel> => {
  const { graphApi, logger } = params;

  const exampleOrgShortname = "example-org";
  const exampleOrgName = "Example";

  const existingOrgModel = await OrgModel.getOrgByShortname(graphApi, {
    shortname: exampleOrgShortname,
  });

  if (existingOrgModel) {
    return existingOrgModel;
  }

  const sharedOrgModel = await OrgModel.createOrg(graphApi, {
    name: exampleOrgName,
    shortname: exampleOrgShortname,
    providedInfo: {
      orgSize: OrgSize.ElevenToFifty,
    },
    actorId: systemUserAccountId,
  });

  logger.info(
    `Development Org available with shortname = "${sharedOrgModel.getShortname()}"`,
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

  await seedPages(pageTitles, sharedOrgModel.getEntityUuid(), params);

  logger.info(
    `Development Org with shortname = "${sharedOrgModel.getShortname()}" now has seeded pages.`,
  );

  return sharedOrgModel;
};

export const seedOrgsAndUsers = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}): Promise<void> => {
  const { graphApi, logger } = params;

  const createdUsers = await ensureUsersAreSeeded(params);

  if (createdUsers.length > 0) {
    const sharedOrgModel = await seedOrg(params);

    for (const user of createdUsers) {
      await user.joinOrg(graphApi, {
        org: sharedOrgModel,
        responsibility: "Member",
        actorId: systemUserAccountId,
      });

      logger.info(
        `User with shortname = "${user.getShortname()}" joined org with shortname = '${sharedOrgModel.getShortname()}'`,
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

      await seedPages(pageTitles, user.getEntityUuid(), params);
      logger.info(
        `Seeded User with shortname = "${user.getShortname()}" now has seeded pages.`,
      );
    }
  }
};
