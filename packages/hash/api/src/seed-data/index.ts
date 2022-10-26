import { Logger } from "@hashintel/hash-backend-utils/logger";
import {
  WORKSPACE_ACCOUNT_NAME,
  WORKSPACE_ACCOUNT_SHORTNAME,
} from "@hashintel/hash-backend-utils/system";
import { GraphApi } from "@hashintel/hash-graph-client";
import { OrgModel, OrgSize } from "../model";
import { workspaceAccountId } from "../model/util";
import { ensureDevUsersAreSeeded } from "./dev-users";
import { PageDefinition, seedPages } from "./seed-pages";

// Seed Org with some pages.
const seedOrg = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}): Promise<OrgModel> => {
  const { graphApi, logger } = params;

  const sharedOrgModel = await OrgModel.createOrg(graphApi, {
    name: WORKSPACE_ACCOUNT_NAME,
    shortname: WORKSPACE_ACCOUNT_SHORTNAME,
    providedInfo: {
      orgSize: OrgSize.ElevenToFifty,
    },
    actorId: workspaceAccountId,
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

  const createdUsers = await ensureDevUsersAreSeeded(params);
  if (createdUsers.length > 0) {
    const sharedOrgModel = await seedOrg(params);

    for (const user of createdUsers) {
      await user.joinOrg(graphApi, {
        org: sharedOrgModel,
        responsibility: "Member",
        actorId: workspaceAccountId,
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
        `Development User with shortname = "${user.getShortname()}" now has seeded pages.`,
      );
    }
  }
};
