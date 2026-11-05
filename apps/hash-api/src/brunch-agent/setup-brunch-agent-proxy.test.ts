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
  appJsonParser = true,
}: {
  configured?: boolean;
  signedIn?: boolean;
  appJsonParser?: boolean;
} = {}) => {
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
          location: `${upstreamOrigin}/agents/hash/instance`,
        });
        response.end(
          JSON.stringify({
            streamUrl: `${upstreamOrigin}/agents/hash/instance/stream`,
          }),
        );
      });
    }),
  );

  const app = express();
  app.use((request, _response, next) => {
    if (signedIn) {
      // The proxy reads only the signed-in account's id; tests name another
      // account with a header the proxy never forwards.
      const accountId = request.headers["x-test-account"] ?? "account-1";
      request.user = { accountId } as unknown as User;
    }
    next();
  });
  if (appJsonParser) {
    // As in NodeAPI, the app-wide JSON body parser runs before the proxy.
    app.use(express.json());
  }
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
  "/api/brunch/agents/petrinaut/instance",
  "/api/brunch/agents/chat/instance",
  "/api/brunch/agents/hashx/instance",
  "/api/brunch/agents/hash",
  "/api/brunch/agents/hash/../petrinaut/x",
  "/api/brunch/agents/hash/%2e%2e/petrinaut/x",
  "/api/brunch/agents/hash\\..\\petrinaut\\x",
])("does not forward %s outside the HASH agent", async (path) => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send(path);

  expect(response.status).toBe(404);
  expect(upstreamRequests).toEqual([]);
});

test.each([
  ["a protocol-relative path", (host: string) => `//${host}/agents/hash/x`],
  ["a backslash path", (host: string) => `/\\${host}/agents/hash/x`],
  [
    "an encoded protocol-relative path",
    (host: string) => `/%2f%2f${host}/agents/hash/x`,
  ],
])(
  "refuses %s naming another host rather than forwarding it there",
  async (_shape, pathTo) => {
    const { send, upstreamRequests } = await startProxy();
    // A second local server stands in for the other host, so a regression
    // reaches it rather than the network; its path is the HASH agent's.
    const otherHostRequests: string[] = [];
    const otherHost = new URL(
      await listen(
        createServer((request, response) => {
          otherHostRequests.push(request.url ?? "");
          response.writeHead(202).end();
        }),
      ),
    ).host;

    const response = await send(`/api/brunch${pathTo(otherHost)}`);

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: "Not found" });
    expect(otherHostRequests).toEqual([]);
    expect(upstreamRequests).toEqual([]);
  },
);

test("forwards an encoded slash verbatim under the HASH agent", async () => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send("/api/brunch/agents/hash/..%2fhealth");

  expect(response.status).toBe(202);
  expect(upstreamRequests).toMatchObject([
    { path: "/agents/hash/..%2fhealth" },
  ]);
});

test.each([
  "/agents/hash/..%2fpetrinaut/x",
  "/agents/hash/..%2Fpetrinaut/x",
  "/agents/hash/..%5cpetrinaut/x",
])("forwards %s verbatim, still under the HASH agent", async (path) => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send(`/api/brunch${path}`);

  expect(response.status).toBe(202);
  expect(upstreamRequests).toMatchObject([{ path }]);
});

test("refuses a non-agents POST with 404 before reading its body", async () => {
  const { send, upstreamRequests } = await startProxy({
    appJsonParser: false,
  });

  const response = await send("/api/brunch/agents/petrinaut/instance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hello" }),
  });

  expect(response.status).toBe(404);
  expect(upstreamRequests).toEqual([]);
});

test("forwards an agents request with the session cookie and points its URLs at the public origin", async () => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send("/api/brunch/agents/hash/instance", {
    method: "POST",
    headers: { cookie: "ory_kratos_session=session-1" },
  });

  expect(upstreamRequests).toMatchObject([
    {
      path: "/agents/hash/instance",
      headers: { cookie: "ory_kratos_session=session-1" },
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
    "https://app-api.example/api/brunch/agents/hash/instance",
  );
  expect(JSON.parse(response.body)).toEqual({
    streamUrl: "https://app-api.example/api/brunch/agents/hash/instance/stream",
  });
});

test("states no identity of its own: no actor header and no authorization, whatever the browser sent", async () => {
  const { send, upstreamRequests } = await startProxy();

  await Promise.all([
    send("/api/brunch/agents/hash/instance", {
      method: "POST",
      headers: {
        cookie: "ory_kratos_session=session-1",
        "x-brunch-actor": "hash:someone-else",
        "x-brunch-principal": "hash:someone-else",
        authorization: "HASH-Service forged-by-the-browser",
      },
    }),
    send("/api/brunch/agents/hash/instance?live=sse", {
      headers: {
        cookie: "ory_kratos_session=session-1",
        authorization: "Bearer forged-by-the-browser",
      },
    }),
    send("/api/brunch/agents/hash/instance/browser-calls/call-1", {
      headers: { cookie: "ory_kratos_session=session-1" },
    }),
  ]);

  expect(upstreamRequests).toHaveLength(3);
  for (const { headers } of upstreamRequests) {
    expect(headers.authorization).toBeUndefined();
    expect(headers["x-brunch-actor"]).toBeUndefined();
    expect(headers["x-brunch-principal"]).toBeUndefined();
  }
});

test("forwards only the session cookie's pair, dropping every other cookie", async () => {
  const { send, upstreamRequests } = await startProxy();

  await send("/api/brunch/agents/hash/instance", {
    method: "POST",
    headers: {
      cookie: "other=1; ory_kratos_session=session-1; csrf_token=abc",
    },
  });
  await send("/api/brunch/agents/hash/instance", {
    method: "POST",
    headers: { cookie: "other=1; csrf_token=abc" },
  });

  expect(upstreamRequests.map(({ headers }) => headers.cookie)).toEqual([
    "ory_kratos_session=session-1",
    undefined,
  ]);
});

test("forwards a session token in its own header", async () => {
  const { send, upstreamRequests } = await startProxy();

  await send("/api/brunch/agents/hash/instance", {
    method: "POST",
    headers: { "x-session-token": "token-1", cookie: "other=1" },
  });

  expect(upstreamRequests).toHaveLength(1);
  expect(upstreamRequests[0]?.headers).toMatchObject({
    "x-session-token": "token-1",
  });
  expect(upstreamRequests[0]?.headers.cookie).toBeUndefined();
});

test("forwards a JSON body as JSON", async () => {
  const { send, upstreamRequests } = await startProxy();

  await send("/api/brunch/agents/hash/instance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hello" }),
  });

  expect(upstreamRequests).toHaveLength(1);
  expect(JSON.parse(upstreamRequests[0]?.body ?? "")).toEqual({
    message: "hello",
  });
});

test("forwards a JSON body intact when the app mounts no JSON parser", async () => {
  const { send, upstreamRequests } = await startProxy({
    appJsonParser: false,
  });
  const message = {
    role: "user",
    parts: [{ type: "text", text: "héllo \u{1F600}" }],
    nested: { list: [1, null, true] },
  };

  const response = await send("/api/brunch/agents/hash/instance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
  });

  expect(response.status).toBe(202);
  expect(upstreamRequests).toHaveLength(1);
  expect(JSON.parse(upstreamRequests[0]?.body ?? "")).toEqual(message);
});

test("limits each account's turn submissions, counting nothing else", async () => {
  const { send, upstreamRequests } = await startProxy();
  const submit = (account = "account-1") =>
    send("/api/brunch/agents/hash/instance", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": account,
        cookie: `ory_kratos_session=${account}`,
      },
      body: JSON.stringify({ message: "hello" }),
    });

  // Stream reads, browser-call claims and settlements, and stops are not turns.
  for (let i = 0; i < 40; i++) {
    const responses = await Promise.all([
      send("/api/brunch/agents/hash/instance?view=updates"),
      send("/api/brunch/agents/hash/instance/browser-calls/call-1"),
      send("/api/brunch/agents/hash/instance/browser-calls/call-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ output: i }),
      }),
      send("/api/brunch/agents/hash/instance/browser-calls/call-1/lease", {
        method: "POST",
      }),
      send("/api/brunch/agents/hash/instance/abort", { method: "POST" }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([
      202, 202, 202, 202, 202,
    ]);
  }
  const forwardedBeforeSubmissions = upstreamRequests.length;

  for (let i = 0; i < 30; i++) {
    expect((await submit()).status).toBe(202);
  }
  const limited = await submit();

  expect(limited.status).toBe(429);
  expect(JSON.parse(limited.body)).toEqual({
    error: "Too many Brunch agent turns, try again later",
  });
  expect(limited.headers).toMatchObject({
    "ratelimit-limit": "30",
    "ratelimit-remaining": "0",
  });
  expect(limited.headers["ratelimit-reset"]).toBeDefined();
  expect(limited.headers["x-ratelimit-limit"]).toBeUndefined();
  expect(upstreamRequests).toHaveLength(forwardedBeforeSubmissions + 30);

  const otherAccount = await submit("account-2");
  expect(otherAccount.status).toBe(202);
  expect(otherAccount.headers["ratelimit-remaining"]).toBe("29");
  expect(upstreamRequests.at(-1)?.headers).toMatchObject({
    cookie: "ory_kratos_session=account-2",
  });

  // A limited account still reads its streams.
  expect(
    (await send("/api/brunch/agents/hash/instance?view=updates")).status,
  ).toBe(202);
});

test("refuses a non-JSON body with 415 and forwards nothing", async () => {
  const { send, upstreamRequests } = await startProxy();

  const response = await send("/api/brunch/agents/hash/instance", {
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

test.each(["/api/brunch/identity", "/api/brunch/agents/hash/instance"])(
  "refuses %s without a session",
  async (path) => {
    const { send, upstreamRequests } = await startProxy({ signedIn: false });

    const response = await send(path);

    expect(response.status).toBe(401);
    expect(upstreamRequests).toEqual([]);
  },
);

test("answers identity and agent routes with 503 when no Brunch origin is configured", async () => {
  const { send, upstreamRequests } = await startProxy({ configured: false });

  for (const path of [
    "/api/brunch/identity",
    "/api/brunch/agents/hash/instance",
  ]) {
    const response = await send(path);

    expect(response.status, path).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "Brunch agent is not configured",
    });
  }
  expect(upstreamRequests).toEqual([]);
});

test("answers identity with the account's actor key when only the origin is configured", async () => {
  const { send } = await startProxy();

  const response = await send("/api/brunch/identity");

  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toEqual({ actorKey: "hash:account-1" });
});
