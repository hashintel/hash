import { afterEach, describe, expect, test, vi } from "vitest";

import {
  buildCspHeader,
  buildReportingEndpointsHeader,
  isProcessEditorPath,
} from "./csp";

const deployment = vi.hoisted(() => ({
  brunchOrigin: null as string | null,
  sentryDsn: undefined as string | undefined,
}));

vi.mock("./public-env", () => ({
  get brunchAgentOrigin() {
    return deployment.brunchOrigin;
  },
  get SENTRY_DSN() {
    return deployment.sentryDsn;
  },
  SENTRY_ENVIRONMENT: "test",
}));

vi.mock("../../buildstamp", () => ({ buildStamp: "commit-abc-main" }));

const directiveSources = (header: string, directive: string): string[] => {
  const entry = header
    .split("; ")
    .find((candidate) => candidate.startsWith(`${directive} `));
  if (!entry) {
    throw new Error(`Directive ${directive} missing from ${header}`);
  }
  return entry.split(" ").slice(1);
};

const processEditorPaths = [
  "/environments/00000000-0000-4000-8000-000000000002",
  "/environments/00000000-0000-4000-8000-000000000002/",
  "/environments/draft",
];

const otherPaths = [
  "/environments",
  "/environments/",
  "/environments/x/y",
  "/",
  "/new",
];

afterEach(() => {
  vi.unstubAllEnvs();
  deployment.brunchOrigin = null;
  deployment.sentryDsn = undefined;
});

describe("isProcessEditorPath", () => {
  test.each(processEditorPaths)("matches %s", (pathname) => {
    expect(isProcessEditorPath(pathname)).toBe(true);
  });

  test.each(otherPaths)("does not match %s", (pathname) => {
    expect(isProcessEditorPath(pathname)).toBe(false);
  });
});

describe("buildCspHeader in production", () => {
  test.each(processEditorPaths)(
    "allows string evaluation and data: fonts on %s",
    (pathname) => {
      vi.stubEnv("NODE_ENV", "production");
      const header = buildCspHeader({ nonce: "abc", pathname });

      expect(directiveSources(header, "script-src")).toContain("'unsafe-eval'");
      expect(directiveSources(header, "font-src")).toEqual(["'self'", "data:"]);
    },
  );

  test.each(otherPaths)("keeps the default policy on %s", (pathname) => {
    vi.stubEnv("NODE_ENV", "production");
    const header = buildCspHeader({ nonce: "abc", pathname });

    expect(directiveSources(header, "script-src")).not.toContain(
      "'unsafe-eval'",
    );
    expect(directiveSources(header, "script-src")).toContain(
      "'wasm-unsafe-eval'",
    );
    expect(directiveSources(header, "font-src")).toEqual(["'self'"]);
  });

  test("differs from the default policy only in script-src and font-src", () => {
    vi.stubEnv("NODE_ENV", "production");
    const processHeader = buildCspHeader({
      nonce: "abc",
      pathname: "/environments/draft",
    });
    const defaultHeader = buildCspHeader({ nonce: "abc", pathname: "/" });

    const differing = processHeader
      .split("; ")
      .filter((entry) => !defaultHeader.split("; ").includes(entry))
      .map((entry) => entry.split(" ")[0]);

    expect(differing).toEqual(["script-src", "font-src"]);
  });
});

describe("buildCspHeader in development", () => {
  test.each([...processEditorPaths, ...otherPaths])(
    "allows string evaluation on %s",
    (pathname) => {
      vi.stubEnv("NODE_ENV", "development");
      const header = buildCspHeader({ nonce: "abc", pathname });

      expect(directiveSources(header, "script-src")).toContain("'unsafe-eval'");
    },
  );

  test.each([...processEditorPaths, ...otherPaths])(
    "allows data: fonts on %s",
    (pathname) => {
      vi.stubEnv("NODE_ENV", "development");
      const header = buildCspHeader({ nonce: "abc", pathname });

      expect(directiveSources(header, "font-src")).toEqual(["'self'", "data:"]);
    },
  );
});

describe("buildCspHeader with Brunch configured", () => {
  test.each([...processEditorPaths, ...otherPaths])(
    "lets %s connect to Brunch, whichever route mounts its assistant",
    (pathname) => {
      vi.stubEnv("NODE_ENV", "production");
      deployment.brunchOrigin = "https://agent.brunch.example";
      const header = buildCspHeader({ nonce: "abc", pathname });

      expect(directiveSources(header, "connect-src")).toContain(
        "https://agent.brunch.example",
      );
    },
  );

  test("adds Brunch's origin alone, and nothing without it", () => {
    vi.stubEnv("NODE_ENV", "production");
    const withoutBrunch = buildCspHeader({ nonce: "abc", pathname: "/" });
    deployment.brunchOrigin = "https://agent.brunch.example";
    const withBrunch = buildCspHeader({ nonce: "abc", pathname: "/" });

    expect(directiveSources(withBrunch, "connect-src")).toEqual(
      expect.arrayContaining(directiveSources(withoutBrunch, "connect-src")),
    );
    expect(
      directiveSources(withBrunch, "connect-src").filter(
        (source) =>
          !directiveSources(withoutBrunch, "connect-src").includes(source),
      ),
    ).toEqual(["https://agent.brunch.example"]);
  });
});

describe("buildCspHeader's Vercel toolbar allowance", () => {
  test.each([
    ["preview", true],
    ["production", false],
    [undefined, false],
  ])(
    "allows vercel.live when the Vercel environment is %s: %s",
    (vercelEnv, allowed) => {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", vercelEnv);
      const header = buildCspHeader({ nonce: "abc", pathname: "/" });

      for (const directive of ["script-src", "connect-src", "frame-src"]) {
        expect(
          directiveSources(header, directive).some(
            (source) => source === "https://vercel.live",
          ),
        ).toBe(allowed);
      }
    },
  );
});

test("lets only this origin frame the app", () => {
  const header = buildCspHeader({ nonce: "abc", pathname: "/" });

  expect(directiveSources(header, "frame-ancestors")).toEqual(["'self'"]);
});

describe("CSP reporting", () => {
  test("reports nowhere without a Sentry DSN", () => {
    expect(buildCspHeader({ nonce: "abc", pathname: "/" })).not.toContain(
      "report-",
    );
    expect(buildReportingEndpointsHeader()).toBe(null);
  });

  test("reports to the DSN's project security endpoint", () => {
    deployment.sentryDsn = "https://key@o1.ingest.sentry.io/42";
    const endpoint =
      "https://o1.ingest.sentry.io/api/42/security/?sentry_key=key&sentry_environment=test&sentry_release=commit-abc-main";
    const header = buildCspHeader({ nonce: "abc", pathname: "/" });

    expect(directiveSources(header, "report-uri")).toEqual([endpoint]);
    expect(directiveSources(header, "report-to")).toEqual(["csp-endpoint"]);
    expect(buildReportingEndpointsHeader()).toBe(`csp-endpoint="${endpoint}"`);
  });
});
