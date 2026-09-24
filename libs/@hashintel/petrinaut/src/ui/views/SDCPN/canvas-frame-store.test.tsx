/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  emptyExecutionFrameSource,
  ExecutionFrameSourceContext,
} from "../../../react/execution-frame/context";
import { SimulationContext } from "../../../react/simulation/context";
import { EditorContext } from "../../../react/state/editor-context";
import {
  CanvasFrameStoreProvider,
  usePlaceTokenCount,
  useTransitionFrame,
} from "./canvas-frame-store";

import type { ExecutionFrameSource } from "../../../react/execution-frame/context";
import type {
  InitialMarking,
  SimulationContextValue,
  SimulationFrameReader,
} from "../../../react/simulation/context";
import type { EditorContextValue } from "../../../react/state/editor-context";

const renders = new Map<string, number>();
const countRender = (key: string) =>
  renders.set(key, (renders.get(key) ?? 0) + 1);

const Tokens: React.FC<{ placeId: string }> = ({ placeId }) => {
  countRender(placeId);
  const tokens = usePlaceTokenCount(placeId);
  return <output data-testid={placeId}>{tokens ?? "none"}</output>;
};

const Firings: React.FC<{ transitionId: string }> = ({ transitionId }) => {
  countRender(transitionId);
  const frame = useTransitionFrame(transitionId);
  return (
    <output data-testid={transitionId}>{frame?.firingCount ?? "none"}</output>
  );
};

/**
 * Made once, so the provider hands the same element down on every frame, as
 * the view does. The items re-render only when the store tells them to.
 */
const items = (
  <>
    <Tokens placeId="p1" />
    <Tokens placeId="p2" />
    <Firings transitionId="t1" />
  </>
);

/** A frame in which each transition has fired the given number of times. */
const frame = (
  tokens: Record<string, number>,
  firingCounts: Record<string, number>,
): Partial<ExecutionFrameSource> => ({
  totalFrames: 1,
  currentViewedFrame: {
    number: 0,
    places: Object.fromEntries(
      Object.entries(tokens).map(([placeId, tokenCount]) => [
        placeId,
        { tokenCount },
      ]),
    ),
  },
  currentFrameReader: {
    getTransitionState: (transitionId: string) => ({
      firingCount: firingCounts[transitionId] ?? 0,
      firedInThisFrame: false,
      timeSinceLastFiringMs: 0,
    }),
  } as unknown as SimulationFrameReader,
});

const canvas = ({
  source = {},
  globalMode = "simulate",
  initialMarking = {},
}: {
  source?: Partial<ExecutionFrameSource>;
  globalMode?: EditorContextValue["globalMode"];
  initialMarking?: InitialMarking;
}) => (
  <ExecutionFrameSourceContext
    value={{ ...emptyExecutionFrameSource, ...source }}
  >
    <SimulationContext value={{ initialMarking } as SimulationContextValue}>
      <EditorContext value={{ globalMode } as EditorContextValue}>
        <CanvasFrameStoreProvider>{items}</CanvasFrameStoreProvider>
      </EditorContext>
    </SimulationContext>
  </ExecutionFrameSourceContext>
);

const shown = (testId: string) => screen.getByTestId(testId).textContent;

beforeEach(() => {
  renders.clear();
});

afterEach(cleanup);

describe("CanvasFrameStoreProvider", () => {
  it("shows the initial marking before a run, from the first paint", () => {
    const marking: InitialMarking = { p1: 3, p2: [{ value: 1 }, { value: 2 }] };
    render(canvas({ globalMode: "simulate", initialMarking: marking }));

    expect(shown("p1")).toBe("3");
    expect(shown("p2")).toBe("2");
    expect(shown("t1")).toBe("none");
    // The first render already read the marking, so the store's first
    // publication changed nothing and caused no second render.
    expect(renders.get("p1")).toBe(1);
  });

  it("shows no badge outside simulate mode", () => {
    const { rerender } = render(
      canvas({ globalMode: "simulate", initialMarking: { p1: 3 } }),
    );
    expect(shown("p1")).toBe("3");

    rerender(canvas({ globalMode: "edit", initialMarking: { p1: 3 } }));
    expect(shown("p1")).toBe("none");
  });

  it("follows the viewed frame", () => {
    const { rerender } = render(canvas({}));

    rerender(canvas({ source: frame({ p1: 5 }, { t1: 2 }) }));
    expect(shown("p1")).toBe("5");
    expect(shown("p2")).toBe("none");
    expect(shown("t1")).toBe("2");
  });

  it("re-renders only the items whose values moved", () => {
    const { rerender } = render(
      canvas({ source: frame({ p1: 1, p2: 1 }, { t1: 0 }) }),
    );
    const before = new Map(renders);
    const rendersSince = (key: string) =>
      (renders.get(key) ?? 0) - (before.get(key) ?? 0);

    rerender(canvas({ source: frame({ p1: 2, p2: 1 }, { t1: 1 }) }));
    expect(shown("p1")).toBe("2");
    expect(shown("t1")).toBe("1");
    expect(rendersSince("p1")).toBe(1);
    expect(rendersSince("p2")).toBe(0);
    expect(rendersSince("t1")).toBe(1);

    // The same values again, in a new frame: nothing on the canvas moves.
    rerender(canvas({ source: frame({ p1: 2, p2: 1 }, { t1: 1 }) }));
    expect(rendersSince("p1")).toBe(1);
    expect(rendersSince("p2")).toBe(0);
    expect(rendersSince("t1")).toBe(1);
  });
});
