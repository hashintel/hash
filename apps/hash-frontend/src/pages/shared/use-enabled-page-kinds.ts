import { useMemo } from "react";

import { useHashInstance } from "../../components/hooks/use-hash-instance";
import { useEnabledFeatureFlags } from "./use-enabled-feature-flags";
import { useEnabledSections } from "./use-enabled-sections";

/**
 * Which kinds of page the authenticated user can use. The sidebar's Pages
 * section and the /pages listing both read this, so that they cannot disagree
 * about what counts as a page.
 */
export const useEnabledPageKinds = (): {
  blockPages: boolean;
  dashboards: boolean;
} => {
  const enabledFeatureFlags = useEnabledFeatureFlags();
  const { dashboards } = useEnabledSections();
  const { hashInstance } = useHashInstance();

  const blockPages =
    enabledFeatureFlags.pages && !!hashInstance?.properties.pagesAreEnabled;

  return useMemo(() => ({ blockPages, dashboards }), [blockPages, dashboards]);
};
