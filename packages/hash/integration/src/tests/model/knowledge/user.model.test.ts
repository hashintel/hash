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

const graphApi = createGraphClient(logger, {
  host: graphApiHost,
  port: graphApiPort,
});

const shortname = "alice";
const kratosIdentityId = "alice-fake-kratos-id";

describe("User model class", () => {
  beforeAll(async () => {
    await ensureWorkspaceTypesExist({ graphApi, logger });
  });

  let createdUser: UserModel;

  it("can create a user", async () => {
    createdUser = await UserModel.createUser(graphApi, {
      emails: ["alice@example.com"],
      shortname,
      preferredName: "Alice",
      kratosIdentityId,
    });
  });

  it("cannot create a user with a shortname that is already taken", async () => {
    await expect(
      UserModel.createUser(graphApi, {
        emails: ["bob@example.com"],
        shortname,
        preferredName: "Bob",
        kratosIdentityId: "bob-kratos-identity-id",
      }),
    ).rejects.toThrowError(`"${shortname}" already exists.`);
  });

  it("cannot create a user with a kratos identity id that is already taken", async () => {
    await expect(
      UserModel.createUser(graphApi, {
        emails: ["bob@example.com"],
        shortname: "bob",
        kratosIdentityId,
      }),
    ).rejects.toThrowError(`"${kratosIdentityId}" already exists.`);
  });

  it("can get the account id", () => {
    expect(createdUser.getAccountId()).toBeDefined();
  });

  it("can get a user by its shortname", async () => {
    const fetchedUser = await UserModel.getUserByShortname(graphApi, {
      shortname,
    });

    expect(fetchedUser).not.toBeNull();

    expect(fetchedUser).toEqual(createdUser);
  });

  it("can get a user by its kratos identity id", async () => {
    const fetchedUser = await UserModel.getUserByKratosIdentityId(graphApi, {
      kratosIdentityId,
    });

    expect(fetchedUser).not.toBeNull();

    expect(fetchedUser).toEqual(createdUser);
  });
});
