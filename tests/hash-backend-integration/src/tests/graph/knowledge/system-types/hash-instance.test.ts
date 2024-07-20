import { beforeAll, describe, expect, test } from "vitest";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import {
  addHashInstanceAdmin,
  removeHashInstanceAdmin,
} from "@apps/hash-api/src/graph/knowledge/system-types/hash-instance";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import type {
  getHashInstance,
  HashInstance,
  isUserHashInstanceAdmin,
} from "@local/hash-backend-utils/hash-instance";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

describe("hash Instance", () => {
  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    return async () => {
      await resetGraph();
    };
  });

  let hashInstance: HashInstance;

  test("can get the hash instance", async () => {
    hashInstance = await getHashInstance(graphContext, {
      actorId: publicUserAccountId,
    });

    expect(hashInstance).toBeTruthy();
  });

  let testHashInstanceAdmin: User;
  let authentication: AuthenticationContext;

  test("can determine if user is hash admin", async () => {
    testHashInstanceAdmin = await createTestUser(
      graphContext,
      "hashInstTest",
      logger,
    );
    authentication = { actorId: testHashInstanceAdmin.accountId };

    await expect(
      isUserHashInstanceAdmin(graphContext, authentication, {
        userAccountId: testHashInstanceAdmin.accountId,
      }),
    ).resolves.toBeFalsy();
  });

  test("can add a hash instance admin", async () => {
    await addHashInstanceAdmin(
      graphContext,
      { actorId: systemAccountId },
      {
        user: testHashInstanceAdmin,
      },
    );

    await expect(
      isUserHashInstanceAdmin(graphContext, authentication, {
        userAccountId: testHashInstanceAdmin.accountId,
      }),
    ).resolves.toBeTruthy();
  });

  test("can remove a hash instance admin", async () => {
    await removeHashInstanceAdmin(
      graphContext,
      { actorId: systemAccountId },
      {
        user: testHashInstanceAdmin,
      },
    );

    await expect(
      isUserHashInstanceAdmin(graphContext, authentication, {
        userAccountId: testHashInstanceAdmin.accountId,
      }),
    ).resolves.toBeFalsy();
  });
});
