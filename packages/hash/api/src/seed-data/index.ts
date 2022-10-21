import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { OrgModel, OrgSize, UserModel } from "../model";
import { workspaceAccountId } from "../model/util";
import { ensureDevUsersAreSeeded } from "./dev-users";
import { PageList, seedPages } from "./seed-pages";

const seedUserContent = async (
  user: UserModel,
  sharedOrg: OrgModel,
  params: {
    graphApi: GraphApi;
    logger: Logger;
  },
): Promise<void> => {
  const { graphApi, logger } = params;

  await user.joinOrg(graphApi, {
    org: sharedOrg,
    responsibility: "Member",
    actorId: workspaceAccountId,
  });

  logger.info(
    `User with shortname = "${user.getShortname()}" joined org with shortname = '${sharedOrg.getShortname()}'`,
  );

  const pageTitles: PageList = [["First", "Leaf"], "Second", "Third"];

  await seedPages(pageTitles, user.entityId, params);
  logger.info(
    `Development User with shortname = "${user.getShortname()}" created ${
      pageTitles.flat().length
    } new pages.`,
  );
};

// Seed Org with some pages.
const seedOrg = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}): Promise<OrgModel> => {
  const { graphApi, logger } = params;

  const sharedOrgModel = await OrgModel.createOrg(graphApi, {
    name: "HASH",
    shortname: "hash",
    providedInfo: {
      orgSize: OrgSize.ElevenToFifty,
    },
    actorId: workspaceAccountId,
  });

  logger.info(
    `Development Org available with shortname = "${sharedOrgModel.getShortname()}"`,
  );

  const pageTitles: PageList = [
    "Org page one",
    "Org page two",
    "Org page three",
  ];

  await seedPages(pageTitles, sharedOrgModel.entityId, params);

  logger.info(
    `Development Org with shortname = "${sharedOrgModel.getShortname()}" created ${
      pageTitles.flat().length
    } new pages.`,
  );

  return sharedOrgModel;
};

export const seedOrgsAndUsers = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}): Promise<void> => {
  const createdUsers = await ensureDevUsersAreSeeded(params);
  if (createdUsers.length > 0) {
    const sharedOrgModel = await seedOrg(params);

    for (const user of createdUsers) {
      await seedUserContent(user, sharedOrgModel, params);
    }
  }
};
