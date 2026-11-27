/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ExecutionTraceContext,
  NO_VIEWED_EXECUTION,
  type ViewedExecution,
} from "../../../../../../../../react/execution-trace/context";
import {
  useEditorActions,
  useEditorState,
} from "../../../../../../../../react/state/editor-context";
import { renderPlugins } from "../../../../../../../plugins/plugins-test-harness";
import { useRunTimelineView } from "./use-run-timeline-view";

afterEach(cleanup);

/** Says which view is picked and which one a timeline draws, and picks a metric. */
const TimelineViewProbe = () => {
  const picked = useEditorState((editor) => editor.timelineView);
  const drawn = useRunTimelineView();
  const { setTimelineView } = useEditorActions();
  return (
    <>
      <output aria-label="Picked view">{picked.kind}</output>
      <output aria-label="Drawn view">{drawn.kind}</output>
      <button
        type="button"
        onClick={() => setTimelineView({ kind: "metric", metricId: "metric" })}
      >
        Pick a metric
      </button>
      <button
        type="button"
        onClick={() => setTimelineView({ kind: "per-transition" })}
      >
        Pick transitions
      </button>
    </>
  );
};

const view = (name: "Picked view" | "Drawn view") =>
  screen.getByRole("status", { name }).textContent;

const renderProbe = (origin: ViewedExecution["origin"]) =>
  renderPlugins(
    [],
    <ExecutionTraceContext value={{ ...NO_VIEWED_EXECUTION, origin }}>
      <TimelineViewProbe />
    </ExecutionTraceContext>,
  );

describe("useRunTimelineView", () => {
  it("draws tokens per place for a metric picked over an execution the host reports, and keeps the pick", () => {
    renderProbe("host");

    fireEvent.click(screen.getByRole("button", { name: "Pick a metric" }));

    expect(view("Drawn view")).toBe("per-place");
    expect(view("Picked view")).toBe("metric");
  });

  it("draws a pick an execution the host reports has data for", () => {
    renderProbe("host");

    fireEvent.click(screen.getByRole("button", { name: "Pick transitions" }));

    expect(view("Drawn view")).toBe("per-transition");
  });

  it("draws a metric picked over a simulation", () => {
    renderProbe("simulation");

    fireEvent.click(screen.getByRole("button", { name: "Pick a metric" }));

    expect(view("Drawn view")).toBe("metric");
  });
});
