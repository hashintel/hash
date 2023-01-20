import {
  createKratosIdentity,
  kratosIdentityApi,
} from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import {
  createUser,
  getUserByKratosIdentityId,
  getUserByShortname,
  isUserMemberOfOrg,
  joinOrg,
  updateUserPreferredName,
  updateUserShortname,
  User,
} from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemUserAccountId } from "@apps/hash-api/src/graph/system-user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { EntityUuid } from "@local/hash-isomorphic-utils/types";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";

import {
  createTestImpureGraphContext,
  createTestOrg,
  generateRandomShortname,
} from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();

const shortname = generateRandomShortname("userTest");

describe("User model class", () => {
  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });
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
    const testOrg = await createTestOrg(graphContext, "userModelTest", logger);

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
