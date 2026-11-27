import { useMemo } from "react";

import {
  featureFlaggedSectionNames,
  isSectionEnabled,
} from "./feature-flagged-sections";
import { useEnabledFeatureFlags } from "./use-enabled-feature-flags";

import type { FeatureFlaggedSection } from "./feature-flagged-sections";

/**
 * Which feature-flagged sections of the app the authenticated user can use.
 * Prefer this to checking a flag directly when deciding whether to link to a
 * section, so that the link and the section's pages cannot disagree.
 */
export const useEnabledSections = (): Record<
  FeatureFlaggedSection,
  boolean
> => {
  const enabledFeatureFlags = useEnabledFeatureFlags();

  return useMemo(
    () =>
      Object.fromEntries(
        featureFlaggedSectionNames.map((section) => [
          section,
          isSectionEnabled(
            section,
            (featureFlag) => enabledFeatureFlags[featureFlag],
          ),
        ]),
      ) as Record<FeatureFlaggedSection, boolean>,
    [enabledFeatureFlags],
  );
};
