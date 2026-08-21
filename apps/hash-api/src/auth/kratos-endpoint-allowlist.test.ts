import http from "node:http";

import * as Sentry from "@sentry/node";
import cors from "cors";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canonicaliseKratosProxyPath,
  guardKratosProxy,
  isAllowedKratosProxyRequest,
  KRATOS_PROXY_ALLOWLIST,
} from "./kratos-endpoint-allowlist";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AddressInfo } from "node:net";

vi.mock("@sentry/node", () => ({ captureMessage: vi.fn() }));

const captureMessage = vi.mocked(Sentry.captureMessage);

beforeEach(() => {
  captureMessage.mockClear();
});

type ProxyRequest = [method: string, url: string];

/**
 * Concrete example requests for every entry in the allow-list, paired with the
 * entry's own `path`. Coverage is then asserted by identity against the
 * constant instead of by re-deriving the match here, and every example goes
 * through `isAllowedKratosProxyRequest` itself — so removing an entry, or
 * narrowing the SSO callback pattern, fails the suite rather than the login
 * page.
 */
const examplesByAllowedPath: readonly (readonly [
  path: string | RegExp,
  requests: readonly ProxyRequest[],
])[] = [
  ["/sessions/whoami", [["GET", "/sessions/whoami"]]],

  [
    "/self-service/login/browser",
    [["GET", "/self-service/login/browser?refresh=false"]],
  ],
  [
    "/self-service/login/flows",
    [["GET", "/self-service/login/flows?id=1d0b8a3e-flow"]],
  ],
  ["/self-service/login", [["POST", "/self-service/login?flow=1d0b8a3e-flow"]]],

  [
    "/self-service/registration/browser",
    [["GET", "/self-service/registration/browser"]],
  ],
  [
    "/self-service/registration/flows",
    [["GET", "/self-service/registration/flows?id=1d0b8a3e-flow"]],
  ],
  [
    "/self-service/registration",
    [["POST", "/self-service/registration?flow=1d0b8a3e-flow"]],
  ],

  [
    "/self-service/verification/browser",
    [["GET", "/self-service/verification/browser"]],
  ],
  [
    "/self-service/verification/flows",
    [["GET", "/self-service/verification/flows?id=1d0b8a3e-flow"]],
  ],
  [
    "/self-service/verification",
    [["POST", "/self-service/verification?flow=1d0b8a3e-flow"]],
  ],

  [
    "/self-service/recovery/browser",
    [["GET", "/self-service/recovery/browser"]],
  ],
  [
    "/self-service/recovery/flows",
    [["GET", "/self-service/recovery/flows?id=1d0b8a3e-flow"]],
  ],
  [
    "/self-service/recovery",
    [["POST", "/self-service/recovery?flow=1d0b8a3e-flow"]],
  ],

  [
    "/self-service/settings/browser",
    [["GET", "/self-service/settings/browser"]],
  ],
  [
    "/self-service/settings/flows",
    [["GET", "/self-service/settings/flows?id=1d0b8a3e-flow"]],
  ],
  [
    "/self-service/settings",
    [["POST", "/self-service/settings?flow=1d0b8a3e-flow"]],
  ],

  ["/self-service/logout/browser", [["GET", "/self-service/logout/browser"]]],
  [
    "/self-service/logout",
    [["GET", "/self-service/logout?token=a-logout-token"]],
  ],

  [
    /^\/self-service\/methods\/oidc\/callback\/[^/]{1,128}$/,
    [
      ["GET", "/self-service/methods/oidc/callback/google?code=abc&state=def"],
      ["POST", "/self-service/methods/oidc/callback/microsoft"],
    ],
  ],
];

const allowedRequests: ProxyRequest[] = examplesByAllowedPath.flatMap(
  ([, requests]) =>
    requests.map(([method, url]): ProxyRequest => [method, url]),
);

describe("isAllowedKratosProxyRequest — allowed endpoints", () => {
  it.each(allowedRequests)("allows %s %s", (method, url) => {
    expect(isAllowedKratosProxyRequest({ method, url })).toBe(true);
  });

  it("pairs every allow-list entry with an example request, and nothing else", () => {
    expect(examplesByAllowedPath.map(([path]) => path)).toStrictEqual(
      KRATOS_PROXY_ALLOWLIST.map(({ path }) => path),
    );
  });

  it("keeps working when a flow id arrives as a query string", () => {
    expect(
      isAllowedKratosProxyRequest({
        method: "POST",
        url: "/self-service/verification?flow=8ae1c0d2-1234-4a5b-9c8d-0e1f2a3b4c5d",
      }),
    ).toBe(true);
  });

  it("does not let a query string smuggle in an allowed path", () => {
    expect(
      isAllowedKratosProxyRequest({
        method: "GET",
        url: "/admin/identities?/sessions/whoami",
      }),
    ).toBe(false);
  });
});

/**
 * The provider id is operator-chosen and Kratos's config schema puts no pattern
 * on it, so anything Kratos accepts as an id has to survive here — otherwise
 * SSO 404s on the way back from the identity provider.
 */
describe("isAllowedKratosProxyRequest — SSO provider ids", () => {
  const callbackFor = (provider: string) =>
    isAllowedKratosProxyRequest({
      method: "GET",
      url: `/self-service/methods/oidc/callback/${provider}`,
    });

  it.each([
    "google",
    "microsoft",
    "Google",
    "okta.acme.com",
    "azure_ad",
    "hash-enterprise",
    "0",
  ])("allows the provider id %s", (provider) => {
    expect(callbackFor(provider)).toBe(true);
  });

  it("allows a provider id at exactly the length limit", () => {
    expect(callbackFor("p".repeat(128))).toBe(true);
  });

  it("denies a provider id one character over the length limit", () => {
    expect(callbackFor("p".repeat(129))).toBe(false);
  });

  it("denies a missing provider id", () => {
    expect(callbackFor("")).toBe(false);
  });

  it("denies a provider id spanning more than one path segment", () => {
    expect(callbackFor("google/extra")).toBe(false);
  });
});

/**
 * Kratos public endpoints (and Kratos operational endpoints) that the catch-all
 * `/auth` proxy forwarded before this allow-list existed.
 */
const unlistedRequests: ProxyRequest[] = [
  // Kratos admin API. Not bound to the public port, but the allow-list should
  // not be the only thing standing between a misconfiguration and this.
  ["GET", "/admin/identities"],
  ["POST", "/admin/identities"],
  // Native/API-client counterparts of the browser flows.
  ["GET", "/self-service/login/api"],
  ["GET", "/self-service/registration/api"],
  ["GET", "/self-service/settings/api"],
  ["GET", "/self-service/verification/api"],
  ["GET", "/self-service/recovery/api"],
  ["DELETE", "/self-service/logout/api"],
  // Session listing and revocation — no frontend caller.
  ["GET", "/sessions"],
  ["DELETE", "/sessions"],
  ["DELETE", "/sessions/8ae1c0d2-1234-4a5b-9c8d-0e1f2a3b4c5d"],
  ["GET", "/sessions/token-exchange"],
  // Error store, FedCM and the WebAuthn helper script.
  ["GET", "/self-service/errors"],
  ["GET", "/self-service/fed-cm/parameters"],
  ["POST", "/self-service/fed-cm/token"],
  ["GET", "/.well-known/ory/webauthn.js"],
  // Kratos operational endpoints.
  ["GET", "/health/ready"],
  ["GET", "/version"],
  // Kratos's provider-less OIDC callback, which none of our providers use.
  ["GET", "/self-service/methods/oidc/callback"],
  // Ory Network enterprise SSO, which we do not configure.
  ["GET", "/self-service/methods/oidc/organization/acme/callback/google"],
  // The mount root itself.
  ["GET", "/"],
];

describe("isAllowedKratosProxyRequest — unlisted paths", () => {
  it.each(unlistedRequests)("denies %s %s", (method, url) => {
    expect(isAllowedKratosProxyRequest({ method, url })).toBe(false);
  });
});

const methodMismatches: ProxyRequest[] = [
  // Flow *submission* paths are POST-only.
  ["GET", "/self-service/login"],
  ["GET", "/self-service/registration"],
  ["GET", "/self-service/verification"],
  ["GET", "/self-service/settings"],
  // Flow *fetch* paths are GET-only.
  ["POST", "/self-service/login/browser"],
  ["POST", "/self-service/settings/flows"],
  ["POST", "/sessions/whoami"],
  // Logout is a GET in the Ory API, so POST must not pass either.
  ["POST", "/self-service/logout"],
  // Methods the frontend never uses, on paths that are otherwise allowed.
  ["DELETE", "/self-service/settings"],
  ["PUT", "/self-service/settings"],
  ["PATCH", "/self-service/settings"],
  ["HEAD", "/sessions/whoami"],
  ["OPTIONS", "/self-service/login"],
];

describe("isAllowedKratosProxyRequest — method mismatches", () => {
  it.each(methodMismatches)("denies %s %s", (method, url) => {
    expect(isAllowedKratosProxyRequest({ method, url })).toBe(false);
  });

  it("is case-sensitive about the method", () => {
    expect(
      isAllowedKratosProxyRequest({ method: "get", url: "/sessions/whoami" }),
    ).toBe(false);
  });
});

const nonCanonicalPaths: string[] = [
  // Encoded traversal, fully and partially encoded.
  "/self-service/login/browser/%2e%2e/%2e%2e/admin/identities",
  "/self-service/%2e%2e/admin/identities",
  "/self-service/login/..%2f..%2fadmin/identities",
  // Encoded separators, which must not be decoded into a match.
  "/self-service%2flogin%2fbrowser",
  "/sessions%2fwhoami",
  // Unencoded traversal.
  "/self-service/login/../../admin/identities",
  "/self-service/./login/browser",
  // Empty and trailing segments are not canonical.
  "//self-service/login/browser",
  "/self-service//login/browser",
  "/self-service/login/browser/",
  // Backslash, treated as a path separator by some servers and proxies.
  "/self-service\\..\\admin/identities",
  // Malformed escape sequences.
  "/self-service/login/%zz",
  "/self-service/login/%",
  // Not mount-relative.
  "self-service/login/browser",
];

describe("canonicaliseKratosProxyPath — traversal and encoding", () => {
  it.each(nonCanonicalPaths)("rejects %s as non-canonical", (url) => {
    expect(canonicaliseKratosProxyPath(url)).toBeUndefined();
    expect(isAllowedKratosProxyRequest({ method: "GET", url })).toBe(false);
  });

  it("does not accept an encoded path that decodes to an allowed one", () => {
    // `%73` is `s`, so this decodes to `/sessions/whoami`.
    expect(
      isAllowedKratosProxyRequest({ method: "GET", url: "/%73essions/whoami" }),
    ).toBe(false);
  });

  it("returns the path unchanged for a canonical URL, dropping the query", () => {
    expect(
      canonicaliseKratosProxyPath("/self-service/login/browser?refresh=true"),
    ).toBe("/self-service/login/browser");
    expect(canonicaliseKratosProxyPath("/sessions/whoami#frag")).toBe(
      "/sessions/whoami",
    );
  });
});

describe("guardKratosProxy", () => {
  const setup = () => {
    const error = vi.fn();
    const next = vi.fn();
    const sendStatus = vi.fn();
    const proxy = vi.fn();

    const guarded = guardKratosProxy({
      logger: { error } as unknown as Logger,
      proxy: proxy as unknown as RequestHandler,
    });

    const call = (
      method: string,
      url: string,
      { origin, ip }: { origin?: string; ip?: string } = {},
    ) => {
      guarded(
        {
          method,
          url,
          headers: origin === undefined ? {} : { origin },
          ip,
        } as unknown as Request,
        { sendStatus } as unknown as Response,
        next as unknown as NextFunction,
      );
    };

    return { call, error, next, proxy, sendStatus };
  };

  it("calls through to the proxy for an allowed request", () => {
    const { call, error, proxy, sendStatus } = setup();

    call("GET", "/self-service/login/browser?refresh=false");

    expect(proxy).toHaveBeenCalledTimes(1);
    expect(sendStatus).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("responds 404 — not 403 — and does not invoke the proxy when denied", () => {
    const { call, next, proxy, sendStatus } = setup();

    call("GET", "/self-service/errors");

    expect(sendStatus).toHaveBeenCalledWith(404);
    expect(proxy).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("logs denials at error level, with the origin and IP that tell a missing entry from a probe", () => {
    const { call, error } = setup();

    call("GET", "/self-service/errors", {
      origin: "https://app.hash.ai",
      ip: "203.0.113.7",
    });
    call("DELETE", "/sessions", { ip: "203.0.113.9" });

    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenNthCalledWith(
      1,
      "Blocked non-allow-listed Kratos proxy request",
      {
        method: "GET",
        path: "/self-service/errors",
        origin: "https://app.hash.ai",
        ip: "203.0.113.7",
        deniedCount: 1,
      },
    );
    expect(error).toHaveBeenNthCalledWith(
      2,
      "Blocked non-allow-listed Kratos proxy request",
      {
        method: "DELETE",
        path: "/sessions",
        origin: undefined,
        ip: "203.0.113.9",
        deniedCount: 2,
      },
    );
  });

  it("never logs or reports the query string, which carries flow ids and codes", () => {
    const { call, error } = setup();

    call("GET", "/self-service/errors?id=super-secret-code");

    expect(error).toHaveBeenCalledWith(
      "Blocked non-allow-listed Kratos proxy request",
      expect.objectContaining({ path: "/self-service/errors" }),
    );
    expect(captureMessage).toHaveBeenCalledWith(
      "Blocked non-allow-listed Kratos proxy request",
      expect.objectContaining({
        extra: expect.objectContaining({ path: "/self-service/errors" }),
      }),
    );
  });

  it("strips non-printable characters from the logged path and origin", () => {
    const { call, error } = setup();

    call("GET", "/self-service/er\nrors", {
      origin: "https://ev\nil.example",
    });

    expect(error).toHaveBeenCalledWith(
      "Blocked non-allow-listed Kratos proxy request",
      expect.objectContaining({
        path: "/self-service/errors",
        origin: "https://evil.example",
      }),
    );
  });

  it("reports a denial to Sentry, fingerprinted by endpoint", () => {
    const { call } = setup();

    call("GET", "/self-service/errors", { ip: "203.0.113.7" });

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      "Blocked non-allow-listed Kratos proxy request",
      {
        level: "error",
        fingerprint: ["kratos-proxy-denied", "GET", "/self-service/errors"],
        extra: {
          method: "GET",
          path: "/self-service/errors",
          origin: undefined,
          ip: "203.0.113.7",
          deniedCount: 1,
        },
      },
    );
  });

  it("reports each denied endpoint once, while still logging every denial", () => {
    const { call, error } = setup();

    call("GET", "/self-service/errors");
    call("GET", "/self-service/errors?attempt=2");
    call("GET", "/version");

    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(3);
  });

  it("stops reporting to Sentry once a caller is enumerating endpoints", () => {
    const { call, error } = setup();

    for (let index = 0; index < 25; index++) {
      call("GET", `/probe-${index}`);
    }

    expect(captureMessage).toHaveBeenCalledTimes(20);
    expect(error).toHaveBeenCalledTimes(25);
  });
});

/**
 * The unit tests above exercise the guard against a stub proxy. These drive a
 * real Express app wrapping a real `http-proxy-middleware` instance, against a
 * stub standing in for Kratos, to assert the property the allow-list exists
 * for: a denied request must not reach the target at all — not even as an
 * inbound connection.
 */
describe("guardKratosProxy — against a real Express and proxy stack", () => {
  const teardown: (() => Promise<void>)[] = [];

  afterEach(async () => {
    await Promise.all(teardown.splice(0).map((fn) => fn()));
  });

  const listen = async (server: http.Server): Promise<number> => {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    teardown.push(
      () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    );
    return (server.address() as AddressInfo).port;
  };

  const setup = async () => {
    const requests: string[] = [];
    let connections = 0;

    const kratos = http.createServer((req, res) => {
      requests.push(`${req.method} ${req.url}`);
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("kratos");
    });
    kratos.on("connection", () => {
      connections += 1;
    });
    const kratosPort = await listen(kratos);

    const app = express();
    app.use(
      "/auth",
      cors({ origin: "http://localhost:3000", credentials: true }),
      guardKratosProxy({
        logger: { error: vi.fn() } as unknown as Logger,
        proxy: createProxyMiddleware({
          target: `http://127.0.0.1:${kratosPort}`,
          pathRewrite: { "^/auth": "" },
          logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }),
      }),
    );
    const port = await listen(http.createServer(app));

    const request = (
      method: string,
      path: string,
      headers: Record<string, string> = {},
    ) =>
      new Promise<{ status?: number; allowOrigin?: string; body: string }>(
        (resolve, reject) => {
          const req = http.request(
            {
              port,
              path,
              method,
              headers: { origin: "http://localhost:3000", ...headers },
            },
            (res) => {
              let body = "";
              res.on("data", (chunk) => {
                body += chunk;
              });
              res.on("end", () =>
                resolve({
                  status: res.statusCode,
                  allowOrigin: res.headers["access-control-allow-origin"],
                  body,
                }),
              );
            },
          );
          req.on("error", reject);
          req.end();
        },
      );

    return { request, requests, connectionCount: () => connections };
  };

  it("forwards an allow-listed request to the target", async () => {
    const { request, requests } = await setup();

    const res = await request("GET", "/auth/sessions/whoami");

    expect(res.status).toBe(200);
    expect(res.body).toBe("kratos");
    expect(requests).toStrictEqual(["GET /sessions/whoami"]);
  });

  it("answers a denied request with 404 without opening a connection to the target", async () => {
    const { request, requests, connectionCount } = await setup();

    const res = await request("GET", "/auth/self-service/errors?id=secret");

    expect(res.status).toBe(404);
    expect(requests).toStrictEqual([]);
    expect(connectionCount()).toBe(0);
  });

  it("denies a traversal attempt without reaching the target", async () => {
    const { request, requests, connectionCount } = await setup();

    const res = await request(
      "GET",
      "/auth/self-service/%2e%2e/admin/identities",
    );

    expect(res.status).toBe(404);
    expect(requests).toStrictEqual([]);
    expect(connectionCount()).toBe(0);
  });

  it("denies a method mismatch on an allow-listed path", async () => {
    const { request, requests } = await setup();

    const res = await request("DELETE", "/auth/self-service/settings");

    expect(res.status).toBe(404);
    expect(requests).toStrictEqual([]);
  });

  it("keeps the CORS headers on a denied response", async () => {
    const { request } = await setup();

    const res = await request("GET", "/auth/self-service/errors");

    expect(res.status).toBe(404);
    expect(res.allowOrigin).toBe("http://localhost:3000");
  });

  it("still answers an OPTIONS preflight ahead of the guard, on any path", async () => {
    const { request, requests } = await setup();

    for (const path of [
      "/auth/self-service/login",
      "/auth/self-service/errors",
    ]) {
      const res = await request("OPTIONS", path, {
        "access-control-request-method": "POST",
      });

      expect(res.status).toBe(204);
      expect(res.allowOrigin).toBe("http://localhost:3000");
    }

    expect(requests).toStrictEqual([]);
  });
});
