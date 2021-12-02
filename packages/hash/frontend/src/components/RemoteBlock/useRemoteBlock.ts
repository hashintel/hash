import { useEffect, useRef, useState } from "react";
import {
  loadCrossFrameRemoteBlock,
  loadRemoteBlock,
  UnknownComponent,
} from "./loadRemoteBlock";
import { isTopWindow } from "./util";

type UseRemoteBlockHook = {
  (url: string, crossFrame?: boolean, onBlockLoaded?: () => void): [
    boolean,
    Error | undefined,
    UnknownComponent | string | undefined,
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
export const useRemoteBlock: UseRemoteBlockHook = (
  url,
  crossFrame,
  onBlockLoaded,
) => {
  if (crossFrame && isTopWindow()) {
    throw new Error(
      "crossFrame passed to useRemoteBlock from top window. This should be set from framed windows only.",
    );
  }

  const [{ loading, err, component, url: loadedUrl }, setState] =
    useState<UseRemoteComponentState>(
      remoteModuleCache[url] ?? {
        loading: true,
        err: undefined,
        component: undefined,
        url: null,
      },
    );

  useEffect(() => {
    if (!loading && !err) {
      remoteModuleCache[url] = { loading, err, component, url };
    }
  });

  const onBlockLoadedRef = useRef<() => void>();
  useEffect(() => {
    onBlockLoadedRef.current = onBlockLoaded;
  });

  useEffect(() => {
    if (url === loadedUrl && !loading && !err) {
      return;
    }

    let update = setState;
    const controller = new AbortController();
    const signal = controller.signal;

    update({ loading: true, err: undefined, component: undefined, url: null });

    const blockLoaderFn = crossFrame
      ? loadCrossFrameRemoteBlock
      : loadRemoteBlock;

    blockLoaderFn(url, signal)
      .then((module) => {
        update({
          loading: false,
          err: undefined,
          component: typeof module === "string" ? module : module.default,
          url,
        });

        if (onBlockLoadedRef.current && !signal.aborted) {
          onBlockLoadedRef.current();
        }
      })
      .catch((newErr) =>
        update({
          loading: false,
          err: newErr,
          component: undefined,
          url: null,
        }),
      );

    return () => {
      controller.abort();

      // invalidate update function for stale closures
      update = () => {};
    };
  }, [err, crossFrame, loading, onBlockLoaded, url, loadedUrl]);

  return [loading, err, component];
};
