import { expect, test } from "vitest";

import { isFeatureFlaggedPageHidden } from "./is-feature-flagged-page-hidden";

test.each([
  "/processes",
  "/environments",
  "/environments/[uuid]",
  "/flows",
  "/workers",
])("%s requires the workers flag", (pathname) => {
  expect(
    isFeatureFlaggedPageHidden({ pathname, enabledFeatureFlags: [] }),
  ).toBe(true);
  expect(
    isFeatureFlaggedPageHidden({ pathname, enabledFeatureFlags: ["ai"] }),
  ).toBe(true);
  expect(
    isFeatureFlaggedPageHidden({
      pathname,
      enabledFeatureFlags: ["workers"],
    }),
  ).toBe(false);
});

test("goals requires both workers and AI", () => {
  const pathname = "/goals";
  expect(
    isFeatureFlaggedPageHidden({ pathname, enabledFeatureFlags: ["workers"] }),
  ).toBe(true);
  expect(
    isFeatureFlaggedPageHidden({ pathname, enabledFeatureFlags: ["ai"] }),
  ).toBe(true);
  expect(
    isFeatureFlaggedPageHidden({
      pathname,
      enabledFeatureFlags: ["workers", "ai"],
    }),
  ).toBe(false);
});

test.each(["/", "/entities", "/types", "/actions"])(
  "%s does not require a flag",
  (pathname) => {
    expect(
      isFeatureFlaggedPageHidden({ pathname, enabledFeatureFlags: [] }),
    ).toBe(false);
  },
);
