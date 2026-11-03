import { afterEach, describe, expect, test, vi } from "vitest";

import { buildCspHeader, isProcessEditorPath } from "./csp";

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

  test("still keeps data: fonts to the process editor", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(
      directiveSources(
        buildCspHeader({ nonce: "abc", pathname: "/processes" }),
        "font-src",
      ),
    ).toEqual(["'self'"]);
    expect(
      directiveSources(
        buildCspHeader({ nonce: "abc", pathname: "/processes/draft" }),
        "font-src",
      ),
    ).toEqual(["'self'", "data:"]);
  });
});
