import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { ensureSystemTypesExist } from "@hashintel/hash-api/src/graph/system-types";
import {
  OrgMembershipModel,
  OrgModel,
  UserModel,
} from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { createTestOrg, createTestUser } from "../../util";

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

describe("OrgMembership model class", () => {
  let testUser: UserModel;

  let testOrg: OrgModel;

  beforeAll(async () => {
    await ensureSystemTypesExist({ graphApi, logger });
    testUser = await createTestUser(graphApi, "orgMembershipTest", logger);

    testOrg = await createTestOrg(graphApi, "orgMembershipTest", logger);
  });

  let testOrgMembership: OrgMembershipModel;

  it("can create an OrgMembership", async () => {
    testOrgMembership = await OrgMembershipModel.createOrgMembership(graphApi, {
      responsibility: "test",
      org: testOrg,
      actorId: testUser.getEntityUuid(),
      user: testUser,
    });
  });

  it("can get the org of an org membership", async () => {
    const fetchedOrg = await testOrgMembership.getOrg(graphApi);

    expect(fetchedOrg).toEqual(testOrg);
  });

  it("can get the user of an org membership", async () => {
    const fetchedUser = await testOrgMembership.getUser(graphApi);

    expect(fetchedUser?.entity).toEqual(testUser.entity);
  });
});
