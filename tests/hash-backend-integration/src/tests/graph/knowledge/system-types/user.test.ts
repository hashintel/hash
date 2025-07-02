import {
  createKratosIdentity,
  kratosIdentityApi,
} from "@apps/hash-api/src/auth/ory-kratos";
import {
  isActorGroupAdministrator,
  isActorGroupMember,
} from "@apps/hash-api/src/graph/account-permission-management";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { updateEntity } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  createUser,
  getUserByKratosIdentityId,
  getUserByShortname,
  isUserMemberOfOrg,
  joinOrg,
} from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { getWebRoles } from "@local/hash-graph-sdk/principal/web";
import {
  blockProtocolDataTypes,
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  generateRandomShortname,
} from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

const shortname = generateRandomShortname("userTest");

describe("User model class", () => {
  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({
      logger,
      context: graphContext,
      seedSystemPolicies: true,
    });
  });

  afterAll(async () => {
    await resetGraph();
  });

  let createdUser: User;

  it("can create a user", async () => {
    const authentication = { actorId: systemAccountId };

    const identity = await createKratosIdentity({
      traits: {
        emails: ["test-user@example.com"],
      },
    });

    createdUser = await createUser(graphContext, authentication, {
      emails: ["test-user@example.com"],
      kratosIdentityId: identity.id,
      shortname,
      displayName: "Alice",
    });

    expect(
      await isActorGroupAdministrator(graphContext, authentication, {
        actorId: createdUser.accountId,
        actorGroupId: createdUser.accountId,
      }),
    ).toBe(true);
    expect(
      await isActorGroupMember(graphContext, authentication, {
        actorId: createdUser.accountId,
        actorGroupId: createdUser.accountId,
      }),
    ).toBe(false);

    expect(
      await isActorGroupAdministrator(graphContext, authentication, {
        actorId: systemAccountId,
        actorGroupId: createdUser.accountId,
      }),
    ).toBe(false);
    expect(
      await isActorGroupMember(graphContext, authentication, {
        actorId: systemAccountId,
        actorGroupId: createdUser.accountId,
      }),
    ).toBe(false);
  });

  it("cannot create a user with a kratos identity id that is already taken", async () => {
    const authentication = { actorId: systemAccountId };

    await expect(
      createUser(graphContext, authentication, {
        emails: ["bob@example.com"],
        kratosIdentityId: createdUser.kratosIdentityId,
      }),
    ).rejects.toThrowError(`"${createdUser.kratosIdentityId}" already exists.`);
  });

  it("can get a user by its shortname", async () => {
    const authentication = { actorId: createdUser.accountId };

    const fetchedUser = await getUserByShortname(graphContext, authentication, {
      shortname,
    });

    expect(fetchedUser).not.toBeNull();

    expect(fetchedUser).toEqual(createdUser);
  });

  it("can get a user by its kratos identity id", async () => {
    const authentication = { actorId: createdUser.accountId };

    const fetchedUser = await getUserByKratosIdentityId(
      graphContext,
      authentication,
      {
        kratosIdentityId: createdUser.kratosIdentityId,
      },
    );

    expect(fetchedUser).not.toBeNull();

    expect(fetchedUser).toEqual(createdUser);
  });

  it("can join an org", async () => {
    const authentication = { actorId: systemAccountId };
    const testOrg = await createTestOrg(
      graphContext,
      authentication,
      "userModelTest",
    );

    const orgEntityUuid = extractEntityUuidFromEntityId(
      testOrg.entity.metadata.recordId.entityId,
    );

    expect(
      await isUserMemberOfOrg(graphContext, authentication, {
        userEntityId: createdUser.entity.metadata.recordId.entityId,
        orgEntityUuid,
      }),
    ).toBe(false);

    await joinOrg(graphContext, authentication, {
      userEntityId: createdUser.entity.metadata.recordId.entityId,
      orgEntityId: testOrg.entity.metadata.recordId.entityId,
    });

    expect(
      await isUserMemberOfOrg(graphContext, authentication, {
        userEntityId: createdUser.entity.metadata.recordId.entityId,
        orgEntityUuid,
      }),
    ).toBe(true);
  });

  it("can read the user-web roles", async () => {
    const authentication = { actorId: systemAccountId };

    const UserWebRoleMap = await getWebRoles(
      graphContext.graphApi,
      authentication,
      createdUser.accountId,
    );

    expect(Object.keys(UserWebRoleMap).length).toStrictEqual(2);

    const userWebRoles = Object.values(UserWebRoleMap).map(
      ({ webId, name }) => ({
        webId,
        name,
      }),
    );

    expect(userWebRoles).toContainEqual({
      webId: createdUser.accountId,
      name: "member",
    });
    expect(userWebRoles).toContainEqual({
      webId: createdUser.accountId,
      name: "administrator",
    });
  });

  let incompleteUser: User;

  it("can create an incomplete user", async () => {
    const authentication = { actorId: systemAccountId };

    const identity = await createKratosIdentity({
      traits: {
        emails: ["incomplete-user@example.com"],
      },
    });

    incompleteUser = await createUser(graphContext, authentication, {
      emails: ["incomplete-user@example.com"],
      kratosIdentityId: identity.id,
    });

    expect(
      await isActorGroupAdministrator(graphContext, authentication, {
        actorId: incompleteUser.accountId,
        actorGroupId: incompleteUser.accountId,
      }),
    ).toBe(false);
    expect(
      await isActorGroupMember(graphContext, authentication, {
        actorId: incompleteUser.accountId,
        actorGroupId: incompleteUser.accountId,
      }),
    ).toBe(false);

    expect(
      await isActorGroupAdministrator(graphContext, authentication, {
        actorId: systemAccountId,
        actorGroupId: incompleteUser.accountId,
      }),
    ).toBe(true);
    expect(
      await isActorGroupMember(graphContext, authentication, {
        actorId: systemAccountId,
        actorGroupId: incompleteUser.accountId,
      }),
    ).toBe(false);
  });

  it("can update shortname of incomplete user", async () => {
    const authentication = { actorId: incompleteUser.accountId };

    await updateEntity(graphContext, authentication, {
      entity: incompleteUser.entity,
      propertyPatches: [
        {
          op: "add",
          path: [systemPropertyTypes.shortname.propertyTypeBaseUrl],
          property: {
            value: "incomplete",
            metadata: {
              dataTypeId: blockProtocolDataTypes.text.dataTypeId,
            },
          },
        },
        {
          op: "add",
          path: [blockProtocolPropertyTypes.displayName.propertyTypeBaseUrl],
          property: {
            value: "Now complete",
            metadata: {
              dataTypeId: blockProtocolDataTypes.text.dataTypeId,
            },
          },
        },
      ],
    });

    expect(
      await isActorGroupAdministrator(graphContext, authentication, {
        actorId: incompleteUser.accountId,
        actorGroupId: incompleteUser.accountId,
      }),
    ).toBe(true);
    expect(
      await isActorGroupMember(graphContext, authentication, {
        actorId: incompleteUser.accountId,
        actorGroupId: incompleteUser.accountId,
      }),
    ).toBe(false);

    expect(
      await isActorGroupAdministrator(graphContext, authentication, {
        actorId: systemAccountId,
        actorGroupId: incompleteUser.accountId,
      }),
    ).toBe(false);
    expect(
      await isActorGroupMember(graphContext, authentication, {
        actorId: systemAccountId,
        actorGroupId: incompleteUser.accountId,
      }),
    ).toBe(false);
  });

  afterAll(async () => {
    await kratosIdentityApi.deleteIdentity({
      id: createdUser.kratosIdentityId,
    });
    await kratosIdentityApi.deleteIdentity({
      id: incompleteUser.kratosIdentityId,
    });
  });
});
