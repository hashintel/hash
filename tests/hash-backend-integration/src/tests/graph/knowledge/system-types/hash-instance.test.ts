import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { getEntityOutgoingLinks } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import { getLinkEntityRightEntity } from "@apps/hash-api/src/graph/knowledge/primitive/link-entity";
import {
  addHashInstanceAdmin,
  getHashInstance,
  HashInstance,
  removeHashInstanceAdmin,
} from "@apps/hash-api/src/graph/knowledge/system-types/hash-instance";
import {
  isUserHashInstanceAdmin,
  User,
} from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { SYSTEM_TYPES } from "@apps/hash-api/src/graph/system-types";
import {
  systemUser,
  systemUserAccountId,
} from "@apps/hash-api/src/graph/system-user";
import { publicUserAccountId } from "@apps/hash-api/src/graphql/context";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();

describe("Hash Instance", () => {
  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });
  });

  afterAll(async () => {
    await deleteKratosIdentity({
      kratosIdentityId: systemUser.kratosIdentityId,
    });

    await resetGraph();
  });

  let hashInstance: HashInstance;

  it("can get the hash instance", async () => {
    hashInstance = await getHashInstance(
      graphContext,
      { actorId: publicUserAccountId },
      {},
    );

    expect(hashInstance).toBeTruthy();
  });

  let testHashInstanceAdmin: User;

  it("can add a hash instance admin", async () => {
    testHashInstanceAdmin = await createTestUser(
      graphContext,
      "hashInstTest",
      logger,
    );

    await addHashInstanceAdmin(
      graphContext,
      { actorId: systemUserAccountId },
      {
        user: testHashInstanceAdmin,
      },
    );

    const authentication = { actorId: testHashInstanceAdmin.accountId };
    const hashOutgoingAdminLinks = await getEntityOutgoingLinks(
      graphContext,
      authentication,
      {
        entityId: hashInstance.entity.metadata.recordId.entityId,
        linkEntityTypeVersionedUrl:
          SYSTEM_TYPES.linkEntityType.admin.schema.$id,
      },
    );

    expect(hashOutgoingAdminLinks).toHaveLength(1);

    const [hashOutgoingAdminLink] = hashOutgoingAdminLinks;

    expect(
      await getLinkEntityRightEntity(graphContext, authentication, {
        linkEntity: hashOutgoingAdminLink!,
      }),
    ).toEqual(testHashInstanceAdmin.entity);
  });

  it("can determine if user is hash admin", async () => {
    const authentication = { actorId: testHashInstanceAdmin.accountId };
    const hasHashInstanceAdmin = await isUserHashInstanceAdmin(
      graphContext,
      authentication,
      {
        user: testHashInstanceAdmin,
      },
    );

    expect(hasHashInstanceAdmin).toBeTruthy();
  });

  it("can remove a hash instance admin", async () => {
    const authentication = { actorId: systemUserAccountId };

    await removeHashInstanceAdmin(graphContext, authentication, {
      user: testHashInstanceAdmin,
    });

    const hashInstanceOutgoingAdminLinks = await getEntityOutgoingLinks(
      graphContext,
      authentication,
      {
        entityId: hashInstance.entity.metadata.recordId.entityId,
        linkEntityTypeVersionedUrl:
          SYSTEM_TYPES.linkEntityType.admin.schema.$id,
      },
    );

    expect(hashInstanceOutgoingAdminLinks).toHaveLength(0);
  });
});
