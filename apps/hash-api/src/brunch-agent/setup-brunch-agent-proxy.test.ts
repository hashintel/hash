import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";

import express from "express";
import { afterEach, expect, test, vi } from "vitest";

import { setupBrunchAgentProxy } from "./setup-brunch-agent-proxy";

import type { User } from "../graph/knowledge/system-types/user";
import type { IncomingHttpHeaders, Server } from "node:http";
import type { AddressInfo } from "node:net";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    ),
  );
});

const listen = async (server: Server) => {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const startProxy = async () => {
  const upstreamRequests: { path: string; headers: IncomingHttpHeaders }[] = [];
  const upstreamOrigin = await listen(
    createServer((request, response) => {
      upstreamRequests.push({
        path: request.url ?? "",
        headers: request.headers,
      });
      response.writeHead(202, {
        "content-type": "application/json",
        location: `${upstreamOrigin}/agents/petrinaut/instance`,
      });
      response.end(
        JSON.stringify({
          streamUrl: `${upstreamOrigin}/agents/petrinaut/instance/stream`,
        }),
      );
    }),
  );

  const app = express();
  app.use((request, _response, next) => {
    // The proxy reads only the signed-in account's id.
    request.user = { accountId: "account-1" } as unknown as User;
    next();
  });
  setupBrunchAgentProxy(app, {
    origin: new URL(upstreamOrigin),
    publicOrigin: "https://app-api.example",
    logger: { warn: vi.fn() },
  });
  const proxyOrigin = await listen(createServer(app));

  /** Sends `path` byte for byte; `fetch` would resolve its dot segments. */
  const send = (path: string, method = "GET") =>
    new Promise<{
      status: number;
      headers: IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const { hostname, port } = new URL(proxyOrigin);
      const outgoing = httpRequest(
        { hostname, port, path, method, headers: { host: "attacker.example" } },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => {
            body += chunk;
          });
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body,
            }),
          );
        },
      );
      outgoing.on("error", reject);
      outgoing.end();
    });

  return { send, upstreamRequests };
};

test.each([
  "/api/brunch/agents/../health",
  "/api/brunch/agents/%2e%2e/health",
  "/api/brunch/agents/%2E%2E/health",
  "/api/brunch/agents\\..\\health",
])("does not forward %s outside Brunch's agents", async (path) => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send(path);

  expect(response.status).toBe(404);
  expect(upstreamRequests).toEqual([]);
});

test("forwards an agents request with the account's owner key and points its URLs at the public origin", async () => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send("/api/brunch/agents/petrinaut/instance", "POST");

  expect(upstreamRequests).toMatchObject([
    {
      path: "/agents/petrinaut/instance",
      headers: { "x-brunch-principal": "hash:account-1" },
    },
  ]);
  expect(response.status).toBe(202);
  expect(response.headers.location).toBe(
    "https://app-api.example/api/brunch/agents/petrinaut/instance",
  );
  expect(JSON.parse(response.body)).toEqual({
    streamUrl:
      "https://app-api.example/api/brunch/agents/petrinaut/instance/stream",
  });
});
