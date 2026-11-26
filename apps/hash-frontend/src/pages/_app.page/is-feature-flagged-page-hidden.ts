import { featureFlags } from "@local/hash-isomorphic-utils/feature-flags";

import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";

const featureFlagHiddenPathnames: Record<FeatureFlag, string[]> = {
  pages: [],
  documents: [],
  canvases: [],
  notes: ["/notes"],
  favorites: [],
  workers: [
    "/processes",
    "/goals",
    "/flows",
    "/workers",
    "/agents",
    "/environments",
    "/environments/[uuid]",
  ],
  ai: ["/goals"],
  supplyChain: [],
  dashboards: ["/dashboards", "/dashboard/[dashboard-id]"],
};

export const isFeatureFlaggedPageHidden = ({
  pathname,
  enabledFeatureFlags,
}: {
  pathname: string;
  enabledFeatureFlags: readonly FeatureFlag[];
}): boolean =>
  featureFlags.some(
    (featureFlag) =>
      !enabledFeatureFlags.includes(featureFlag) &&
      featureFlagHiddenPathnames[featureFlag].includes(pathname),
  );
