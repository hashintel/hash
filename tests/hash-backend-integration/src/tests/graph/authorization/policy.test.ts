import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
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
  ResourceConstraint,
} from "@rust/hash-graph-authorization/types";
import { beforeAll, describe, expect, it } from "vitest";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
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
          type: "add-action",
          action: "view",
        },
        {
          type: "add-action",
          action: "create",
        },
        {
          type: "remove-action",
          action: "instantiate",
        },
        {
          type: "set-resource-constraint",
          resourceConstraint: null,
        },
      ],
    );

    expect(testPolicy).not.toEqual(updatedPolicy);
    expect(updatedPolicy.actions.length).toBe(2);
    expect(updatedPolicy.resource).toBeNull();

    updatedPolicy = await updatePolicyById(
      graphApi,
      authentication,
      testPolicy.id,
      [
        {
          type: "remove-action",
          action: "create",
        },
        {
          type: "set-resource-constraint",
          resourceConstraint: {
            type: "entity",
            id: extractEntityUuidFromEntityId(testUser.entity.entityId),
          },
        },
      ],
    );
    expect(updatedPolicy.actions).toStrictEqual(["view"]);
    expect(updatedPolicy.resource).toStrictEqual({
      type: "entity",
      id: extractEntityUuidFromEntityId(testUser.entity.entityId),
    });

    // At least one action must exist ...
    await expect(
      updatePolicyById(graphApi, authentication, testPolicy.id, [
        {
          type: "remove-action",
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
          type: "remove-action",
          action: "view",
        },
        {
          type: "add-action",
          action: "instantiate",
        },
        {
          type: "set-resource-constraint",
          resourceConstraint: {
            type: "web",
            webId: testUser.accountId,
          },
        },
      ],
    );
    // The original policy should be restored
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
