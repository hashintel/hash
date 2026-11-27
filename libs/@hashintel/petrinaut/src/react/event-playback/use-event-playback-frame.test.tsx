/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import {
  ExecutionTraceContext,
  NO_VIEWED_EXECUTION,
} from "../execution-trace/context";
import { createQueueTrace } from "../execution-trace/trace.test-helpers";
import { useStoreSelector } from "../shared/use-store";
import { EventPlaybackContext } from "./context";
import { useEventPlaybackFrame } from "./use-event-playback-frame";

afterEach(cleanup);

it("sees a firing the trace records while the viewed time holds", () => {
  // One trace that grows in place, as its source writes it.
  const { trace, finish } = createQueueTrace({
    firingTimes: [],
    coveredTime: 0,
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ExecutionTraceContext
      value={{ ...NO_VIEWED_EXECUTION, trace, playable: trace }}
    >
      <EventPlaybackContext
        value={{
          ...use(EventPlaybackContext),
          eventCount: useStoreSelector(
            trace.coverage,
            (coverage) => coverage.eventCount,
          ),
        }}
      >
        {children}
      </EventPlaybackContext>
    </ExecutionTraceContext>
  );

  const { result } = renderHook(() => useEventPlaybackFrame(), {
    wrapper: Wrapper,
  });
  expect(result.current.hasNextEvent).toBe(false);
  expect(result.current.currentFrameReader?.getPlaceTokenCount("queued")).toBe(
    3,
  );

  act(() => finish(1));

  expect(result.current.hasNextEvent).toBe(true);
});
