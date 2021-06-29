import { useEffect, useState } from "react";
import { loadRemoteBlock } from "./loadRemoteBlock";

export type UnknownComponent = (...props: any[]) => JSX.Element;

type UseRemoteBlockHook = {
  (url: string): [
    boolean,
    Error | undefined,
    UnknownComponent | string | undefined
  ];
};

type UseRemoteComponentState = {
  loading: boolean;
  err?: Error | undefined;
  component?: UnknownComponent | string | undefined;
};

/**
 * @see https://github.com/Paciolan/remote-component/blob/master/src/hooks/useRemoteComponent.ts
 */
export const useRemoteBlock: UseRemoteBlockHook = (url) => {
  const [{ loading, err, component }, setState] =
    useState<UseRemoteComponentState>({
      loading: true,
      err: undefined,
      component: undefined,
    });

  useEffect(() => {
    let update = setState;
    const controller = new AbortController();
    const signal = controller.signal;

    update({ loading: true, err: undefined, component: undefined });

    loadRemoteBlock(url, signal)
      .then((module) =>
        update({
          loading: false,
          err: undefined,
          component: typeof module === "string" ? module : module.default,
        })
      )
      .catch((err) => update({ loading: false, err, component: undefined }));

    return () => {
      controller.abort();

      // invalidate update function for stale closures
      update = () => {};
    };
  }, [url]);

  return [loading, err, component];
};
