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

const startProxy = async ({
  configured = true,
  signedIn = true,
}: { configured?: boolean; signedIn?: boolean } = {}) => {
  const upstreamRequests: {
    path: string;
    headers: IncomingHttpHeaders;
    body: string;
  }[] = [];
  const upstreamOrigin = await listen(
    createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("end", () => {
        upstreamRequests.push({
          path: request.url ?? "",
          headers: request.headers,
          body,
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
      });
    }),
  );

  const app = express();
  app.use((request, _response, next) => {
    if (signedIn) {
      // The proxy reads only the signed-in account's id.
      request.user = { accountId: "account-1" } as unknown as User;
    }
    next();
  });
  // As in NodeAPI, the JSON body parser runs before the proxy.
  app.use(express.json());
  setupBrunchAgentProxy(app, {
    origin: configured ? new URL(upstreamOrigin) : null,
    publicOrigin: "https://app-api.example",
    logger: { warn: vi.fn() },
  });
  const proxyOrigin = await listen(createServer(app));

  /** Sends `path` byte for byte; `fetch` would resolve its dot segments. */
  const send = (
    path: string,
    {
      method = "GET",
      headers = {},
      body,
    }: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ) =>
    new Promise<{
      status: number;
      headers: IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const { hostname, port } = new URL(proxyOrigin);
      const outgoing = httpRequest(
        {
          hostname,
          port,
          path,
          method,
          headers: { ...headers, host: "attacker.example" },
        },
        (response) => {
          let responseBody = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => {
            responseBody += chunk;
          });
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: responseBody,
            }),
          );
        },
      );
      outgoing.on("error", reject);
      outgoing.end(body);
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

test("refuses a protocol-relative path rather than forwarding it to another host", async () => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send("/api/brunch//attacker.example/agents/x");

  expect(response.status).toBe(404);
  expect(JSON.parse(response.body)).toEqual({ error: "Not found" });
  expect(upstreamRequests).toEqual([]);
});

test("forwards an encoded slash verbatim under Brunch's agents", async () => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send("/api/brunch/agents/..%2fhealth");

  expect(response.status).toBe(202);
  expect(upstreamRequests).toMatchObject([{ path: "/agents/..%2fhealth" }]);
});

test("forwards an agents request with the account's owner key and points its URLs at the public origin", async () => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send("/api/brunch/agents/petrinaut/instance", {
    method: "POST",
  });

  expect(upstreamRequests).toMatchObject([
    {
      path: "/agents/petrinaut/instance",
      headers: { "x-brunch-principal": "hash:account-1" },
    },
  ]);
  expect(response.status).toBe(202);
  expect(
    response.headers["access-control-expose-headers"]?.split(", "),
  ).toEqual([
    "location",
    "stream-next-offset",
    "stream-cursor",
    "stream-up-to-date",
    "stream-closed",
    "stream-sse-data-encoding",
    "flue-error-ref",
  ]);
  expect(response.headers.location).toBe(
    "https://app-api.example/api/brunch/agents/petrinaut/instance",
  );
  expect(JSON.parse(response.body)).toEqual({
    streamUrl:
      "https://app-api.example/api/brunch/agents/petrinaut/instance/stream",
  });
});

test("overwrites an owner key forged by the browser with the account's", async () => {
  const { send, upstreamRequests } = await startProxy();

  await send("/api/brunch/agents/petrinaut/instance", {
    method: "POST",
    headers: { "x-brunch-principal": "hash:someone-else" },
  });

  expect(upstreamRequests).toMatchObject([
    { headers: { "x-brunch-principal": "hash:account-1" } },
  ]);
});

test("never forwards the browser's cookie", async () => {
  const { send, upstreamRequests } = await startProxy();

  await send("/api/brunch/agents/petrinaut/instance", {
    method: "POST",
    headers: { cookie: "ory_kratos_session=secret" },
  });

  expect(upstreamRequests).toHaveLength(1);
  expect(upstreamRequests[0]?.headers.cookie).toBeUndefined();
});

test("forwards a JSON body as JSON", async () => {
  const { send, upstreamRequests } = await startProxy();

  await send("/api/brunch/agents/petrinaut/instance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hello" }),
  });

  expect(upstreamRequests).toHaveLength(1);
  expect(JSON.parse(upstreamRequests[0]?.body ?? "")).toEqual({
    message: "hello",
  });
});

test("refuses a non-JSON body with 415 and forwards nothing", async () => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send("/api/brunch/agents/petrinaut/instance", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "hello",
  });

  expect(response.status).toBe(415);
  expect(JSON.parse(response.body)).toEqual({
    error: "Brunch agent requests must be JSON",
  });
  expect(upstreamRequests).toEqual([]);
});

test.each(["/api/brunch/identity", "/api/brunch/agents/petrinaut/instance"])(
  "refuses %s without a session",
  async (path) => {
    const { send, upstreamRequests } = await startProxy({ signedIn: false });

    const response = await send(path);

    expect(response.status).toBe(401);
    expect(upstreamRequests).toEqual([]);
  },
);

test.each(["/api/brunch/identity", "/api/brunch/agents/petrinaut/instance"])(
  "answers %s with 503 when no Brunch origin is configured",
  async (path) => {
    const { send, upstreamRequests } = await startProxy({ configured: false });

    const response = await send(path);

    expect(response.status).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "Brunch agent is not configured",
    });
    expect(upstreamRequests).toEqual([]);
  },
);

test("answers identity with the account's owner key when configured", async () => {
  const { send } = await startProxy();

  const response = await send("/api/brunch/identity");

  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toEqual({ ownerKey: "hash:account-1" });
});
