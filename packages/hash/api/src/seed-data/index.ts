import { Logger } from "@hashintel/hash-backend-utils/logger";
import {
  SYSTEM_ACCOUNT_NAME,
  SYSTEM_ACCOUNT_SHORTNAME,
} from "@hashintel/hash-shared/environment";
import { GraphApi } from "@hashintel/hash-graph-client";
import { OrgModel, OrgSize } from "../model";
import { systemAccountId } from "../model/util";
import { ensureUsersAreSeeded } from "./seed-users";
import { PageDefinition, seedPages } from "./seed-pages";

// Seed Org with some pages.
const seedOrg = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}): Promise<OrgModel> => {
  const { graphApi, logger } = params;

  const existingOrgModel = await OrgModel.getOrgByShortname(graphApi, {
    shortname: SYSTEM_ACCOUNT_SHORTNAME,
  });

  if (existingOrgModel) {
    return existingOrgModel;
  }

  const sharedOrgModel = await OrgModel.createOrg(graphApi, {
    name: SYSTEM_ACCOUNT_NAME,
    shortname: SYSTEM_ACCOUNT_SHORTNAME,
    providedInfo: {
      orgSize: OrgSize.ElevenToFifty,
    },
    actorId: systemAccountId,
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

  await seedPages(pageTitles, sharedOrgModel.entityId, params);

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
        actorId: systemAccountId,
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

      await seedPages(pageTitles, user.entityId, params);
      logger.info(
        `Seeded User with shortname = "${user.getShortname()}" now has seeded pages.`,
      );
    }
  }
};
