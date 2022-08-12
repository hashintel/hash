import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { ensureWorkspaceTypesExist } from "@hashintel/hash-api/src/graph/workspace-types";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { UserModel } from "@hashintel/hash-api/src/model";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

const graphApi = createGraphClient(
  { host: graphApiHost, port: graphApiPort },
  logger,
);

const shortname = "alice";

describe("User model class", () => {
  beforeAll(async () => {
    await ensureWorkspaceTypesExist({ graphApi, logger });
  });

  let createdUser: UserModel;

  it("can create a user", async () => {
    createdUser = await UserModel.createUser(graphApi, {
      emails: ["alice@example.com"],
      shortname,
    });
  });

  it("cannot create a user with a shortname that is already taken", async () => {
    await expect(
      UserModel.createUser(graphApi, {
        emails: ["bob@example.com"],
        shortname,
      }),
    ).rejects.toThrowError(/already exists/);
  });

  it("can get a user by its shortname", async () => {
    const fetchedUser = await UserModel.getUserByShortname(graphApi, {
      shortname,
    });

    expect(fetchedUser).not.toBeNull();

    expect(fetchedUser!.entityId).toBe(createdUser.entityId);
  });
});
