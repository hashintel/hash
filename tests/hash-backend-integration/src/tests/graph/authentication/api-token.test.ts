import { beforeAll, describe, expect, it } from "vitest";

import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "@local/hash-graph-sdk/api-token";

import { createTestImpureGraphContext, createTestUser } from "../../util";

import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();
const { graphApi } = graphContext;

const graphUrl = `http://${getRequiredEnv("HASH_GRAPH_HTTP_HOST")}:${getRequiredEnv("HASH_GRAPH_HTTP_PORT")}`;

const requestWithToken = (path: string, token: string) =>
  fetch(`${graphUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });

describe("API tokens", () => {
  let owner: User;
  let otherUser: User;

  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({
      logger,
      context: graphContext,
      seedSystemPolicies: true,
    });

    owner = await createTestUser(graphContext, "apitokenowner", logger);
    otherUser = await createTestUser(graphContext, "apitokenother", logger);

    return async () => {
      await Promise.all(
        [owner, otherUser].map((user) =>
          deleteKratosIdentity({ kratosIdentityId: user.kratosIdentityId }),
        ),
      );
    };
  });

  it("discloses a created token only once", async () => {
    const authentication = { actorId: owner.accountId };

    const { token, apiToken } = await createApiToken(graphApi, authentication, {
      name: "integration test",
      lifetimeDays: 30,
    });

    expect(`${token.slice(0, apiToken.hint.length - 1)}…`).toBe(apiToken.hint);

    const listed = await listApiTokens(graphApi, authentication);
    expect(listed).toContainEqual(apiToken);
    expect(JSON.stringify(listed)).not.toContain(token);
  });

  it("lets only the owner see and revoke a token", async () => {
    const { apiToken } = await createApiToken(
      graphApi,
      { actorId: owner.accountId },
      { name: "revoked in integration test" },
    );

    expect(
      await listApiTokens(graphApi, { actorId: otherUser.accountId }),
    ).toEqual([]);
    await expect(
      revokeApiToken(
        graphApi,
        { actorId: otherUser.accountId },
        apiToken.tokenId,
      ),
    ).rejects.toMatchObject({ status: { code: "NOT_FOUND" } });

    await revokeApiToken(
      graphApi,
      { actorId: owner.accountId },
      apiToken.tokenId,
    );

    const listed = await listApiTokens(graphApi, { actorId: owner.accountId });
    expect(
      listed.find(({ tokenId }) => tokenId === apiToken.tokenId)?.status,
    ).toBe("revoked");
  });

  it("authenticates a token as its owner on the public API", async () => {
    const { token } = await createApiToken(
      graphApi,
      { actorId: owner.accountId },
      { name: "public API in integration test" },
    );

    const response = await requestWithToken(
      "/entities/v1/authenticated-caller",
      token,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      actor: { actorType: "user", id: owner.accountId },
    });
  });

  it("rejects a revoked token instead of serving the request anonymously", async () => {
    const { token, apiToken } = await createApiToken(
      graphApi,
      { actorId: owner.accountId },
      { name: "revoked before use in integration test" },
    );
    await revokeApiToken(
      graphApi,
      { actorId: owner.accountId },
      apiToken.tokenId,
    );

    const response = await requestWithToken("/entities/v1/caller", token);

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
  });

  it("does not accept a token on the legacy API", async () => {
    const { token } = await createApiToken(
      graphApi,
      { actorId: owner.accountId },
      { name: "legacy API in integration test" },
    );

    const [withToken, withoutCredentials] = await Promise.all([
      requestWithToken("/api-tokens", token),
      fetch(`${graphUrl}/api-tokens`),
    ]);

    expect(withToken.status).toBe(401);
    expect(withoutCredentials.status).toBe(401);
    // An ignored token would be answered like a request without credentials.
    expect(await withToken.json()).not.toEqual(await withoutCredentials.json());
  });
});
