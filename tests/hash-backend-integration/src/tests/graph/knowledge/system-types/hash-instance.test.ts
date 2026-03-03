import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import type { TeamId } from "@blockprotocol/type-system";
import type { HashInstance } from "@local/hash-backend-utils/hash-instance";
import { getHashInstance } from "@local/hash-backend-utils/hash-instance";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import {
  addActorGroupMember,
  getActorGroupMembers,
  getActorGroupRole,
  removeActorGroupMember,
} from "@local/hash-graph-sdk/principal/actor-group";
import { getInstanceAdminsTeam } from "@local/hash-graph-sdk/principal/hash-instance-admins";
import { getTeamRoles } from "@local/hash-graph-sdk/principal/team";
import { beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

describe("Hash Instance", () => {
  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({
      logger,
      context: graphContext,
      seedSystemPolicies: true,
    });

    return async () => {
      await resetGraph();
    };
  });

  let hashInstance: HashInstance;

  it("can get the hash instance", async () => {
    hashInstance = await getHashInstance(graphContext, {
      actorId: publicUserAccountId,
    });

    expect(hashInstance).toBeTruthy();
  });

  let instanceAdminTeamId: TeamId;

  it("can get the instance admin team id", async () => {
    const { id: teamId } = await getInstanceAdminsTeam(graphContext, {
      actorId: systemAccountId,
    });
    instanceAdminTeamId = teamId;
    expect(instanceAdminTeamId).toBeTruthy();
  });

  let testHashInstanceAdmin: User;
  let authentication: AuthenticationContext;

  it("can determine if user is hash admin", async () => {
    testHashInstanceAdmin = await createTestUser(
      graphContext,
      "hashInstTest",
      logger,
    );
    authentication = { actorId: testHashInstanceAdmin.accountId };

    expect(
      await getActorGroupRole(graphContext.graphApi, authentication, {
        actorId: testHashInstanceAdmin.accountId,
        actorGroupId: instanceAdminTeamId,
      }),
    ).toBe(null);
  });

  it("can add a hash instance admin", async () => {
    expect(
      await getActorGroupMembers(
        graphContext.graphApi,
        {
          actorId: systemAccountId,
        },
        {
          actorGroupId: instanceAdminTeamId,
        },
      ),
    ).not.toContain(testHashInstanceAdmin.accountId);

    expect(
      await getActorGroupRole(graphContext.graphApi, authentication, {
        actorId: testHashInstanceAdmin.accountId,
        actorGroupId: instanceAdminTeamId,
      }),
    ).toBe(null);

    await addActorGroupMember(
      graphContext.graphApi,
      { actorId: systemAccountId },
      {
        actorId: testHashInstanceAdmin.accountId,
        actorGroupId: instanceAdminTeamId,
      },
    );
  });

  it("can get the hash instance group members", async () => {
    expect(
      await getActorGroupRole(graphContext.graphApi, authentication, {
        actorId: testHashInstanceAdmin.accountId,
        actorGroupId: instanceAdminTeamId,
      }),
    ).toBe("member");

    expect(
      await getActorGroupMembers(
        graphContext.graphApi,
        {
          actorId: systemAccountId,
        },
        {
          actorGroupId: instanceAdminTeamId,
        },
      ),
    ).toContain(testHashInstanceAdmin.accountId);
  });

  it("can remove a hash instance admin", async () => {
    await removeActorGroupMember(
      graphContext.graphApi,
      { actorId: systemAccountId },
      {
        actorId: testHashInstanceAdmin.accountId,
        actorGroupId: instanceAdminTeamId,
      },
    );

    expect(
      await getActorGroupMembers(
        graphContext.graphApi,
        {
          actorId: systemAccountId,
        },
        {
          actorGroupId: instanceAdminTeamId,
        },
      ),
    ).not.toContain(testHashInstanceAdmin.accountId);

    expect(
      await getActorGroupRole(graphContext.graphApi, authentication, {
        actorId: testHashInstanceAdmin.accountId,
        actorGroupId: instanceAdminTeamId,
      }),
    ).toBe(null);
  });

  it("can read the hash instance team roles", async () => {
    const teamRoleMap = await getTeamRoles(
      graphContext.graphApi,
      authentication,
      instanceAdminTeamId,
    );

    expect(Object.keys(teamRoleMap).length).toStrictEqual(2);

    const teamRoles = Object.values(teamRoleMap).map(({ teamId, name }) => ({
      teamId,
      name,
    }));
    expect(teamRoles).toContainEqual({
      teamId: instanceAdminTeamId,
      name: "member",
    });
    expect(teamRoles).toContainEqual({
      teamId: instanceAdminTeamId,
      name: "administrator",
    });
  });
});
