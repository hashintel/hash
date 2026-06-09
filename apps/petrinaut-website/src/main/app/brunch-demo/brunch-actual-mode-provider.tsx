import { useEffect, useState, type FC, type PropsWithChildren } from "react";

import { ACTUAL_MODE_TIMELINE_TICK_MS } from "@hashintel/petrinaut-core";
import { ActualModeContext } from "@hashintel/petrinaut/react";

import { normalizeBrunchDefinition } from "./brunch-definition";
import {
  parseDefinitionFrameData,
  parseJsonEventData,
  parseMarkingFrameData,
  parseTransitionFiringFrameData,
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
    receivedEvents: [],
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

  const setCurrentFrameIndex = (frameIndex: number) => {
    setValue((prev) => ({
      ...prev,
      currentFrameIndex: Math.max(0, Math.floor(frameIndex)),
    }));
  };

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

    const setFatalError = (message: string) => {
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

    const setRecoverableConnectionError = (message: string) => {
      if (cancelled) {
        return;
      }

      setValue((prev) => {
        if (prev.status === "error") {
          return prev;
        }

        const canRenderActualMode =
          prev.definition !== null && prev.initialState !== null;

        return {
          ...prev,
          status:
            prev.status === "complete"
              ? "complete"
              : canRenderActualMode
                ? "streaming"
                : "loading",
          timelineNowMs: Date.now(),
          error: message,
        };
      });
    };

    const onOpen = () => {
      if (cancelled) {
        return;
      }

      setValue((prev) => ({
        ...prev,
        error: prev.status === "error" ? prev.error : null,
      }));
    };

    const onDefinition = (event: Event) => {
      void (async () => {
        try {
          const data = parseJsonEventData(event as MessageEvent, "definition");
          const definition = parseDefinitionFrameData(data);

          setValue((prev) => ({
            ...prev,
            status: prev.status === "complete" ? "complete" : "streaming",
            receivedEvents: [
              ...prev.receivedEvents,
              { event: "definition", data },
            ],
            timelineNowMs: Date.now(),
            error: null,
          }));

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
          setFatalError(err instanceof Error ? err.message : String(err));
        }
      })();
    };

    const onInitialState = (event: Event) => {
      try {
        const data = parseJsonEventData(event as MessageEvent, "initial_state");
        const initialState = parseMarkingFrameData(data);
        setValue((prev) => ({
          ...prev,
          status: prev.status === "complete" ? "complete" : "streaming",
          initialState,
          receivedEvents: [
            ...prev.receivedEvents,
            { event: "initial_state", data },
          ],
          timelineNowMs: Date.now(),
          error: null,
        }));
      } catch (err) {
        setFatalError(err instanceof Error ? err.message : String(err));
      }
    };

    const onTransitionFiring = (event: Event) => {
      try {
        const data = parseJsonEventData(
          event as MessageEvent,
          "transition_firing",
        );
        const firing = parseTransitionFiringFrameData(data);
        setValue((prev) => ({
          ...prev,
          status: prev.status === "complete" ? "complete" : "streaming",
          transitionFirings: [...prev.transitionFirings, firing],
          receivedEvents: [
            ...prev.receivedEvents,
            { event: "transition_firing", data },
          ],
          timelineNowMs: Date.now(),
          error: null,
        }));
      } catch (err) {
        setFatalError(err instanceof Error ? err.message : String(err));
      }
    };

    const onTerminal = () => {
      eventSource.close();
      setValue((prev) => ({
        ...prev,
        status: "complete",
        timelineNowMs: Date.now(),
        error: null,
      }));
    };

    const onError = () => {
      setRecoverableConnectionError(
        "Connection to the Brunch stream was interrupted. Reconnecting...",
      );
    };

    eventSource.addEventListener("open", onOpen);
    eventSource.addEventListener("definition", onDefinition);
    eventSource.addEventListener("initial_state", onInitialState);
    eventSource.addEventListener("transition_firing", onTransitionFiring);
    eventSource.addEventListener("terminal", onTerminal);
    eventSource.addEventListener("error", onError);

    return () => {
      cancelled = true;
      eventSource.close();
      eventSource.removeEventListener("open", onOpen);
      eventSource.removeEventListener("definition", onDefinition);
      eventSource.removeEventListener("initial_state", onInitialState);
      eventSource.removeEventListener("transition_firing", onTransitionFiring);
      eventSource.removeEventListener("terminal", onTerminal);
      eventSource.removeEventListener("error", onError);
    };
  }, [endpoint, runId]);

  const contextValue: AvailableActualModeContextValue = {
    ...value,
    setCurrentFrameIndex,
  };

  return <ActualModeContext value={contextValue}>{children}</ActualModeContext>;
};
