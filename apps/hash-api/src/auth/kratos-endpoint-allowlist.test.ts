import { describe, expect, it, vi } from "vitest";

import {
  canonicaliseKratosProxyPath,
  createKratosProxyAllowlist,
  isAllowedKratosProxyRequest,
  KRATOS_PROXY_ALLOWLIST,
} from "./kratos-endpoint-allowlist";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { NextFunction, Request, Response } from "express";

type ProxyRequest = [method: string, url: string];

/**
 * A concrete example request for every entry in the allow-list, so the
 * "allowed" cases are asserted against real paths rather than re-derived from
 * the constant under test. The one `RegExp` entry is represented by the two
 * provider ids configured in `infra/compose/kratos/kratos.yml`.
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

describe("createKratosProxyAllowlist middleware", () => {
  const setup = () => {
    const warn = vi.fn();
    const next = vi.fn();
    const sendStatus = vi.fn();

    const middleware = createKratosProxyAllowlist({
      logger: { warn } as unknown as Logger,
    });

    const call = (method: string, url: string) => {
      middleware(
        { method, url } as unknown as Request,
        { sendStatus } as unknown as Response,
        next as unknown as NextFunction,
      );
    };

    return { call, next, sendStatus, warn };
  };

  it("calls through to the proxy for an allowed request", () => {
    const { call, next, sendStatus, warn } = setup();

    call("GET", "/self-service/login/browser?refresh=false");

    expect(next).toHaveBeenCalledTimes(1);
    expect(sendStatus).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("responds 404 — not 403 — and does not call through when denied", () => {
    const { call, next, sendStatus } = setup();

    call("GET", "/self-service/errors");

    expect(sendStatus).toHaveBeenCalledWith(404);
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
