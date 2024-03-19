import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import { featureFlags } from "@local/hash-isomorphic-utils/feature-flags";
import { useMemo } from "react";

import { useAuthenticatedUser } from "./auth-info-context";

export const useEnabledFeatureFlags = () => {
  const { authenticatedUser, isInstanceAdmin } = useAuthenticatedUser();

  return useMemo(() => {
    /**
     * If the authenticated user is an instance admin, enable all
     * feature flags for them regardless of the persisted feature
     * flags on the user entity.
     *
     * @todo: revise this when we have an `/admin` page to manage
     * feature flags.
     */
    const enabledFeatureFlags = isInstanceAdmin
      ? Array.from(featureFlags)
      : authenticatedUser.enabledFeatureFlags;

    return featureFlags.reduce<Record<FeatureFlag, boolean>>(
      (prev, featureFlag) => ({
        ...prev,
        [featureFlag]: enabledFeatureFlags.includes(featureFlag),
      }),
      {} as Record<FeatureFlag, boolean>,
    );
  }, [authenticatedUser, isInstanceAdmin]);
};
