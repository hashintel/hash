import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import { SYSTEM_TYPES } from "@hashintel/hash-api/src/graph/system-types";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { systemUserAccountId } from "@hashintel/hash-api/src/graph/system-user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
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
import { getEntityOutgoingLinks } from "@hashintel/hash-api/src/graph/knowledge/primitive/entity";
import { getLinkEntityRightEntity } from "@hashintel/hash-api/src/graph/knowledge/primitive/link-entity";
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

const ctx: ImpureGraphContext = { graphApi };

describe("Hash Instance", () => {
  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ graphApi, logger });
  });

  let hashInstance: HashInstance;

  it("can get the hash instance", async () => {
    hashInstance = await getHashInstance(ctx, {});

    expect(hashInstance).toBeTruthy();
  });

  let testHashInstanceAdmin: User;

  it("can add a hash instance admin", async () => {
    testHashInstanceAdmin = await createTestUser(
      graphApi,
      "hashInstTest",
      logger,
    );

    await addHashInstanceAdmin(ctx, {
      user: testHashInstanceAdmin,
      actorId: systemUserAccountId,
    });

    const hashOutgoingAdminLinks = await getEntityOutgoingLinks(ctx, {
      entity: hashInstance.entity,
      linkEntityType: SYSTEM_TYPES.linkEntityType.admin,
    });

    expect(hashOutgoingAdminLinks).toHaveLength(1);

    const [hashOutgoingAdminLink] = hashOutgoingAdminLinks;

    expect(
      await getLinkEntityRightEntity(ctx, {
        linkEntity: hashOutgoingAdminLink!,
      }),
    ).toEqual(testHashInstanceAdmin.entity);
  });

  it("can determine if user is hash admin", async () => {
    const hasHashInstanceAdmin = await isUserHashInstanceAdmin(ctx, {
      user: testHashInstanceAdmin,
    });

    expect(hasHashInstanceAdmin).toBeTruthy();
  });

  it("can remove a hash instance admin", async () => {
    await removeHashInstanceAdmin(ctx, {
      user: testHashInstanceAdmin,
      actorId: systemUserAccountId,
    });

    const hashInstanceOutgoingAdminLinks = await getEntityOutgoingLinks(ctx, {
      entity: hashInstance.entity,
      linkEntityType: SYSTEM_TYPES.linkEntityType.admin,
    });

    expect(hashInstanceOutgoingAdminLinks).toHaveLength(0);
  });
});
