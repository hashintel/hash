import { useCallback, useEffect, useRef, useState } from "react";

const useIsMounted = () => {
  const mounted = useRef<boolean>();

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  return mounted;
};

export const useLoadingCallback = <
  TCallback extends (...args: any[]) => Promise<unknown> | unknown,
>(
  callback: TCallback,
): [TCallback, boolean] => {
  const [loading, setLoading] = useState<boolean>(false);
  const isMounted = useIsMounted();

  const loadingCallback = useCallback(
    async (...args: Parameters<TCallback>) => {
      setLoading(true);
      try {
        return await callback(...args);
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    },
    [callback, isMounted],
  ) as TCallback;

  return [loadingCallback, loading];
};
