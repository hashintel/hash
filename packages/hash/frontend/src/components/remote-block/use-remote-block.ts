import { useEffect, useRef, useState } from "react";

import {
  loadCrossFrameRemoteBlock,
  loadRemoteBlock,
  UnknownBlock,
} from "./loadremote-block";
import { isTopWindow } from "./util";

type UseRemoteBlockHook = {
  (url: string, crossFrame?: boolean, onBlockLoaded?: () => void): [
    boolean,
    Error | undefined,
    UnknownBlock | undefined,
  ];
};

type UseRemoteComponentState = {
  loading: boolean;
  err?: Error | undefined;
  component?: UnknownBlock | undefined;
  url: string | null;
};

// @todo put this in context
const remoteModuleCache: Record<string, UseRemoteComponentState> = {};

export const loadBlockComponent = (
  sourceUrl: string,
  crossFrame = false,
  signal?: AbortSignal,
) => {
  const blockLoaderFn = crossFrame
    ? loadCrossFrameRemoteBlock
    : loadRemoteBlock;

  return blockLoaderFn(sourceUrl, signal).then((module) => {
    remoteModuleCache[sourceUrl] = {
      loading: false,
      err: undefined,
      component: typeof module === "string" ? module : module.default,
      url: sourceUrl,
    };

    return remoteModuleCache[sourceUrl]!;
  });
};

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

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current && url === loadedUrl && !loading && !err) {
      loadedRef.current = true;
      onBlockLoadedRef.current?.();
    }
  });

  useEffect(() => {
    if (url === loadedUrl && !loading && !err) {
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    loadedRef.current = false;

    setState({
      loading: true,
      err: undefined,
      component: undefined,
      url: null,
    });

    loadBlockComponent(url, crossFrame, signal)
      .then((result) => {
        setState(result);
      })
      .catch((newErr) => {
        if (!controller.signal.aborted) {
          setState({
            loading: false,
            err: newErr,
            component: undefined,
            url: null,
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [err, crossFrame, loading, onBlockLoaded, url, loadedUrl]);

  return [loading, err, component];
};
