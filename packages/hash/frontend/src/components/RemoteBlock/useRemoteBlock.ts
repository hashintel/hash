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
  url: string | null;
};

const remoteModuleCache: Record<string, UseRemoteComponentState> = {};

/**
 * @see https://github.com/Paciolan/remote-component/blob/master/src/hooks/useRemoteComponent.ts
 */
export const useRemoteBlock: UseRemoteBlockHook = (url) => {
  const [{ loading, err, component, url: loadedUrl }, setState] =
    useState<UseRemoteComponentState>(
      remoteModuleCache[url] ?? {
        loading: true,
        err: undefined,
        component: undefined,
        url: null,
      }
    );

  useEffect(() => {
    if (!loading && !err) {
      remoteModuleCache[url] = { loading, err, component, url };
    }
  });

  useEffect(() => {
    if (url === loadedUrl && !loading && !err) {
      return;
    }

    let update = setState;
    const controller = new AbortController();
    const signal = controller.signal;

    update({ loading: true, err: undefined, component: undefined, url: null });

    loadRemoteBlock(url, signal)
      .then((module) =>
        update({
          loading: false,
          err: undefined,
          component: typeof module === "string" ? module : module.default,
          url,
        })
      )
      .catch((err) =>
        update({ loading: false, err, component: undefined, url: null })
      );

    return () => {
      controller.abort();

      // invalidate update function for stale closures
      update = () => {};
    };
  }, [url, loadedUrl]);

  return [loading, err, component];
};
