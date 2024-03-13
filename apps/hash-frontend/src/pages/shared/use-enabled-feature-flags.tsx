import {
  FeatureFlag,
  featureFlags,
} from "@local/hash-isomorphic-utils/feature-flags";
import { useMemo } from "react";

import { useAuthenticatedUser } from "./auth-info-context";

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
