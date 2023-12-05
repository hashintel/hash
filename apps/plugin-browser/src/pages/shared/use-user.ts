import { useEffect, useMemo, useState } from "react";

import { getUser } from "../../shared/get-user";
import { clearLocalStorage } from "../../shared/storage";
import { setSentryUser } from "./sentry";
import { useLocalStorage } from "./use-local-storage";

export const useUser = () => {
  const [apiChecked, setApiChecked] = useState(false);
  const [user, setUser, storageChecked] = useLocalStorage("user", null);

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
