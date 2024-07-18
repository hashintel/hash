import { useEffect, useMemo, useState } from "react";

import { getUser } from "../../shared/get-user";
import { clearLocalStorage } from "../../shared/storage";
import { setSentryUser } from "./sentry";
import { useStorageSync } from "./use-storage-sync";

/**
 * This will fetch a new version of the user wherever the hook is called.
 * If you want to use the user across multiple components, e.g. in the popup, useUserContext instead.
 */
export const useUserValue = () => {
  const [apiChecked, setApiChecked] = useState(false);
  const [user, setUser, storageChecked] = useStorageSync("user", null);

  useEffect(() => {
    const init = async () => {
      const maybeUser = await getUser();

      setUser(maybeUser);
      setSentryUser(maybeUser);
      setApiChecked(true);

      if (!maybeUser) {
        void clearLocalStorage();
      }
    };

    void init();
  }, [setUser]);

  const loading = useMemo(
    () => !user && (!apiChecked || !storageChecked),
    [apiChecked, storageChecked, user],
  );

  return {
    loading,
    user,
  };
};
