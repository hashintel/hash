import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  createPolicy,
  deletePolicyById,
  getPolicyById,
  queryPolicies,
  resolvePoliciesForActor,
  updatePolicyById,
} from "@local/hash-graph-sdk/policy";
import type {
  Policy,
  PolicyCreationParams,
  PolicyId,
} from "@rust/hash-graph-authorization/types";
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

  it("can create a policy", async () => {
    const authentication = { actorId: testUser.accountId };

    const policyCreationParams = {
      effect: "permit",
      principal: {
        type: "actor",
        actorType: "user",
        id: testUser.accountId,
      },
      actions: ["instantiate"],
      resource: {
        type: "web",
        webId: testUser.accountId,
      },
    } satisfies PolicyCreationParams;

    const policyId = await createPolicy(
      graphApi,
      authentication,
      policyCreationParams,
    );
    testPolicy = { id: policyId, ...policyCreationParams };
  });

  it("can query all policies", async () => {
    const authentication = { actorId: testUser.accountId };

    const policies = await queryPolicies(graphApi, authentication, {});

    expect(policies).toContainEqual(testPolicy);
  });

  it("can query system-actor policies", async () => {
    const authentication = { actorId: testUser.accountId };

    const policies = await queryPolicies(graphApi, authentication, {
      principal: {
        filter: "constrained",
        type: "actor",
        actorType: "user",
        id: testUser.accountId,
      },
    });

    expect(policies).toContainEqual(testPolicy);
  });

  it("can get specific policies", async () => {
    const authentication = { actorId: testUser.accountId };

    expect(
      await getPolicyById(graphApi, authentication, testPolicy.id),
    ).toStrictEqual(testPolicy);
  });

  it("can find policies for an actor", async () => {
    const authentication = { actorId: testUser.accountId };

    expect(
      await resolvePoliciesForActor(graphApi, authentication, {
        actorType: "user",
        id: testUser.accountId,
      }),
    ).toContainEqual(testPolicy);
  });

  it("can update a policy", async () => {
    const authentication = { actorId: testUser.accountId };

    let updatedPolicy = await updatePolicyById(
      graphApi,
      authentication,
      testPolicy.id,
      [
        {
          type: "addAction",
          action: "view",
        },
        {
          type: "addAction",
          action: "create",
        },
        {
          type: "removeAction",
          action: "instantiate",
        },
      ],
    );

    expect(testPolicy).not.toEqual(updatedPolicy);
    expect(updatedPolicy.actions.length).toBe(2);

    updatedPolicy = await updatePolicyById(
      graphApi,
      authentication,
      testPolicy.id,
      [
        {
          type: "removeAction",
          action: "create",
        },
      ],
    );
    expect(updatedPolicy.actions).toStrictEqual(["view"]);

    // At least one action must exist ...
    await expect(
      updatePolicyById(graphApi, authentication, testPolicy.id, [
        {
          type: "removeAction",
          action: "view",
        },
      ]),
    ).rejects.toThrowError(
      "Could not update policy: No actions specified in policy",
    );

    // ... but we can remove the last action and add a new one
    updatedPolicy = await updatePolicyById(
      graphApi,
      authentication,
      testPolicy.id,
      [
        {
          type: "removeAction",
          action: "view",
        },
        {
          type: "addAction",
          action: "instantiate",
        },
      ],
    );
    expect(updatedPolicy).toStrictEqual(testPolicy);
  });

  it("can delete a policy", async () => {
    const authentication = { actorId: testUser.accountId };

    await deletePolicyById(graphApi, authentication, testPolicy.id);

    expect(
      await getPolicyById(graphApi, authentication, testPolicy.id),
    ).toBeNull();

    expect(
      await resolvePoliciesForActor(graphApi, authentication, {
        actorType: "user",
        id: testUser.accountId,
      }),
    ).not.toContainEqual(testPolicy);
  });
});
