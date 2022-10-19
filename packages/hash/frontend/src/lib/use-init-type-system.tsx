import init from "@blockprotocol/type-system-web";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const TypeSystemContext = createContext<null | {
  loadingTypeSystem: boolean;
  loadTypeSystem: () => Promise<void>;
}>(null);

// @todo consider moving this
export const TypeSystemContextProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
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

  const contextValue = useMemo(
    () => ({
      loadingTypeSystem,
      loadTypeSystem,
    }),
    [loadTypeSystem, loadingTypeSystem],
  );

  return (
    <TypeSystemContext.Provider value={contextValue}>
      {children}
    </TypeSystemContext.Provider>
  );
};

export const useAdvancedInitTypeSystem = () => {
  const context = useContext(TypeSystemContext);
  if (!context) {
    throw new Error("Must be wrapped by TypeSystemContext");
  }

  const { loadingTypeSystem, loadTypeSystem } = context;

  useEffect(() => {
    if (loadingTypeSystem) {
      void loadTypeSystem();
    }
  }, [loadTypeSystem, loadingTypeSystem]);

  return [loadingTypeSystem, loadTypeSystem] as const;
};

export const useInitTypeSystem = () => useAdvancedInitTypeSystem()[0];
