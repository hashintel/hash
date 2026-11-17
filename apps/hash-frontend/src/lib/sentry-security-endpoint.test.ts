import { describe, expect, test } from "vitest";

import { sentrySecurityEndpoint } from "./sentry-security-endpoint";

describe("sentrySecurityEndpoint", () => {
  test("maps a DSN to its project's security endpoint", () => {
    expect(
      sentrySecurityEndpoint({
        dsn: "https://abc123@o456.ingest.us.sentry.io/789",
      }),
    ).toBe(
      "https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123",
    );
  });

  test("keeps the DSN's port and path prefix", () => {
    expect(
      sentrySecurityEndpoint({
        dsn: "http://abc123@sentry.example:9000/prefix/path/789",
      }),
    ).toBe(
      "http://sentry.example:9000/prefix/path/api/789/security/?sentry_key=abc123",
    );
  });

  test("ignores a DSN's secret key", () => {
    expect(
      sentrySecurityEndpoint({ dsn: "https://abc123:secret@sentry.example/1" }),
    ).toBe("https://sentry.example/api/1/security/?sentry_key=abc123");
  });

  test("adds the environment and release, encoded", () => {
    const endpoint = sentrySecurityEndpoint({
      dsn: "https://abc123@sentry.example/1",
      environment: "production",
      release: "commit-abc-feature/x;y,z",
    });

    expect(endpoint).toBe(
      "https://sentry.example/api/1/security/?sentry_key=abc123&sentry_environment=production&sentry_release=commit-abc-feature%2Fx%3By%2Cz",
    );
    expect(endpoint, "a CSP source list can't hold `;` or `,`").not.toMatch(
      /[;,\s"]/,
    );
  });

  test("omits an empty environment and release", () => {
    expect(
      sentrySecurityEndpoint({
        dsn: "https://abc123@sentry.example/1",
        environment: "",
        release: "",
      }),
    ).toBe("https://sentry.example/api/1/security/?sentry_key=abc123");
  });

  test.each([
    "",
    "not a url",
    "https://sentry.example/1",
    "https://abc123@sentry.example/",
    "https://abc123@sentry.example/project",
    "ftp://abc123@sentry.example/1",
  ])("rejects the DSN %j", (dsn) => {
    expect(sentrySecurityEndpoint({ dsn })).toBeNull();
  });
});
