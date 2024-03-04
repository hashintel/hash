import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import {
  createOrgMembership,
  getOrgMembershipOrg,
  getOrgMembershipUser,
  OrgMembership,
} from "@apps/hash-api/src/graph/knowledge/system-types/org-membership";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { AuthenticationContext } from "@apps/hash-api/src/graphql/authentication-context";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

describe("OrgMembership", () => {
  let testUser: User;

  let testOrg: Org;
  let authentication: AuthenticationContext;

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "orgMembershipTest", logger);
    authentication = { actorId: testUser.accountId };

    testOrg = await createTestOrg(
      graphContext,
      { actorId: testUser.accountId },
      "orgMembershipTest",
      logger,
    );
  });

  afterAll(async () => {
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });

    await resetGraph();
  });

  let testOrgMembership: OrgMembership;

  it("can create an OrgMembership", async () => {
    testOrgMembership = await createOrgMembership(
      graphContext,
      authentication,
      {
        orgEntityId: testOrg.entity.metadata.recordId.entityId,
        userEntityId: testUser.entity.metadata.recordId.entityId,
      },
    );
  });

  it("can get the org of an org membership", async () => {
    const fetchedOrg = await getOrgMembershipOrg(graphContext, authentication, {
      orgMembership: testOrgMembership,
    });

    expect(fetchedOrg).toEqual(testOrg);
  });

  it("can get the user of an org membership", async () => {
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
