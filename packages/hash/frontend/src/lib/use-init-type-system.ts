import init from "@blockprotocol/type-system-web";
import { useEffect, useState } from "react";

export const useInitTypeSystem = () => {
  const [loadingTypeSystem, setLoadingTypeSystem] = useState(true);

  useEffect(() => {
    if (loadingTypeSystem) {
      void (async () => {
        await init().then(() => {
          setLoadingTypeSystem(false);
        });
      })();
    }
  }, [loadingTypeSystem, setLoadingTypeSystem]);

  return loadingTypeSystem;
};
