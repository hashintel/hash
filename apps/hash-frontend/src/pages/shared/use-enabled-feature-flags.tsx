import { useMemo } from "react";

import { featureFlags } from "@local/hash-isomorphic-utils/feature-flags";

import { useAuthenticatedUser } from "./auth-info-context";

import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";

export const useEnabledFeatureFlags = () => {
  const { authenticatedUser } = useAuthenticatedUser();

  return useMemo(() => {
    const { enabledFeatureFlags } = authenticatedUser;

    return featureFlags.reduce<Record<FeatureFlag, boolean>>(
      (prev, featureFlag) => ({
        ...prev,
        [featureFlag]: enabledFeatureFlags.includes(featureFlag),
      }),
      {} as Record<FeatureFlag, boolean>,
    );
  }, [authenticatedUser]);
};
