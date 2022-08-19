import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { ensureWorkspaceTypesExist } from "@hashintel/hash-api/src/graph/workspace-types";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { UserModel } from "@hashintel/hash-api/src/model";
import { createKratosIdentity } from "@hashintel/hash-api/src/auth/ory-kratos";

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

describe("User model class", () => {
  beforeAll(async () => {
    await ensureWorkspaceTypesExist({ graphApi, logger });
  });

  let createdUser: UserModel;

  let kratosIdentityId: string;

  it("can create a user", async () => {
    const identity = await createKratosIdentity({
      traits: {
        emails: ["alice@example.com"],
      },
    });

    kratosIdentityId = identity.id;

    createdUser = await UserModel.createUser(graphApi, {
      emails: ["alice@example.com"],
      kratosIdentityId,
    });
  });

  it("cannot create a user with a kratos identity id that is already taken", async () => {
    await expect(
      UserModel.createUser(graphApi, {
        emails: ["bob@example.com"],
        kratosIdentityId,
      }),
    ).rejects.toThrowError(`"${kratosIdentityId}" already exists.`);
  });

  it("can get the account id", () => {
    expect(createdUser.getAccountId()).toBeDefined();
  });

  it("can update the shortname of a user", async () => {
    createdUser = await createdUser.updateShortname(graphApi, {
      updatedByAccountId: createdUser.getAccountId(),
      updatedShortname: shortname,
    });
  });

  it("can update the preferred name of a user", async () => {
    createdUser = await createdUser.updatePreferredName(graphApi, {
      updatedByAccountId: createdUser.getAccountId(),
      updatedPreferredName: "Alice",
    });
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
