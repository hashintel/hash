import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import {
  ensureSystemTypesExist,
  SYSTEM_TYPES,
} from "@hashintel/hash-api/src/graph/system-types";
import {
  OrgMembershipModel,
  OrgModel,
  OrgSize,
  UserModel,
} from "@hashintel/hash-api/src/model";
import { systemAccountId } from "@hashintel/hash-api/src/model/util";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { createTestUser } from "../../util";

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

    testOrg = await OrgModel.createOrg(graphApi, {
      name: "Test org",
      shortname: "test-org",
      providedInfo: {
        orgSize: OrgSize.ElevenToFifty,
      },
      actorId: testUser.entityId,
    });
  });

  let testOrgMembership: OrgMembershipModel;

  it("can create an OrgMembership", async () => {
    testOrgMembership = await OrgMembershipModel.createOrgMembership(graphApi, {
      responsibility: "test",
      org: testOrg,
      actorId: testUser.entityId,
    });

    await testUser.createOutgoingLink(graphApi, {
      linkTypeModel: SYSTEM_TYPES.linkType.hasMembership,
      targetEntityModel: testOrgMembership,
      ownedById: systemAccountId,
      actorId: testUser.entityId,
    });
  });

  it("can get the org of an org membership", async () => {
    const fetchedOrg = await testOrgMembership.getOrg(graphApi);

    expect(fetchedOrg).toEqual(testOrg);
  });

  it("can get the user of an org membership", async () => {
    const fetchedUser = await testOrgMembership.getUser(graphApi);

    expect(fetchedUser?.entityId).toEqual(testUser.entityId);
  });
});
