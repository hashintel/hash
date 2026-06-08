import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FC,
  type PropsWithChildren,
} from "react";

import { ACTUAL_MODE_TIMELINE_TICK_MS } from "@hashintel/petrinaut-core";
import { ActualModeContext } from "@hashintel/petrinaut/react";

import { normalizeBrunchDefinition } from "./brunch-definition";
import {
  parseDefinitionFrame,
  parseMarkingFrame,
  parseTransitionFiringFrame,
} from "./brunch-frame-parsers";

import type { ActualModeContextValue } from "@hashintel/petrinaut-core";

type AvailableActualModeContextValue = Extract<
  ActualModeContextValue,
  { available: true }
>;

const createLoadingActualModeValue = (
  endpoint: string,
  runId: string | undefined,
): AvailableActualModeContextValue => {
  const now = Date.now();

  return {
    available: true,
    source: {
      kind: "brunch",
      endpoint,
      ...(runId ? { runId } : {}),
    },
    status: "loading",
    title: null,
    definition: null,
    initialState: null,
    transitionFirings: [],
    currentFrameIndex: 0,
    timelineStartedAtMs: now,
    timelineNowMs: now,
    setCurrentFrameIndex: () => {},
    error: null,
  };
};

export const BrunchActualModeProvider: FC<
  PropsWithChildren<{ endpoint: string; runId?: string }>
> = ({ children, endpoint, runId }) => {
  const [value, setValue] = useState<AvailableActualModeContextValue>(() =>
    createLoadingActualModeValue(endpoint, runId),
  );

  const setCurrentFrameIndex = useCallback((frameIndex: number) => {
    setValue((prev) => ({
      ...prev,
      currentFrameIndex: Math.max(0, Math.floor(frameIndex)),
    }));
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setValue((prev) =>
        prev.status === "streaming"
          ? {
              ...prev,
              timelineNowMs: Date.now(),
            }
          : prev,
      );
    }, ACTUAL_MODE_TIMELINE_TICK_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setValue(createLoadingActualModeValue(endpoint, runId));
  }, [endpoint, runId]);

  useEffect(() => {
    let cancelled = false;
    const eventSource = new EventSource(endpoint);

    const setError = (message: string) => {
      if (cancelled) {
        return;
      }

      eventSource.close();
      setValue((prev) => ({
        ...prev,
        status: "error",
        timelineNowMs: Date.now(),
        error: message,
      }));
    };

    const onDefinition = (event: Event) => {
      void (async () => {
        try {
          const definition = parseDefinitionFrame(event as MessageEvent);
          const sdcpn = await normalizeBrunchDefinition(definition);

          if (cancelled) {
            return;
          }

          setValue((prev) => ({
            ...prev,
            status: prev.status === "complete" ? "complete" : "streaming",
            title: definition.title,
            definition: sdcpn,
            timelineNowMs: Date.now(),
            error: null,
          }));
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
    };

    const onInitialState = (event: Event) => {
      try {
        const initialState = parseMarkingFrame(event as MessageEvent);
        setValue((prev) => ({
          ...prev,
          status: prev.status === "complete" ? "complete" : "streaming",
          initialState,
          timelineNowMs: Date.now(),
          error: null,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    const onTransitionFiring = (event: Event) => {
      try {
        const firing = parseTransitionFiringFrame(event as MessageEvent);
        setValue((prev) => ({
          ...prev,
          status: prev.status === "complete" ? "complete" : "streaming",
          transitionFirings: [...prev.transitionFirings, firing],
          timelineNowMs: Date.now(),
          error: null,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    const onTerminal = () => {
      eventSource.close();
      setValue((prev) => ({
        ...prev,
        status: "complete",
        timelineNowMs: Date.now(),
      }));
    };

    const onError = () => {
      setError("Unable to connect to the Brunch stream endpoint.");
    };

    eventSource.addEventListener("definition", onDefinition);
    eventSource.addEventListener("initial_state", onInitialState);
    eventSource.addEventListener("transition_firing", onTransitionFiring);
    eventSource.addEventListener("terminal", onTerminal);
    eventSource.addEventListener("error", onError);

    return () => {
      cancelled = true;
      eventSource.close();
      eventSource.removeEventListener("definition", onDefinition);
      eventSource.removeEventListener("initial_state", onInitialState);
      eventSource.removeEventListener("transition_firing", onTransitionFiring);
      eventSource.removeEventListener("terminal", onTerminal);
      eventSource.removeEventListener("error", onError);
    };
  }, [endpoint, runId]);

  const contextValue = useMemo<AvailableActualModeContextValue>(
    () => ({
      ...value,
      setCurrentFrameIndex,
    }),
    [setCurrentFrameIndex, value],
  );

  return <ActualModeContext value={contextValue}>{children}</ActualModeContext>;
};
