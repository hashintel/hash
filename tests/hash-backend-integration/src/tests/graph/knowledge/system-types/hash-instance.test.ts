import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import { getEntityOutgoingLinks } from "@hashintel/hash-api/src/graph/knowledge/primitive/entity";
import { getLinkEntityRightEntity } from "@hashintel/hash-api/src/graph/knowledge/primitive/link-entity";
import {
  addHashInstanceAdmin,
  getHashInstance,
  HashInstance,
  removeHashInstanceAdmin,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/hash-instance";
import {
  isUserHashInstanceAdmin,
  User,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { SYSTEM_TYPES } from "@hashintel/hash-api/src/graph/system-types";
import { systemUserAccountId } from "@hashintel/hash-api/src/graph/system-user";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { createTestUser } from "../../../util";

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

describe("Hash Instance", () => {
  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ graphApi, logger });
  });

  let hashInstance: HashInstance;

  it("can get the hash instance", async () => {
    hashInstance = await getHashInstance(graphContext, {});

    expect(hashInstance).toBeTruthy();
  });

  let testHashInstanceAdmin: User;

  it("can add a hash instance admin", async () => {
    testHashInstanceAdmin = await createTestUser(
      graphApi,
      "hashInstTest",
      logger,
    );

    await addHashInstanceAdmin(graphContext, {
      user: testHashInstanceAdmin,
      actorId: systemUserAccountId,
    });

    const hashOutgoingAdminLinks = await getEntityOutgoingLinks(graphContext, {
      entity: hashInstance.entity,
      linkEntityType: SYSTEM_TYPES.linkEntityType.admin,
    });

    expect(hashOutgoingAdminLinks).toHaveLength(1);

    const [hashOutgoingAdminLink] = hashOutgoingAdminLinks;

    expect(
      await getLinkEntityRightEntity(graphContext, {
        linkEntity: hashOutgoingAdminLink!,
      }),
    ).toEqual(testHashInstanceAdmin.entity);
  });

  it("can determine if user is hash admin", async () => {
    const hasHashInstanceAdmin = await isUserHashInstanceAdmin(graphContext, {
      user: testHashInstanceAdmin,
    });

    expect(hasHashInstanceAdmin).toBeTruthy();
  });

  it("can remove a hash instance admin", async () => {
    await removeHashInstanceAdmin(graphContext, {
      user: testHashInstanceAdmin,
      actorId: systemUserAccountId,
    });

    const hashInstanceOutgoingAdminLinks = await getEntityOutgoingLinks(
      graphContext,
      {
        entity: hashInstance.entity,
        linkEntityType: SYSTEM_TYPES.linkEntityType.admin,
      },
    );

    expect(hashInstanceOutgoingAdminLinks).toHaveLength(0);
  });
});
