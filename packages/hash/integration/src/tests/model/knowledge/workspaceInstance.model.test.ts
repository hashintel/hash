import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import {
  ensureWorkspaceTypesExist,
  WORKSPACE_TYPES,
} from "@hashintel/hash-api/src/graph/workspace-types";
import { ensureWorkspaceKnowledgeExists } from "@hashintel/hash-api/src/graph/workspace-knowledge";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import {
  UserModel,
  WorkspaceInstanceModel,
} from "@hashintel/hash-api/src/model";
import { workspaceAccountId } from "@hashintel/hash-api/src/model/util";
import { createTestUser } from "../../util";

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

describe("WorkspaceInstance model class", () => {
  beforeAll(async () => {
    await ensureWorkspaceTypesExist({ graphApi, logger });

    await ensureWorkspaceKnowledgeExists({ graphApi, logger });
  });

  let workspaceInstanceModel: WorkspaceInstanceModel;

  it("can get the workspace instance", async () => {
    workspaceInstanceModel =
      await WorkspaceInstanceModel.getWorkspaceInstanceModel(graphApi);

    expect(workspaceInstanceModel).toBeTruthy();
  });

  let testWorkspaceAdmin: UserModel;

  it("can add a workspace instance admin", async () => {
    testWorkspaceAdmin = await createTestUser(
      graphApi,
      "workspaceInstTest",
      logger,
    );

    await workspaceInstanceModel.addAdmin(graphApi, {
      userModel: testWorkspaceAdmin,
      actorId: workspaceAccountId,
    });

    const workspaceOutgoingAdminLinks =
      await workspaceInstanceModel.getOutgoingLinks(graphApi, {
        linkTypeModel: WORKSPACE_TYPES.linkType.admin,
      });

    expect(workspaceOutgoingAdminLinks).toHaveLength(1);

    const [workspaceOutgoingAdminLink] = workspaceOutgoingAdminLinks;

    expect(workspaceOutgoingAdminLink?.targetEntityModel).toEqual(
      testWorkspaceAdmin,
    );
  });

  it("can determine if user is workspace admin", async () => {
    const hasWorkspaceAdmin = await workspaceInstanceModel.hasAdmin(graphApi, {
      userModel: testWorkspaceAdmin,
    });

    expect(hasWorkspaceAdmin).toBeTruthy();
  });

  it("can remove a workspace instance admin", async () => {
    await workspaceInstanceModel.removeAdmin(graphApi, {
      userModel: testWorkspaceAdmin,
      actorId: workspaceAccountId,
    });

    const workspaceOutgoingAdminLinks =
      await workspaceInstanceModel.getOutgoingLinks(graphApi, {
        linkTypeModel: WORKSPACE_TYPES.linkType.admin,
      });

    expect(workspaceOutgoingAdminLinks).toHaveLength(0);
  });
});
