import { beforeAll, describe, expect, test } from "vitest";
import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import type {
  createOrgMembership,
  getOrgMembershipOrg,
  getOrgMembershipUser,
  OrgMembership,
} from "@apps/hash-api/src/graph/knowledge/system-types/org-membership";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { Logger } from "@local/hash-backend-utils/logger";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  createTestUser,
} from "../../../util";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

describe("orgMembership", () => {
  let testUser: User;

  let testOrg: Org;
  let authentication: AuthenticationContext;

  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "orgMembershipTest", logger);
    authentication = { actorId: testUser.accountId };

    testOrg = await createTestOrg(
      graphContext,
      { actorId: testUser.accountId },
      "orgMembershipTest",
    );

    return async () => {
      await deleteKratosIdentity({
        kratosIdentityId: testUser.kratosIdentityId,
      });

      await resetGraph();
    };
  });

  let testOrgMembership: OrgMembership;

  test("can create an OrgMembership", async () => {
    testOrgMembership = await createOrgMembership(
      graphContext,
      authentication,
      {
        orgEntityId: testOrg.entity.metadata.recordId.entityId,
        userEntityId: testUser.entity.metadata.recordId.entityId,
      },
    );
  });

  test("can get the org of an org membership", async () => {
    const fetchedOrg = await getOrgMembershipOrg(graphContext, authentication, {
      orgMembership: testOrgMembership,
    });

    expect(fetchedOrg).toEqual(testOrg);
  });

  test("can get the user of an org membership", async () => {
    const fetchedUser = await getOrgMembershipUser(
      graphContext,
      authentication,
      {
        orgMembership: testOrgMembership,
      },
    );

    expect(fetchedUser.entity).toEqual(testUser.entity);
  });
});
