import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { ensureUsersAreSeeded } from "./seed-users";
import { PageDefinition, seedPages } from "./seed-pages";
import { OrgModel } from "../model";

export const seedUsers = async (params: {
  graphApi: GraphApi;
  logger: Logger;
  orgModel: OrgModel;
}): Promise<void> => {
  const { graphApi, logger, orgModel } = params;

  const createdUsers = await ensureUsersAreSeeded({
    ...params,
    systemUserAccountId: orgModel.getEntityUuid(),
  });

  if (createdUsers.length > 0) {
    for (const user of createdUsers) {
      await user.joinOrg(graphApi, {
        org: orgModel,
        responsibility: "Member",
        actorId: orgModel.getEntityUuid(),
      });

      logger.info(
        `User with shortname = "${user.getShortname()}" joined org with shortname = '${orgModel.getShortname()}'`,
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
