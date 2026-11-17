import { afterEach, describe, expect, test, vi } from "vitest";

import {
  buildCspHeader,
  buildReportingEndpointsHeader,
  buildReportOnlyCspHeader,
  isGoogleIntegrationPath,
  isProcessEditorPath,
} from "./csp";

const deployment = vi.hoisted(() => ({
  brunchOrigin: null as string | null,
  sentryDsn: undefined as string | undefined,
  fileStorageOrigins: [] as string[],
}));

vi.mock("./public-env", () => ({
  get brunchAgentOrigin() {
    return deployment.brunchOrigin;
  },
  get SENTRY_DSN() {
    return deployment.sentryDsn;
  },
  SENTRY_ENVIRONMENT: "test",
  get fileStorageOrigins() {
    return deployment.fileStorageOrigins;
  },
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
  "/processes/00000000-0000-4000-8000-000000000002",
  "/processes/00000000-0000-4000-8000-000000000002/",
  "/processes/draft",
];

const otherPaths = ["/processes", "/processes/", "/processes/x/y", "/", "/new"];

afterEach(() => {
  vi.unstubAllEnvs();
  deployment.brunchOrigin = null;
  deployment.sentryDsn = undefined;
  deployment.fileStorageOrigins = [];
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
      pathname: "/processes/draft",
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

const googleIntegrationPaths = [
  "/settings/integrations/google-sheets",
  "/goals/new",
  "/goals/new/",
  "/@alice/flows/00000000-0000-4000-8000-000000000002",
  "/@alice/workers/00000000-0000-4000-8000-000000000002",
  "/@/alice/workers/00000000-0000-4000-8000-000000000002",
];

const nonGoogleIntegrationPaths = [
  "/",
  "/settings/integrations",
  "/goals",
  "/@alice",
  "/@alice/flows",
  "/@alice/flows/00000000-0000-4000-8000-000000000002/edit",
  "/@alice/entities/00000000-0000-4000-8000-000000000002",
  "/processes/draft",
];

describe("isGoogleIntegrationPath", () => {
  test.each(googleIntegrationPaths)("matches %s", (pathname) => {
    expect(isGoogleIntegrationPath(pathname)).toBe(true);
  });

  test.each(nonGoogleIntegrationPaths)("does not match %s", (pathname) => {
    expect(isGoogleIntegrationPath(pathname)).toBe(false);
  });
});

describe("buildCspHeader's Google allowances", () => {
  test.each(googleIntegrationPaths)("allows Google on %s", (pathname) => {
    vi.stubEnv("NODE_ENV", "production");
    const header = buildCspHeader({ nonce: "abc", pathname });

    expect(directiveSources(header, "script-src")).toEqual(
      expect.arrayContaining([
        "https://accounts.google.com",
        "https://apis.google.com",
      ]),
    );
    expect(directiveSources(header, "frame-src")).toEqual(
      expect.arrayContaining([
        "https://accounts.google.com",
        "https://docs.google.com",
      ]),
    );
    expect(directiveSources(header, "connect-src")).toContain(
      "https://www.googleapis.com",
    );
  });

  test.each(nonGoogleIntegrationPaths)(
    "names no Google origin on %s",
    (pathname) => {
      vi.stubEnv("NODE_ENV", "production");
      const header = buildCspHeader({ nonce: "abc", pathname });

      expect(header).not.toContain("google");
    },
  );
});

describe("buildCspHeader's Vercel toolbar allowance", () => {
  test("allows the toolbar on a Vercel preview deployment", () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    const header = buildCspHeader({ nonce: "abc", pathname: "/" });

    for (const directive of ["script-src", "connect-src", "frame-src"]) {
      expect(directiveSources(header, directive)).toContain(
        "https://vercel.live",
      );
    }
  });

  test.each(["production", undefined])(
    "doesn't allow the toolbar when the Vercel environment is %s",
    (vercelEnv) => {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", vercelEnv);
      const header = buildCspHeader({ nonce: "abc", pathname: "/" });

      expect(header).not.toContain("vercel.live");
    },
  );
});

describe("buildCspHeader's framing", () => {
  test.each([...processEditorPaths, ...otherPaths])(
    "lets only this origin frame %s",
    (pathname) => {
      const header = buildCspHeader({ nonce: "abc", pathname });

      expect(directiveSources(header, "frame-ancestors")).toEqual(["'self'"]);
    },
  );
});

describe("CSP reporting without a Sentry DSN", () => {
  test("reports nowhere and sends no report-only policy", () => {
    const header = buildCspHeader({ nonce: "abc", pathname: "/" });

    expect(header).not.toContain("report-uri");
    expect(header).not.toContain("report-to");
    expect(buildReportOnlyCspHeader({ nonce: "abc", pathname: "/" })).toBe(
      null,
    );
    expect(buildReportingEndpointsHeader()).toBe(null);
  });

  test("treats an empty DSN as none", () => {
    deployment.sentryDsn = "";

    expect(buildReportingEndpointsHeader()).toBe(null);
  });
});

describe("CSP reporting with a Sentry DSN", () => {
  const endpoint =
    "https://o1.ingest.sentry.io/api/42/security/?sentry_key=key&sentry_environment=test&sentry_release=commit-abc-main";

  test("reports violations of the enforced policy to Sentry", () => {
    deployment.sentryDsn = "https://key@o1.ingest.sentry.io/42";
    const header = buildCspHeader({ nonce: "abc", pathname: "/" });

    expect(directiveSources(header, "report-uri")).toEqual([endpoint]);
    expect(directiveSources(header, "report-to")).toEqual(["csp-endpoint"]);
    expect(buildReportingEndpointsHeader()).toBe(`csp-endpoint="${endpoint}"`);
  });

  test("sends no reporting directives for a DSN it can't parse", () => {
    deployment.sentryDsn = "not a dsn";

    expect(buildCspHeader({ nonce: "abc", pathname: "/" })).not.toContain(
      "report-",
    );
    expect(buildReportingEndpointsHeader()).toBe(null);
  });

  test.each(["img-src", "connect-src"])(
    "narrows %s to the API and file storage in the report-only policy",
    (directive) => {
      vi.stubEnv("NODE_ENV", "production");
      deployment.sentryDsn = "https://key@o1.ingest.sentry.io/42";
      deployment.fileStorageOrigins = [
        "https://bucket.s3.us-east-1.amazonaws.com",
        "https://files.example",
      ];
      const enforced = buildCspHeader({ nonce: "abc", pathname: "/" });
      const reportOnly = buildReportOnlyCspHeader({
        nonce: "abc",
        pathname: "/",
      });
      if (reportOnly === null) {
        throw new Error("Expected a report-only policy");
      }

      expect(directiveSources(enforced, directive)).toContain("https:");
      expect(directiveSources(reportOnly, directive)).toEqual([
        ...directiveSources(enforced, directive).filter(
          (source) => source !== "https:",
        ),
        "http://localhost:5001",
        "https://bucket.s3.us-east-1.amazonaws.com",
        "https://files.example",
      ]);
    },
  );

  test("matches the enforced policy outside img-src and connect-src", () => {
    vi.stubEnv("NODE_ENV", "production");
    deployment.sentryDsn = "https://key@o1.ingest.sentry.io/42";
    deployment.fileStorageOrigins = ["https://files.example"];
    const enforced = buildCspHeader({ nonce: "abc", pathname: "/" });
    const reportOnly =
      buildReportOnlyCspHeader({ nonce: "abc", pathname: "/" }) ?? "";

    const differing = reportOnly
      .split("; ")
      .filter((entry) => !enforced.split("; ").includes(entry))
      .map((entry) => entry.split(" ")[0]);

    expect(differing).toEqual(["img-src", "connect-src"]);
  });

  test("keeps plain HTTP for local storage in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    deployment.sentryDsn = "https://key@o1.ingest.sentry.io/42";
    const reportOnly =
      buildReportOnlyCspHeader({ nonce: "abc", pathname: "/" }) ?? "";

    expect(directiveSources(reportOnly, "img-src")).toContain("http:");
    expect(directiveSources(reportOnly, "connect-src")).toContain("http:");
  });
});
