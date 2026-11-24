import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Logger } from "./logger.js";
import { VaultClient } from "./vault.js";

import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { AddressInfo } from "node:net";

const ownAccountId = "0195f3a2-6b1c-7d4e-8f00-000000000001" as ActorEntityUuid;
const otherAccountId =
  "0195f3a2-6b1c-7d4e-8f00-000000000002" as ActorEntityUuid;

const legitimatePaths = [
  `users/${ownAccountId}/google/account/108234567890123456789`,
  `users/${ownAccountId}/linear/workspace/9cfb4a3e-2f8d-4c5b-a1e6-7d0b3c2e1f4a`,
] as const;

const invalidPaths = [
  `users/${ownAccountId}/../${otherAccountId}/google/account/1`,
  `users/${ownAccountId}/google/../../${otherAccountId}/google/account/1`,
  `users/${ownAccountId}/%2e%2e/${otherAccountId}/google/account/1`,
  `users/${ownAccountId}/%2E%2E/${otherAccountId}/google/account/1`,
  `users/${ownAccountId}/.%2e/${otherAccountId}/google/account/1`,
  `users/${ownAccountId}/..%2f${otherAccountId}/google/account/1`,
  `users/${ownAccountId}/google/account/1\\..\\..\\..\\${otherAccountId}`,
  `users/${ownAccountId}/./google/account/1`,
  `users/${ownAccountId}//google/account/1`,
  `users/${ownAccountId}/google/account/`,
  `users/${ownAccountId}/google/account/1?version=1`,
  `users/${ownAccountId}/google/account/1#fragment`,
  `users/${ownAccountId}/google/account/1%00`,
  `users/${ownAccountId}/google/account/a@b`,
  `users/${ownAccountId}/google`,
  `users/${ownAccountId}/connector/token`,
  `/users/${ownAccountId}/google/account/1`,
  `secrets/${ownAccountId}/google/account/1`,
];

describe("VaultClient", () => {
  let server: Server;
  let client: VaultClient;
  const requestedUrls: string[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      requestedUrls.push(request.url ?? "");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { data: {}, metadata: {} } }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address() as AddressInfo;

    client = new VaultClient({
      endpoint: `http://127.0.0.1:${port}`,
      token: "test-token",
      logger: new Logger({ environment: "test", serviceName: "vault-test" }),
      secretMountPath: "secret",
    });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    requestedUrls.length = 0;
  });

  describe("read", () => {
    it.each(legitimatePaths)("requests %s unchanged", async (path) => {
      await client.read({ path, userAccountId: ownAccountId });

      expect(requestedUrls).toStrictEqual([`/v1/secret/data/${path}`]);
    });

    it.each(invalidPaths)("rejects %s without a request", async (path) => {
      await expect(
        client.read({ path, userAccountId: ownAccountId }),
      ).rejects.toThrow("User secret path must have the form");

      expect(requestedUrls).toStrictEqual([]);
    });

    it("rejects a path owned by another account without a request", async () => {
      await expect(
        client.read({
          path: `users/${otherAccountId}/google/account/1`,
          userAccountId: ownAccountId,
        }),
      ).rejects.toThrow("does not match provided accountId");

      expect(requestedUrls).toStrictEqual([]);
    });
  });

  describe("write", () => {
    it.each(legitimatePaths)("requests %s unchanged", async (path) => {
      await client.write({ path, data: { value: "secret" } });

      expect(requestedUrls).toStrictEqual([`/v1/secret/data/${path}`]);
    });

    it.each(invalidPaths)("rejects %s without a request", async (path) => {
      await expect(
        client.write({
          path: path as Parameters<VaultClient["write"]>[0]["path"],
          data: { value: "secret" },
        }),
      ).rejects.toThrow("User secret path must have the form");

      expect(requestedUrls).toStrictEqual([]);
    });
  });
});
