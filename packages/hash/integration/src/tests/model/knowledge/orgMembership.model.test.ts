import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import {
  ensureWorkspaceTypesExist,
  WORKSPACE_TYPES,
} from "@hashintel/hash-api/src/graph/workspace-types";
import {
  OrgMembershipModel,
  OrgModel,
  OrgSize,
  UserModel,
} from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import {
  createKratosIdentity,
  adminKratosSdk,
} from "@hashintel/hash-api/src/auth/ory-kratos";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "org-membership-tests",
});

const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

const graphApi = createGraphClient(logger, {
  host: graphApiHost,
  port: graphApiPort,
});

describe("OrgMembership model class", () => {
  let kratosIdentityId: string;

  let testUser: UserModel;

  let testOrg: OrgModel;

  beforeAll(async () => {
    await ensureWorkspaceTypesExist({ graphApi, logger });

    const testUserIdentity = await createKratosIdentity({
      traits: {
        emails: ["test@example.com"],
      },
    });

    kratosIdentityId = testUserIdentity.id;

    testUser = await UserModel.createUser(graphApi, {
      emails: ["alice@example.com"],
      kratosIdentityId,
    });

    testOrg = await OrgModel.createOrg(graphApi, {
      name: "Test org",
      shortname: "test-org",
      providedInfo: {
        orgSize: OrgSize.ElevenToFifty,
      },
    });
  });

  let testOrgMembership: OrgMembershipModel;

  it("can create an OrgMembership", async () => {
    testOrgMembership = await OrgMembershipModel.createOrgMembership(graphApi, {
      responsibility: "test",
      org: testOrg,
    });

    await testUser.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.hasMembership,
      targetEntityModel: testOrgMembership,
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

  afterAll(async () => {
    await adminKratosSdk.adminDeleteIdentity(kratosIdentityId);
  });
});
