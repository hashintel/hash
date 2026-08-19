import http from "node:http";

import cors from "cors";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canonicaliseKratosProxyPath,
  guardKratosProxy,
  isAllowedKratosProxyRequest,
  KRATOS_PROXY_ALLOWLIST,
} from "./kratos-endpoint-allowlist";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AddressInfo } from "node:net";

type ProxyRequest = [method: string, url: string];

/**
 * A concrete example request for every entry in the allow-list, so the
 * "allowed" cases are asserted against real paths rather than re-derived from
 * the constant under test. The one `RegExp` entry is represented by the two
 * configured SSO provider ids.
 */
const allowedRequests: ProxyRequest[] = [
  ["GET", "/sessions/whoami"],

  ["GET", "/self-service/login/browser?refresh=false"],
  ["GET", "/self-service/login/flows?id=1d0b8a3e-flow"],
  ["POST", "/self-service/login?flow=1d0b8a3e-flow"],

  ["GET", "/self-service/registration/browser"],
  ["GET", "/self-service/registration/flows?id=1d0b8a3e-flow"],
  ["POST", "/self-service/registration?flow=1d0b8a3e-flow"],

  ["GET", "/self-service/verification/browser"],
  ["GET", "/self-service/verification/flows?id=1d0b8a3e-flow"],
  ["POST", "/self-service/verification?flow=1d0b8a3e-flow"],

  ["GET", "/self-service/recovery/browser"],
  ["GET", "/self-service/recovery/flows?id=1d0b8a3e-flow"],
  ["POST", "/self-service/recovery?flow=1d0b8a3e-flow"],

  ["GET", "/self-service/settings/browser"],
  ["GET", "/self-service/settings/flows?id=1d0b8a3e-flow"],
  ["POST", "/self-service/settings?flow=1d0b8a3e-flow"],

  ["GET", "/self-service/logout/browser"],
  ["GET", "/self-service/logout?token=a-logout-token"],

  ["GET", "/self-service/methods/oidc/callback/google?code=abc&state=def"],
  ["POST", "/self-service/methods/oidc/callback/microsoft"],
];

describe("isAllowedKratosProxyRequest — allowed endpoints", () => {
  it.each(allowedRequests)("allows %s %s", (method, url) => {
    expect(isAllowedKratosProxyRequest(method, url)).toBe(true);
  });

  it("covers every entry in the allow-list with at least one example", () => {
    const matchedRules = KRATOS_PROXY_ALLOWLIST.filter(({ path, methods }) =>
      allowedRequests.some(([method, url]) => {
        const pathname = canonicaliseKratosProxyPath(url);
        return (
          pathname !== undefined &&
          (methods as readonly string[]).includes(method) &&
          (typeof path === "string" ? path === pathname : path.test(pathname))
        );
      }),
    );

    expect(matchedRules).toHaveLength(KRATOS_PROXY_ALLOWLIST.length);
  });

  it("keeps working when a flow id arrives as a query string", () => {
    expect(
      isAllowedKratosProxyRequest(
        "POST",
        "/self-service/verification?flow=8ae1c0d2-1234-4a5b-9c8d-0e1f2a3b4c5d",
      ),
    ).toBe(true);
  });

  it("does not let a query string smuggle in an allowed path", () => {
    expect(
      isAllowedKratosProxyRequest("GET", "/admin/identities?/sessions/whoami"),
    ).toBe(false);
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
  // Ory Network enterprise SSO, which we do not configure.
  ["GET", "/self-service/methods/oidc/organization/acme/callback/google"],
  // The mount root itself.
  ["GET", "/"],
];

describe("isAllowedKratosProxyRequest — unlisted paths", () => {
  it.each(unlistedRequests)("denies %s %s", (method, url) => {
    expect(isAllowedKratosProxyRequest(method, url)).toBe(false);
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
    expect(isAllowedKratosProxyRequest(method, url)).toBe(false);
  });

  it("is case-sensitive about the method", () => {
    expect(isAllowedKratosProxyRequest("get", "/sessions/whoami")).toBe(false);
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
    expect(isAllowedKratosProxyRequest("GET", url)).toBe(false);
  });

  it("does not accept an encoded path that decodes to an allowed one", () => {
    // `%73` is `s`, so this decodes to `/sessions/whoami`.
    expect(isAllowedKratosProxyRequest("GET", "/%73essions/whoami")).toBe(
      false,
    );
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
    const warn = vi.fn();
    const next = vi.fn();
    const sendStatus = vi.fn();
    const proxy = vi.fn();

    const guarded = guardKratosProxy({
      logger: { warn } as unknown as Logger,
      proxy: proxy as unknown as RequestHandler,
    });

    const call = (method: string, url: string) => {
      guarded(
        { method, url } as unknown as Request,
        { sendStatus } as unknown as Response,
        next as unknown as NextFunction,
      );
    };

    return { call, next, proxy, sendStatus, warn };
  };

  it("calls through to the proxy for an allowed request", () => {
    const { call, proxy, sendStatus, warn } = setup();

    call("GET", "/self-service/login/browser?refresh=false");

    expect(proxy).toHaveBeenCalledTimes(1);
    expect(sendStatus).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("responds 404 — not 403 — and does not invoke the proxy when denied", () => {
    const { call, next, proxy, sendStatus } = setup();

    call("GET", "/self-service/errors");

    expect(sendStatus).toHaveBeenCalledWith(404);
    expect(proxy).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("logs and counts denials so an omitted endpoint is discoverable", () => {
    const { call, warn } = setup();

    call("GET", "/self-service/errors");
    call("DELETE", "/sessions");

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(
      1,
      "Blocked non-allow-listed Kratos proxy request",
      { method: "GET", path: "/self-service/errors", deniedCount: 1 },
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      "Blocked non-allow-listed Kratos proxy request",
      { method: "DELETE", path: "/sessions", deniedCount: 2 },
    );
  });

  it("never logs the query string, which carries flow ids and codes", () => {
    const { call, warn } = setup();

    call("GET", "/self-service/errors?id=super-secret-code");

    expect(warn).toHaveBeenCalledWith(
      "Blocked non-allow-listed Kratos proxy request",
      { method: "GET", path: "/self-service/errors", deniedCount: 1 },
    );
  });

  it("strips non-printable characters from the logged path", () => {
    const { call, warn } = setup();

    call("GET", "/self-service/er\nrors");

    expect(warn).toHaveBeenCalledWith(
      "Blocked non-allow-listed Kratos proxy request",
      { method: "GET", path: "/self-service/errors", deniedCount: 1 },
    );
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
        logger: { warn: vi.fn() } as unknown as Logger,
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
