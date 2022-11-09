import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import {
  ensureSystemTypesExist,
  SYSTEM_TYPES,
} from "@hashintel/hash-api/src/graph/system-types";
import { ensureSystemEntitiesExists } from "@hashintel/hash-api/src/graph/system-entities";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { UserModel, HashInstanceModel } from "@hashintel/hash-api/src/model";
import { systemAccountId } from "@hashintel/hash-api/src/model/util";
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

describe("HashInstance model class", () => {
  beforeAll(async () => {
    await ensureSystemTypesExist({ graphApi, logger });

    await ensureSystemEntitiesExists({ graphApi, logger });
  });

  let hashInstanceModel: HashInstanceModel;

  it("can get the hash instance", async () => {
    hashInstanceModel = await HashInstanceModel.getHashInstanceModel(graphApi);

    expect(hashInstanceModel).toBeTruthy();
  });

  let testHashInstanceAdmin: UserModel;

  it("can add a hash instance admin", async () => {
    testHashInstanceAdmin = await createTestUser(
      graphApi,
      "hashInstTest",
      logger,
    );

    await hashInstanceModel.addAdmin(graphApi, {
      userModel: testHashInstanceAdmin,
      actorId: systemAccountId,
    });

    const hashOutgoingAdminLinks = await hashInstanceModel.getOutgoingLinks(
      graphApi,
      {
        linkTypeModel: SYSTEM_TYPES.linkType.admin,
      },
    );

    expect(hashOutgoingAdminLinks).toHaveLength(1);

    const [hashOutgoingAdminLink] = hashOutgoingAdminLinks;

    expect(hashOutgoingAdminLink?.targetEntityModel).toEqual(
      testHashInstanceAdmin,
    );
  });

  it("can determine if user is hash admin", async () => {
    const hasHashInstanceAdmin = await hashInstanceModel.hasAdmin(graphApi, {
      userModel: testHashInstanceAdmin,
    });

    expect(hasHashInstanceAdmin).toBeTruthy();
  });

  it("can remove a hash instance admin", async () => {
    await hashInstanceModel.removeAdmin(graphApi, {
      userModel: testHashInstanceAdmin,
      actorId: systemAccountId,
    });

    const hashInstanceOutgoingAdminLinks =
      await hashInstanceModel.getOutgoingLinks(graphApi, {
        linkTypeModel: SYSTEM_TYPES.linkType.admin,
      });

    expect(hashInstanceOutgoingAdminLinks).toHaveLength(0);
  });
});
