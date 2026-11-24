import { beforeAll, describe, expect, it } from "vitest";

import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { generateSystemEntityTypeSchema } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import { createEntity } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import { createEntityType } from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "@local/hash-graph-sdk/api-token";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";

import { createTestImpureGraphContext, createTestUser } from "../../util";

import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import type { EntityTypeWithMetadata } from "@blockprotocol/type-system";

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
  let ownerEntityType: EntityTypeWithMetadata;

  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({
      logger,
      context: graphContext,
      seedSystemPolicies: true,
    });

    owner = await createTestUser(graphContext, "apitokenowner", logger);
    otherUser = await createTestUser(graphContext, "apitokenother", logger);

    ownerEntityType = await createEntityType(
      graphContext,
      { actorId: owner.accountId },
      {
        webId: owner.accountId,
        schema: generateSystemEntityTypeSchema({
          entityTypeId: generateTypeId({
            kind: "entity-type",
            title: "API token test",
            webShortname: owner.shortname!,
          }),
          title: "API token test",
          description: "An entity type only the API token tests use.",
          properties: [],
          outgoingLinks: [],
        }),
      },
    );

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

  it("reads an entity on the public API as the token's owner", async () => {
    const authentication = { actorId: owner.accountId };
    const entity = await createEntity(graphContext, authentication, {
      webId: owner.accountId,
      properties: { value: {} },
      entityTypeIds: [ownerEntityType.schema.$id],
    });
    const [{ token: ownerToken }, { token: otherToken }] = await Promise.all([
      createApiToken(graphApi, authentication, {
        name: "owner on the public API in integration test",
      }),
      createApiToken(
        graphApi,
        { actorId: otherUser.accountId },
        { name: "other user on the public API in integration test" },
      ),
    ]);

    const { entityId } = entity;
    const [ownerResponse, otherResponse] = await Promise.all([
      requestWithToken(`/entities/v1/${entityId}`, ownerToken),
      requestWithToken(`/entities/v1/${entityId}`, otherToken),
    ]);

    expect(ownerResponse.status).toBe(200);
    expect(await ownerResponse.json()).toMatchObject({
      metadata: { entityId, entityTypeIds: [ownerEntityType.schema.$id] },
    });
    expect(otherResponse.status).toBe(404);
  });

  it("answers an archived entity with 404 on the public API", async () => {
    const authentication = { actorId: owner.accountId };
    const entity = await createEntity(graphContext, authentication, {
      webId: owner.accountId,
      properties: { value: {} },
      entityTypeIds: [ownerEntityType.schema.$id],
    });
    await entity.archive(graphApi, authentication, graphContext.provenance);
    const { token } = await createApiToken(graphApi, authentication, {
      name: "archived entity on the public API in integration test",
    });

    const response = await requestWithToken(
      `/entities/v1/${entity.entityId}`,
      token,
    );

    expect(response.status).toBe(404);
  });

  it("rejects a revoked token", async () => {
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

    const response = await requestWithToken(
      `/entities/v1/${owner.entity.metadata.recordId.entityId}`,
      token,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    expect(response.headers.get("www-authenticate")).toContain(
      'error="invalid_token"',
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
