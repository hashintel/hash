import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import {
  ensureWorkspaceTypesExist,
  WORKSPACE_TYPES,
} from "@hashintel/hash-api/src/graph/workspace-types";
import { ensureSystemEntitiesExists } from "@hashintel/hash-api/src/graph/system-entities";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { UserModel, HashInstanceModel } from "@hashintel/hash-api/src/model";
import { workspaceAccountId } from "@hashintel/hash-api/src/model/util";
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

describe("WorkspaceInstance model class", () => {
  beforeAll(async () => {
    await ensureWorkspaceTypesExist({ graphApi, logger });

    await ensureSystemEntitiesExists({ graphApi, logger });
  });

  let hashInstanceModel: HashInstanceModel;

  it("can get the hash instance", async () => {
    hashInstanceModel = await HashInstanceModel.getHashInstanceModel(graphApi);

    expect(hashInstanceModel).toBeTruthy();
  });

  let testWorkspaceAdmin: UserModel;

  it("can add a hash instance admin", async () => {
    testWorkspaceAdmin = await createTestUser(graphApi, "hashInstTest", logger);

    await hashInstanceModel.addAdmin(graphApi, {
      userModel: testWorkspaceAdmin,
      actorId: workspaceAccountId,
    });

    const hashOutgoingAdminLinks = await hashInstanceModel.getOutgoingLinks(
      graphApi,
      {
        linkTypeModel: WORKSPACE_TYPES.linkType.admin,
      },
    );

    expect(hashOutgoingAdminLinks).toHaveLength(1);

    const [hashOutgoingAdminLink] = hashOutgoingAdminLinks;

    expect(hashOutgoingAdminLink?.targetEntityModel).toEqual(
      testWorkspaceAdmin,
    );
  });

  it("can determine if user is hash admin", async () => {
    const hasWorkspaceAdmin = await hashInstanceModel.hasAdmin(graphApi, {
      userModel: testWorkspaceAdmin,
    });

    expect(hasWorkspaceAdmin).toBeTruthy();
  });

  it("can remove a hash instance admin", async () => {
    await hashInstanceModel.removeAdmin(graphApi, {
      userModel: testWorkspaceAdmin,
      actorId: workspaceAccountId,
    });

    const hashInstanceOutgoingAdminLinks =
      await hashInstanceModel.getOutgoingLinks(graphApi, {
        linkTypeModel: WORKSPACE_TYPES.linkType.admin,
      });

    expect(hashInstanceOutgoingAdminLinks).toHaveLength(0);
  });
});
