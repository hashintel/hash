import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  getPolicyById,
  queryPolicies,
  resolvePoliciesForActor,
} from "@local/hash-graph-sdk/policy";
import type { Policy, PolicyId } from "@rust/hash-graph-authorization/types";
import { beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();
const { graphApi } = graphContext;

describe("Policy CRUD", () => {
  let testUser: User;
  let testPolicy: Policy;

  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "entitytest", logger);

    return async () => {
      await deleteKratosIdentity({
        kratosIdentityId: testUser.kratosIdentityId,
      });

      await resetGraph();
    };
  });

  it("can query all policies", async () => {
    const authentication = { actorId: testUser.accountId };

    const policies = await queryPolicies(graphApi, authentication, {});

    expect(policies.length).toBeGreaterThan(0);
  });

  it("can query system-actor policies", async () => {
    const authentication = { actorId: testUser.accountId };

    const policies = await queryPolicies(graphApi, authentication, {
      principal: {
        filter: "constrained",
        type: "actor",
        actorType: "machine",
        id: systemAccountId,
      },
    });

    expect(policies.length).toBeGreaterThan(0);
    testPolicy = policies[0]!;
  });

  it("can get specific policies", async () => {
    const authentication = { actorId: testUser.accountId };

    expect(
      await getPolicyById(graphApi, authentication, testPolicy.id),
    ).toStrictEqual(testPolicy);

    expect(
      await getPolicyById(
        graphApi,
        authentication,
        "00000000-0000-0000-0000-000000000000" as PolicyId,
      ),
    ).toBeNull();
  });

  it("can find policies for an actor", async () => {
    const authentication = { actorId: testUser.accountId };

    expect(
      await resolvePoliciesForActor(graphApi, authentication, {
        actorType: "machine",
        id: systemAccountId,
      }),
    ).toContainEqual(testPolicy);

    expect(
      await resolvePoliciesForActor(graphApi, authentication, {
        actorType: "user",
        id: testUser.accountId,
      }),
    ).toStrictEqual([]);
  });
});
