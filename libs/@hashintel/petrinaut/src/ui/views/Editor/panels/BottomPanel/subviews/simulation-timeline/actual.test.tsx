/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useEditorActions,
  useEditorState,
} from "../../../../../../../react/state/editor-context";
import { renderPlugins } from "../../../../../../plugins/plugins-test-harness";
import { ActualTimeline } from "./actual";

// The chart library reads the pixel ratio as its module loads.
vi.hoisted(() => {
  globalThis.matchMedia = (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof matchMedia;
});

afterEach(cleanup);

/** Says which view the timelines draw, and picks ones an execution has no data for. */
const TimelineViewProbe = () => {
  const timelineView = useEditorState((editor) => editor.timelineView);
  const { setTimelineView } = useEditorActions();
  return (
    <>
      <output aria-label="Timeline view">{timelineView.kind}</output>
      <button
        type="button"
        onClick={() => setTimelineView({ kind: "metric", metricId: "metric" })}
      >
        Pick a metric
      </button>
      <button
        type="button"
        onClick={() => setTimelineView({ kind: "per-type" })}
      >
        Pick tokens per type
      </button>
    </>
  );
};

const timelineView = () =>
  screen.getByRole("status", { name: "Timeline view" }).textContent;

describe("ActualTimeline", () => {
  it("turns a metric pick into tokens per place", () => {
    renderPlugins(
      [],
      <>
        <TimelineViewProbe />
        <ActualTimeline />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pick a metric" }));

    expect(timelineView()).toBe("per-place");
    expect(screen.getByText("No actual execution data available")).toBeTruthy();
  });

  it("keeps a pick an execution has data for", () => {
    renderPlugins(
      [],
      <>
        <TimelineViewProbe />
        <ActualTimeline />
      </>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Pick tokens per type" }),
    );

    expect(timelineView()).toBe("per-type");
  });
});
