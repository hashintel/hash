import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import {
  featureFlaggedSectionNames,
  featureFlaggedSections,
  isSectionEnabled,
} from "./feature-flagged-sections";

import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";

const pagesDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const gatedPathnames = featureFlaggedSectionNames.flatMap((section) =>
  featureFlaggedSections[section].pathnames.map(
    (pathname) => [pathname, section] as const,
  ),
);

test.each(gatedPathnames)(
  "%s, gated with %s, is a page that exists",
  (pathname) => {
    expect(existsSync(path.join(pagesDirectory, `${pathname}.page.tsx`))).toBe(
      true,
    );
  },
);

test("each gated page belongs to one section", () => {
  const pathnames = gatedPathnames.map(([pathname]) => pathname);
  expect(new Set(pathnames).size).toBe(pathnames.length);
});

test("a section needs every one of its flags", () => {
  const withFlags =
    (...enabled: FeatureFlag[]) =>
    (featureFlag: FeatureFlag) =>
      enabled.includes(featureFlag);

  expect(isSectionEnabled("goals", withFlags())).toBe(false);
  expect(isSectionEnabled("goals", withFlags("workers"))).toBe(false);
  expect(isSectionEnabled("goals", withFlags("ai"))).toBe(false);
  expect(isSectionEnabled("goals", withFlags("workers", "ai"))).toBe(true);
  expect(isSectionEnabled("environments", withFlags("workers"))).toBe(true);
  expect(isSectionEnabled("environments", withFlags("notes"))).toBe(false);
});
