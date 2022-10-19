import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { ensureDevUsersAreSeeded } from "./dev-users";

export const seedData = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}): Promise<void> => {
  const _users = await ensureDevUsersAreSeeded(params);
};
