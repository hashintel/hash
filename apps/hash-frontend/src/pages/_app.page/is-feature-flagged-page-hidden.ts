import {
  featureFlaggedSectionNames,
  featureFlaggedSections,
  isSectionEnabled,
} from "../shared/feature-flagged-sections";

import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";

/**
 * Whether `pathname` (a Next.js pathname, e.g. `/environments/[uuid]`) is a
 * page of a section the user lacks the feature flags for.
 */
export const isFeatureFlaggedPageHidden = ({
  pathname,
  enabledFeatureFlags,
}: {
  pathname: string;
  enabledFeatureFlags: readonly FeatureFlag[];
}): boolean =>
  featureFlaggedSectionNames.some(
    (section) =>
      featureFlaggedSections[section].pathnames.includes(pathname) &&
      !isSectionEnabled(section, (featureFlag) =>
        enabledFeatureFlags.includes(featureFlag),
      ),
  );
