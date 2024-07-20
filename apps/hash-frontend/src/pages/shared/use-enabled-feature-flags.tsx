import { useMemo } from "react";
import type {
  FeatureFlag,
  featureFlags,
} from "@local/hash-isomorphic-utils/feature-flags";
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
      ? [...featureFlags]
      : authenticatedUser.enabledFeatureFlags;

    return Object.fromEntries(
      featureFlags.map<Record<FeatureFlag, boolean>>((featureFlag) => [
        featureFlag,
        enabledFeatureFlags.includes(featureFlag),
      ]),
    );
  }, [authenticatedUser, isInstanceAdmin]);
};
