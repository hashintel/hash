import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import { Org } from "@hashintel/hash-api/src/graph/knowledge/system-types/org";
import {
  createOrgMembership,
  getOrgMembershipOrg,
  getOrgMembershipUser,
  OrgMembership,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/org-membership";
import { User } from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { createTestOrg, createTestUser } from "../../../util";

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

const graphContext: ImpureGraphContext = { graphApi };

describe("OrgMembership", () => {
  let testUser: User;

  let testOrg: Org;

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ graphApi, logger });

    testUser = await createTestUser(graphApi, "orgMembershipTest", logger);

    testOrg = await createTestOrg(graphApi, "orgMembershipTest", logger);
  });

  let testOrgMembership: OrgMembership;

  it("can create an OrgMembership", async () => {
    testOrgMembership = await createOrgMembership(graphContext, {
      responsibility: "test",
      org: testOrg,
      actorId: testUser.accountId,
      user: testUser,
    });
  });

  it("can get the org of an org membership", async () => {
    const fetchedOrg = await getOrgMembershipOrg(graphContext, {
      orgMembership: testOrgMembership,
    });

    expect(fetchedOrg).toEqual(testOrg);
  });

  it("can get the user of an org membership", async () => {
    const fetchedUser = await getOrgMembershipUser(graphContext, {
      orgMembership: testOrgMembership,
    });

    expect(fetchedUser.entity).toEqual(testUser.entity);
  });
});
