import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph";
import {
  addHashInstanceAdmin,
  getHashInstance,
  HashInstance,
  removeHashInstanceAdmin,
} from "@apps/hash-api/src/graph/knowledge/system-types/hash-instance";
import {
  isUserHashInstanceAdmin,
  User,
} from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { ImpureGraphContext } from "@apps/hash-api/src/graph/util";
import {
  AuthenticationContext,
  publicUserAccountId,
} from "@apps/hash-api/src/graphql/context";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();

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
    hashInstance = await getHashInstance(
      graphContext,
      { actorId: publicUserAccountId },
      {},
    );

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
        user: testHashInstanceAdmin,
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
        user: testHashInstanceAdmin,
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
        user: testHashInstanceAdmin,
      }),
    ).toBeFalsy();
  });
});
