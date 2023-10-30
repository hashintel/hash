import { useEffect, useMemo, useState } from "react";

import { getUser } from "./get-user";
import { setSentryUser } from "./sentry";
import { useSessionStorage } from "./use-storage-sync";

export const useUser = () => {
  const [apiChecked, setApiChecked] = useState(false);
  const [user, setUser, storageChecked] = useSessionStorage("user", null);

  useEffect(() => {
    const init = async () => {
      const maybeUser = await getUser();

      setUser(maybeUser);
      setSentryUser(maybeUser);
      setApiChecked(true);
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
