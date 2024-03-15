import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createKratosIdentity,
  kratosIdentityApi,
} from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  createUser,
  getUserByKratosIdentityId,
  getUserByShortname,
  isUserMemberOfOrg,
  joinOrg,
} from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  generateRandomShortname,
} from "../../../util";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

const shortname = generateRandomShortname("userTest");

describe("User model class", () => {
  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });
  });

  afterAll(async () => {
    await resetGraph();
  });

  let createdUser: User;

  let kratosIdentityId: string;

  it("can create a user", async () => {
    const authentication = { actorId: systemAccountId };

    const identity = await createKratosIdentity({
      traits: {
        emails: ["alice@example.com"],
      },
    });

    kratosIdentityId = identity.id;

    createdUser = await createUser(graphContext, authentication, {
      emails: ["alice@example.com"],
      kratosIdentityId,
      shortname,
      displayName: "Alice",
    });
  });

  it("cannot create a user with a kratos identity id that is already taken", async () => {
    const authentication = { actorId: systemAccountId };

    await expect(
      createUser(graphContext, authentication, {
        emails: ["bob@example.com"],
        kratosIdentityId,
      }),
    ).rejects.toThrowError(`"${kratosIdentityId}" already exists.`);
  });

  it("can get a user by its shortname", async () => {
    const authentication = { actorId: createdUser.accountId };

    const fetchedUser = await getUserByShortname(graphContext, authentication, {
      shortname,
    });

    expect(fetchedUser).not.toBeNull();

    expect(fetchedUser).toEqual(createdUser);
  });

  it("can get a user by its kratos identity id", async () => {
    const authentication = { actorId: createdUser.accountId };

    const fetchedUser = await getUserByKratosIdentityId(
      graphContext,
      authentication,
      {
        kratosIdentityId,
      },
    );

    expect(fetchedUser).not.toBeNull();

    expect(fetchedUser).toEqual(createdUser);
  });

  it("can join an org", async () => {
    const authentication = { actorId: systemAccountId };
    const testOrg = await createTestOrg(
      graphContext,
      authentication,
      "userModelTest",
      logger,
    );

    const orgEntityUuid = extractEntityUuidFromEntityId(
      testOrg.entity.metadata.recordId.entityId,
    );

    expect(
      await isUserMemberOfOrg(graphContext, authentication, {
        userEntityId: createdUser.entity.metadata.recordId.entityId,
        orgEntityUuid,
      }),
    ).toBe(false);

    await joinOrg(graphContext, authentication, {
      userEntityId: createdUser.entity.metadata.recordId.entityId,
      orgEntityId: testOrg.entity.metadata.recordId.entityId,
    });

    expect(
      await isUserMemberOfOrg(graphContext, authentication, {
        userEntityId: createdUser.entity.metadata.recordId.entityId,
        orgEntityUuid,
      }),
    ).toBe(true);
  });

  afterAll(async () => {
    await kratosIdentityApi.deleteIdentity({ id: kratosIdentityId });
  });
});
