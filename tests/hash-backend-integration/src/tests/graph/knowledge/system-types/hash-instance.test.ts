import { publicUserAccountId } from "@apps/hash-api/src/auth/public-user-account-id";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import {
  addHashInstanceAdmin,
  removeHashInstanceAdmin,
} from "@apps/hash-api/src/graph/knowledge/system-types/hash-instance";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { AuthenticationContext } from "@apps/hash-api/src/graphql/authentication-context";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  getHashInstance,
  HashInstance,
  isUserHashInstanceAdmin,
} from "@local/hash-backend-utils/hash-instance";
import { Logger } from "@local/hash-backend-utils/logger";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

describe("Hash Instance", () => {
  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });
  });

  afterAll(async () => {
    await resetGraph();
  });

  let hashInstance: HashInstance;

  it("can get the hash instance", async () => {
    hashInstance = await getHashInstance(graphContext, {
      actorId: publicUserAccountId,
    });

    expect(hashInstance).toBeTruthy();
  });

  let testHashInstanceAdmin: User;
  let authentication: AuthenticationContext;

  it("can determine if user is hash admin", async () => {
    testHashInstanceAdmin = await createTestUser(
      graphContext,
      "hashInstTest",
      logger,
    );
    authentication = { actorId: testHashInstanceAdmin.accountId };

    expect(
      await isUserHashInstanceAdmin(graphContext, authentication, {
        userAccountId: testHashInstanceAdmin.accountId,
      }),
    ).toBeFalsy();
  });

  it("can add a hash instance admin", async () => {
    await addHashInstanceAdmin(
      graphContext,
      { actorId: systemAccountId },
      {
        user: testHashInstanceAdmin,
      },
    );

    expect(
      await isUserHashInstanceAdmin(graphContext, authentication, {
        userAccountId: testHashInstanceAdmin.accountId,
      }),
    ).toBeTruthy();
  });

  it("can remove a hash instance admin", async () => {
    await removeHashInstanceAdmin(
      graphContext,
      { actorId: systemAccountId },
      {
        user: testHashInstanceAdmin,
      },
    );

    expect(
      await isUserHashInstanceAdmin(graphContext, authentication, {
        userAccountId: testHashInstanceAdmin.accountId,
      }),
    ).toBeFalsy();
  });
});
