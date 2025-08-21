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
  ResolvedPolicy,
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
    await ensureSystemGraphIsInitialized({
      logger,
      context: graphContext,
      seedSystemPolicies: true,
    });

    testUser = await createTestUser(graphContext, "entitytest", logger);

    return async () => {
      await deleteKratosIdentity({
        kratosIdentityId: testUser.kratosIdentityId,
      });

      await resetGraph();
    };
  });

  it("can create a web-policy", async () => {
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

  it("cannot create a global policy", async () => {
    const authentication = { actorId: testUser.accountId };

    const policyCreationParams = {
      effect: "permit",
      principal: {
        type: "actor",
        actorType: "user",
        id: testUser.accountId,
      },
      actions: ["instantiate"],
      resource: null,
    } satisfies PolicyCreationParams;

    await expect(
      createPolicy(graphApi, authentication, policyCreationParams),
    ).rejects.toThrowError("Permission to create policy was denied");
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
        actions: ["createWeb"],
      }),
    ).not.toContainEqual({
      effect: testPolicy.effect,
      actions: ["createWeb"],
      resource: testPolicy.resource,
    } satisfies ResolvedPolicy);

    expect(
      await resolvePoliciesForActor(graphApi, authentication, {
        actions: [],
      }),
    ).not.toContainEqual({
      effect: testPolicy.effect,
      actions: [],
      resource: testPolicy.resource,
    } satisfies ResolvedPolicy);

    expect(
      await resolvePoliciesForActor(graphApi, authentication, {
        actions: ["instantiate"],
      }),
    ).toContainEqual({
      effect: testPolicy.effect,
      actions: ["instantiate"],
      resource: testPolicy.resource,
    } satisfies ResolvedPolicy);

    expect(
      await resolvePoliciesForActor(graphApi, authentication, {
        actions: ["createWeb", "instantiate"],
      }),
    ).toContainEqual({
      effect: testPolicy.effect,
      actions: ["instantiate"],
      resource: testPolicy.resource,
    } satisfies ResolvedPolicy);
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
          action: "viewEntity",
        },
        {
          type: "add-action",
          action: "updateEntity",
        },
        {
          type: "remove-action",
          action: "instantiate",
        },
        {
          type: "set-resource-constraint",
          resourceConstraint: {
            type: "entity",
            webId: testUser.accountId,
            filter: {
              type: "all",
              filters: [],
            },
          },
        },
      ],
    );

    expect(testPolicy).not.toEqual(updatedPolicy);
    expect(updatedPolicy.actions.length).toBe(2);
    expect(updatedPolicy.resource).toStrictEqual({
      type: "entity",
      webId: testUser.accountId,
      filter: {
        type: "all",
        filters: [],
      },
    });

    await expect(
      updatePolicyById(graphApi, authentication, testPolicy.id, [
        {
          type: "set-resource-constraint",
          resourceConstraint: null,
        },
      ]),
    ).rejects.toThrowError("Permission to update policy was denied");

    updatedPolicy = await updatePolicyById(
      graphApi,
      authentication,
      testPolicy.id,
      [
        {
          type: "remove-action",
          action: "updateEntity",
        },
      ],
    );
    expect(updatedPolicy.actions).toStrictEqual(["viewEntity"]);

    // At least one action must exist ...
    await expect(
      updatePolicyById(graphApi, authentication, testPolicy.id, [
        {
          type: "remove-action",
          action: "viewEntity",
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
          action: "viewEntity",
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
        actions: ["instantiate"],
      }),
    ).not.toContainEqual(testPolicy);
  });
});
