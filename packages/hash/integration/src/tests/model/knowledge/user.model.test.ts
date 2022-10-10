import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { ensureWorkspaceTypesExist } from "@hashintel/hash-api/src/graph/workspace-types";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { OrgModel, OrgSize, UserModel } from "@hashintel/hash-api/src/model";
import {
  adminKratosSdk,
  createKratosIdentity,
} from "@hashintel/hash-api/src/auth/ory-kratos";
import { generateRandomShortname } from "../../util";

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

const shortname = generateRandomShortname("userTest");

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
    expect(createdUser.entityId).toBeDefined();
  });

  it("can update the shortname of a user", async () => {
    createdUser = await createdUser.updateShortname(graphApi, {
      updatedShortname: shortname,
    });
  });

  it("can update the preferred name of a user", async () => {
    createdUser = await createdUser.updatePreferredName(graphApi, {
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

  it("can join an org", async () => {
    const testOrg = await OrgModel.createOrg(graphApi, {
      name: "Test org",
      shortname: "test-org",
      providedInfo: {
        orgSize: OrgSize.ElevenToFifty,
      },
    });

    const { entityId: orgEntityId } = testOrg;

    expect(await createdUser.isMemberOfOrg(graphApi, { orgEntityId })).toBe(
      false,
    );

    await createdUser.joinOrg(graphApi, {
      org: testOrg,
      responsibility: "developer",
    });

    expect(await createdUser.isMemberOfOrg(graphApi, { orgEntityId })).toBe(
      true,
    );
  });

  afterAll(async () => {
    await adminKratosSdk.adminDeleteIdentity(kratosIdentityId);
  });
});
