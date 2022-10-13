import init from "@blockprotocol/type-system-web";
import { useCallback, useEffect, useRef, useState } from "react";

export const useAdvancedInitTypeSystem = () => {
  const [loadingTypeSystem, setLoadingTypeSystem] = useState(true);
  const loadingPromise = useRef<Promise<void> | null>(null);

  const loadTypeSystem = useCallback(() => {
    if (loadingPromise.current) {
      return loadingPromise.current;
    }

    loadingPromise.current = (async () => {
      await init().then(() => {
        setLoadingTypeSystem(false);
      });
    })();

    return loadingPromise.current;
  }, []);

  useEffect(() => {
    if (loadingTypeSystem) {
      void loadTypeSystem();
    }
  }, [loadTypeSystem, loadingTypeSystem]);

  return [loadingTypeSystem, loadTypeSystem] as const;
};

export const useInitTypeSystem = () => useAdvancedInitTypeSystem()[0];
