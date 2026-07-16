import { useCallback, useEffect, useState } from "react";

import {
  AtlasClientError,
  isAbortError,
  loadAtlasSession,
  type AtlasSession,
} from "./atlas-client";
import { AtlasCanvas } from "./atlas-demo/atlas-canvas";
import { AtlasNotice, atlasErrorCopy } from "./atlas-demo/atlas-notice";

type BootstrapState =
  | { readonly phase: "error"; readonly error: AtlasClientError }
  | { readonly phase: "loading" }
  | { readonly phase: "ready"; readonly session: AtlasSession };

/** Boots the active Atlas generation before mounting any GPU resources. */
export const AtlasDemo = () => {
  const [reloadEpoch, setReloadEpoch] = useState(0);
  const [state, setState] = useState<BootstrapState>({ phase: "loading" });
  const reload = useCallback(() => {
    setState({ phase: "loading" });
    setReloadEpoch((epoch) => epoch + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAtlasSession(controller.signal)
      .then((session) => {
        setState({ phase: "ready", session });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return;
        }
        setState({
          phase: "error",
          error:
            error instanceof AtlasClientError
              ? error
              : new AtlasClientError(
                  "network",
                  "Atlas bootstrap failed unexpectedly",
                  { cause: error },
                ),
        });
      });
    return () => {
      controller.abort();
    };
  }, [reloadEpoch]);

  if (state.phase === "ready") {
    return (
      <AtlasCanvas
        key={reloadEpoch}
        onReload={reload}
        session={state.session}
      />
    );
  }

  if (state.phase === "loading") {
    return (
      <main className="atlas-demo">
        <h1 className="sr-only">Atlas tile field</h1>
        <AtlasNotice title="Connecting to Atlas">
          Loading the active generation and validating its published manifest.
        </AtlasNotice>
      </main>
    );
  }

  const copy = atlasErrorCopy(state.error);
  return (
    <main className="atlas-demo">
      <h1 className="sr-only">Atlas tile field</h1>
      <AtlasNotice
        title={copy.title}
        detail={state.error.message}
        actions={
          <button type="button" onClick={reload}>
            Retry bootstrap
          </button>
        }
      >
        {copy.body}
      </AtlasNotice>
    </main>
  );
};
