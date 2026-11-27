import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";

export type FeatureFlaggedSection =
  | "processes"
  | "goals"
  | "environments"
  | "notes"
  | "dashboards"
  | "favorites"
  | "supplyChain";

type FeatureFlaggedSectionDefinition = {
  /** The user must have every one of these flags enabled. */
  requiredFlags: readonly FeatureFlag[];
  /**
   * The section's own pages, as Next.js pathnames (e.g. `/environments/[uuid]`).
   * A user without the section's flags is redirected away from them.
   */
  pathnames: readonly string[];
};

/**
 * The parts of the app that are only available to users with certain feature
 * flags. The sidebar reads it to decide which links to show, and `_app` reads
 * it to decide which pages to serve, so the two cannot disagree about which
 * flags a section needs.
 */
export const featureFlaggedSections: Record<
  FeatureFlaggedSection,
  FeatureFlaggedSectionDefinition
> = {
  processes: {
    requiredFlags: ["workers"],
    pathnames: [
      "/processes",
      "/flows",
      "/flows/triggers",
      "/workers",
      "/@/[shortname]/flows/[flow-def-id]",
      "/@/[shortname]/flows/[flow-def-id]/edit",
    ],
  },
  goals: {
    requiredFlags: ["workers", "ai"],
    pathnames: ["/goals", "/goals/new"],
  },
  environments: {
    requiredFlags: ["workers"],
    pathnames: ["/environments", "/environments/[uuid]"],
  },
  notes: {
    requiredFlags: ["notes"],
    pathnames: ["/notes"],
  },
  dashboards: {
    requiredFlags: ["dashboards"],
    pathnames: ["/dashboards", "/dashboard/[dashboard-id]"],
  },
  favorites: {
    requiredFlags: ["favorites"],
    pathnames: [],
  },
  supplyChain: {
    requiredFlags: ["supplyChain"],
    // Only the sidebar link needs the flag: the pages are not gated.
    pathnames: [],
  },
};

export const featureFlaggedSectionNames = Object.keys(
  featureFlaggedSections,
) as FeatureFlaggedSection[];

export const isSectionEnabled = (
  section: FeatureFlaggedSection,
  isFlagEnabled: (featureFlag: FeatureFlag) => boolean,
): boolean =>
  featureFlaggedSections[section].requiredFlags.every((featureFlag) =>
    isFlagEnabled(featureFlag),
  );
