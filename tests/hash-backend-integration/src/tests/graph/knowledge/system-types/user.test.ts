import {
  createKratosIdentity,
  kratosIdentityApi,
} from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import {
  checkEntityPermission,
  updateEntity,
} from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  createUser,
  getUser,
  getUserOrgMemberships,
  isUserMemberOfOrg,
  joinOrg,
} from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import type { EntityId } from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";
import { getWebRoles } from "@local/hash-graph-sdk/principal/web";
import {
  currentTimeInstantTemporalAxes,
  fullDecisionTimeAxis,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolDataTypes,
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { StatusCode } from "@local/status";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteUser, resetGraph } from "../../../admin-server";
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

/**
 * Email addresses that are permitted to sign up in a test environment.
 * See USER_EMAIL_ALLOW_LIST in .env.local
 */
const allowListedEmail = "charlie@example.com";

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
  let orgEntityId: EntityId;
  let membershipLinkEntityId: EntityId;

  it("can create a user", async () => {
    const authentication = { actorId: systemAccountId };

    const identity = await createKratosIdentity({
      traits: {
        emails: ["test-user@example.com"],
      },
      verifyEmails: true,
    });

    createdUser = await createUser(graphContext, authentication, {
      emails: ["test-user@example.com"],
      kratosIdentityId: identity.id,
      shortname,
      displayName: "Alice",
    });

    expect(
      await checkEntityPermission(
        graphContext,
        { actorId: createdUser.accountId },
        {
          entityId: createdUser.entity.entityId,
          permission: "updateEntity",
        },
      ),
    ).toBe(true);

    expect(
      await getActorGroupRole(graphContext.graphApi, authentication, {
        actorId: createdUser.accountId,
        actorGroupId: createdUser.accountId,
      }),
    ).toBe("administrator");

    expect(
      await getActorGroupRole(graphContext.graphApi, authentication, {
        actorId: systemAccountId,
        actorGroupId: createdUser.accountId,
      }),
    ).toBe(null);
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

    const fetchedUser = await getUser(graphContext, authentication, {
      shortname,
    });

    expect(fetchedUser).not.toBeNull();

    expect(fetchedUser).toEqual(createdUser);
  });

  it("can get a user by its shortname with different casing", async () => {
    const authentication = { actorId: createdUser.accountId };

    const fetchedUser = await getUser(graphContext, authentication, {
      shortname: shortname.toUpperCase(),
    });

    expect(fetchedUser).not.toBeNull();
    expect(fetchedUser).toEqual(createdUser);
  });

  it("cannot create a user with a shortname differing only in case", async () => {
    const authentication = { actorId: systemAccountId };

    const identity = await createKratosIdentity({
      traits: {
        emails: ["case-test-user@example.com"],
      },
      verifyEmails: true,
    });

    await expect(
      createUser(graphContext, authentication, {
        emails: ["case-test-user@example.com"],
        kratosIdentityId: identity.id,
        shortname: shortname.toUpperCase(),
        displayName: "Case Test",
      }),
    ).rejects.toThrowError("already exists");
  });

  it("can get a user by its shortname with leading/trailing whitespace", async () => {
    const authentication = { actorId: createdUser.accountId };

    const fetchedUser = await getUser(graphContext, authentication, {
      shortname: `  ${shortname}  `,
    });

    expect(fetchedUser).not.toBeNull();
    expect(fetchedUser).toEqual(createdUser);
  });

  it("can get a user by its kratos identity id", async () => {
    const authentication = { actorId: createdUser.accountId };

    const fetchedUser = await getUser(graphContext, authentication, {
      kratosIdentityId: createdUser.kratosIdentityId,
    });

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

    // Save for deletion tests: the is-member-of link lives in the org's web
    orgEntityId = testOrg.entity.metadata.recordId.entityId;
    const memberships = await getUserOrgMemberships(
      graphContext,
      authentication,
      {
        userEntityId: createdUser.entity.metadata.recordId.entityId,
      },
    );
    expect(memberships).toHaveLength(1);
    membershipLinkEntityId =
      memberships[0]!.linkEntity.metadata.recordId.entityId;
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

  it("rejects replacing the entire property object via empty path", async () => {
    const authentication = { actorId: createdUser.accountId };

    const maliciousProperties = structuredClone(
      createdUser.entity.propertiesWithMetadata,
    );
    maliciousProperties.value[
      "https://hash.ai/@h/types/property-type/enabled-feature-flags/"
    ] = {
      value: [
        {
          value: "admin-flag",
          metadata: {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        },
      ],
    };

    await expect(
      updateEntity(graphContext, authentication, {
        entity: createdUser.entity,
        propertyPatches: [
          {
            op: "replace",
            path: [],
            property: maliciousProperties,
          },
        ],
      }),
    ).rejects.toThrowError(
      "Cannot replace the entire property object on a user entity",
    );
  });

  let incompleteUser: User;

  it("can create an incomplete user", async () => {
    const authentication = { actorId: systemAccountId };

    const identity = await createKratosIdentity({
      traits: {
        emails: [allowListedEmail],
      },
      verifyEmails: true,
    });

    incompleteUser = await createUser(graphContext, authentication, {
      emails: [allowListedEmail],
      kratosIdentityId: identity.id,
    });

    expect(
      await getActorGroupRole(graphContext.graphApi, authentication, {
        actorId: incompleteUser.accountId,
        actorGroupId: incompleteUser.accountId,
      }),
    ).toBe(null);

    await expect(
      checkEntityPermission(
        graphContext,
        { actorId: incompleteUser.accountId },
        {
          entityId: incompleteUser.entity.entityId,
          permission: "updateEntity",
        },
      ),
    ).resolves.toBe(false);
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

    await expect(
      checkEntityPermission(
        graphContext,
        { actorId: incompleteUser.accountId },
        {
          entityId: incompleteUser.entity.entityId,
          permission: "updateEntity",
        },
      ),
    ).resolves.toBe(true);

    expect(
      await getActorGroupRole(graphContext.graphApi, authentication, {
        actorId: incompleteUser.accountId,
        actorGroupId: incompleteUser.accountId,
      }),
    ).toBe("administrator");
  });

  describe("deletion via admin API", () => {
    it("can delete a user by ID", async () => {
      const status = await deleteUser({
        userId: createdUser.accountId,
      });
      expect(status.code).toBe(StatusCode.Ok);
    });

    it("deleted user is no longer in the graph", async () => {
      const fetchedUser = await getUser(
        graphContext,
        { actorId: systemAccountId },
        { kratosIdentityId: createdUser.kratosIdentityId },
      );

      expect(fetchedUser).toBeNull();
    });

    it("Kratos identity is deleted after user deletion by ID", async () => {
      await expect(
        kratosIdentityApi.getIdentity({
          id: createdUser.kratosIdentityId,
        }),
      ).rejects.toThrow();
    });

    it("org entity is still live after user deletion", async () => {
      const { entities } = await queryEntities(
        graphContext,
        { actorId: systemAccountId },
        {
          filter: {
            all: [
              {
                equal: [
                  { path: ["uuid"] },
                  {
                    parameter: extractEntityUuidFromEntityId(orgEntityId),
                  },
                ],
              },
              {
                equal: [
                  { path: ["webId"] },
                  {
                    parameter: extractWebIdFromEntityId(orgEntityId),
                  },
                ],
              },
              { equal: [{ path: ["archived"] }, { parameter: false }] },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
          includePermissions: false,
        },
      );
      expect(entities).toHaveLength(1);
    });

    it("org membership link is no longer live after user deletion", async () => {
      const { entities } = await queryEntities(
        graphContext,
        { actorId: systemAccountId },
        {
          filter: {
            all: [
              {
                equal: [
                  { path: ["uuid"] },
                  {
                    parameter: extractEntityUuidFromEntityId(
                      membershipLinkEntityId,
                    ),
                  },
                ],
              },
              {
                equal: [
                  { path: ["webId"] },
                  {
                    parameter: extractWebIdFromEntityId(membershipLinkEntityId),
                  },
                ],
              },
              { equal: [{ path: ["archived"] }, { parameter: false }] },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
          includePermissions: false,
        },
      );
      expect(entities).toHaveLength(0);
    });

    it("org membership link has archived provenance", async () => {
      const { entities } = await queryEntities(
        graphContext,
        { actorId: systemAccountId },
        {
          filter: {
            all: [
              {
                equal: [
                  { path: ["uuid"] },
                  {
                    parameter: extractEntityUuidFromEntityId(
                      membershipLinkEntityId,
                    ),
                  },
                ],
              },
              {
                equal: [
                  { path: ["webId"] },
                  {
                    parameter: extractWebIdFromEntityId(membershipLinkEntityId),
                  },
                ],
              },
            ],
          },
          temporalAxes: fullDecisionTimeAxis,
          includeDrafts: false,
          includePermissions: false,
        },
      );

      expect(entities.length).toBe(1);
      const archivedLink = entities[entities.length - 1]!;
      expect(
        archivedLink.metadata.provenance.edition.archivedById,
      ).toBeDefined();
    });

    it("can delete a user by email", async () => {
      const status = await deleteUser({
        email: allowListedEmail,
      });
      expect(status.code).toBe(StatusCode.Ok);
    });

    it("Kratos identity is deleted after user deletion by email", async () => {
      await expect(
        kratosIdentityApi.getIdentity({
          id: incompleteUser.kratosIdentityId,
        }),
      ).rejects.toThrow();
    });
  });

  afterAll(async () => {
    await resetGraph();
  });
});
