import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  createKratosIdentity,
  kratosIdentityApi,
} from "@hashintel/hash-api/src/auth/ory-kratos";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import {
  createUser,
  getUserByKratosIdentityId,
  getUserByShortname,
  isUserMemberOfOrg,
  joinOrg,
  updateUserPreferredName,
  updateUserShortname,
  User,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { systemUserAccountId } from "@hashintel/hash-api/src/graph/system-user";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { EntityUuid } from "@hashintel/hash-shared/types";
import { extractEntityUuidFromEntityId } from "@hashintel/hash-subgraph";

import { createTestOrg, generateRandomShortname } from "../../../util";

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

const graphContext: ImpureGraphContext = { graphApi };

describe("User model class", () => {
  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ graphApi, logger });
  });

  let createdUser: User;

  let kratosIdentityId: string;

  it("can create a user", async () => {
    const identity = await createKratosIdentity({
      traits: {
        emails: ["alice@example.com"],
      },
    });

    kratosIdentityId = identity.id;

    createdUser = await createUser(graphContext, {
      emails: ["alice@example.com"],
      kratosIdentityId,
      actorId: systemUserAccountId,
    });
  });

  it("cannot create a user with a kratos identity id that is already taken", async () => {
    await expect(
      createUser(graphContext, {
        emails: ["bob@example.com"],
        kratosIdentityId,
        actorId: systemUserAccountId,
      }),
    ).rejects.toThrowError(`"${kratosIdentityId}" already exists.`);
  });

  it("can update the shortname of a user", async () => {
    createdUser = await updateUserShortname(graphContext, {
      user: createdUser,
      updatedShortname: shortname,
      actorId: createdUser.accountId,
    });
  });

  it("can update the preferred name of a user", async () => {
    createdUser = await updateUserPreferredName(graphContext, {
      user: createdUser,
      updatedPreferredName: "Alice",
      actorId: createdUser.accountId,
    });
  });

  it("can get a user by its shortname", async () => {
    const fetchedUser = await getUserByShortname(graphContext, {
      shortname,
    });

    expect(fetchedUser).not.toBeNull();

    expect(fetchedUser).toEqual(createdUser);
  });

  it("can get a user by its kratos identity id", async () => {
    const fetchedUser = await getUserByKratosIdentityId(graphContext, {
      kratosIdentityId,
    });

    expect(fetchedUser).not.toBeNull();

    expect(fetchedUser).toEqual(createdUser);
  });

  it("can join an org", async () => {
    const testOrg = await createTestOrg(graphApi, "userModelTest", logger);

    const orgEntityUuid = extractEntityUuidFromEntityId(
      testOrg.entity.metadata.editionId.baseId,
    ) as EntityUuid;

    expect(
      await isUserMemberOfOrg(graphContext, {
        user: createdUser,
        orgEntityUuid,
      }),
    ).toBe(false);

    await joinOrg(graphContext, {
      user: createdUser,
      org: testOrg,
      responsibility: "developer",
      actorId: systemUserAccountId,
    });

    expect(
      await isUserMemberOfOrg(graphContext, {
        user: createdUser,
        orgEntityUuid,
      }),
    ).toBe(true);
  });

  afterAll(async () => {
    await kratosIdentityApi.deleteIdentity({ id: kratosIdentityId });
  });
});
