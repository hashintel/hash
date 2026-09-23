import { useEffect, useState, type FC, type PropsWithChildren } from "react";

import {
  ACTUAL_MODE_TIMELINE_TICK_MS,
  applyActualModeTransitionFiring,
} from "@hashintel/petrinaut-core";
import { ActualModeContext } from "@hashintel/petrinaut/react";

import { normalizeBrunchDefinition } from "./brunch-definition";
import {
  parseDefinitionFrameData,
  parseJsonEventData,
  parseMarkingFrameData,
  parseTransitionFiringFrameData,
} from "./brunch-frame-parsers";

import type {
  ActualModeContextValue,
  ActualModeMarking,
  ActualModeTransitionFiring,
} from "@hashintel/petrinaut-core";

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
    timelineStartedAtMs: now,
    timelineNowMs: now,
    error: null,
  };
};

const applyTransitionFiringFrame = (
  marking: ActualModeMarking,
  firing: ActualModeTransitionFiring,
): ActualModeMarking => {
  try {
    return applyActualModeTransitionFiring(marking, firing);
  } catch (err) {
    throw new Error(
      `Invalid Brunch transition_firing frame: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
};

export const BrunchActualModeProvider: FC<
  PropsWithChildren<{ endpoint: string; runId?: string }>
> = ({ children, endpoint, runId }) => {
  const [value, setValue] = useState<AvailableActualModeContextValue>(() =>
    createLoadingActualModeValue(endpoint, runId),
  );

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
    let hasConnectedBefore = false;
    const eventSource = new EventSource(endpoint);
    // Each firing is applied here as it arrives, so one that consumes a token
    // the marking does not hold ends the stream with an error before it
    // reaches the context, whose frames are replayed during render.
    let receivedInitialState: ActualModeMarking | null = null;
    let receivedFirings: ActualModeTransitionFiring[] = [];
    let replayedMarking: ActualModeMarking | null = null;

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

      const isReconnect = hasConnectedBefore;
      hasConnectedBefore = true;

      if (isReconnect) {
        receivedFirings = [];
        replayedMarking = receivedInitialState;
      }

      setValue((prev) => {
        const error = prev.status === "error" ? prev.error : null;

        if (!isReconnect) {
          return { ...prev, error };
        }

        // The temporary Brunch protocol replays the whole run (definition,
        // initial_state, and every past transition_firing) on each connection,
        // so appending across an automatic reconnect would duplicate every
        // previously received event. Drop the accumulated events and let the
        // replay rebuild them; the already-loaded definition and initial state
        // stay visible until the replay re-delivers them. The timeline start
        // is re-baselined too, so the briefly empty firing list does not
        // synthesize tick frames reaching back to the original page load.
        return {
          ...prev,
          transitionFirings: [],
          receivedEvents: [],
          timelineStartedAtMs: Date.now(),
          timelineNowMs: Date.now(),
          error,
        };
      });
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
        receivedInitialState = initialState;
        replayedMarking = receivedFirings.reduce(
          (marking, firing) => applyTransitionFiringFrame(marking, firing),
          initialState,
        );
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
        if (replayedMarking !== null) {
          replayedMarking = applyTransitionFiringFrame(replayedMarking, firing);
        }
        receivedFirings.push(firing);
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

  return <ActualModeContext value={value}>{children}</ActualModeContext>;
};
