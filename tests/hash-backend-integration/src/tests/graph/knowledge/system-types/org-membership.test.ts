import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import {
  createOrgMembership,
  getOrgMembershipOrg,
  getOrgMembershipUser,
  OrgMembership,
} from "@apps/hash-api/src/graph/knowledge/system-types/org-membership";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  systemUser,
  systemUserAccountId,
} from "@apps/hash-api/src/graph/system-user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  createTestUser,
} from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();

describe("OrgMembership", () => {
  let testUser: User;

  let testOrg: Org;

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "orgMembershipTest", logger);

    testOrg = await createTestOrg(graphContext, "orgMembershipTest", logger);
  });

  afterAll(async () => {
    await deleteKratosIdentity({
      kratosIdentityId: systemUser.kratosIdentityId,
    });
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });

    await resetGraph();
  });

  let testOrgMembership: OrgMembership;

  it("can create an OrgMembership", async () => {
    const authentication = { actorId: testUser.accountId };

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
    const authentication = { actorId: systemUserAccountId };

    const fetchedOrg = await getOrgMembershipOrg(graphContext, authentication, {
      orgMembership: testOrgMembership,
    });

    expect(fetchedOrg).toEqual(testOrg);
  });

  it("can get the user of an org membership", async () => {
    const authentication = { actorId: systemUserAccountId };

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
