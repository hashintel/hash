/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  emptyExecutionFrameSource,
  ExecutionFrameSourceContext,
} from "../../react/execution-frame/context";
import { PreviewSimulationPlaybackControls } from "./preview-quick-simulation-controls";

vi.mock("../views/Editor/components/BottomBar/simulation-controls", () => ({
  SimulationControls: () => <div>Simulation controls</div>,
}));

vi.mock(
  "../views/Editor/panels/BottomPanel/subviews/simulation-timeline/content",
  () => ({
    SimulationTimeline: ({ showLegend }: { showLegend?: boolean }) => (
      <div data-show-legend={showLegend}>Compact simulation timeline</div>
    ),
  }),
);

const renderPlaybackControls = (totalFrames: number) =>
  render(
    <ExecutionFrameSourceContext
      value={{ ...emptyExecutionFrameSource, totalFrames }}
    >
      <PreviewSimulationPlaybackControls />
    </ExecutionFrameSourceContext>,
  );

describe("PreviewSimulationPlaybackControls", () => {
  it("expands for frames and collapses again after reset", () => {
    const { container, rerender } = renderPlaybackControls(0);
    const panel = screen.getByRole("region", {
      name: "Simulation playback",
    });
    const timelineReveal = container.querySelector("[data-preview-timeline]")!;

    expect(panel.getAttribute("data-state")).toBe("collapsed");
    expect(timelineReveal.getAttribute("aria-hidden")).toBe("true");
    const timeline = screen.getByText("Compact simulation timeline");

    rerender(
      <ExecutionFrameSourceContext
        value={{ ...emptyExecutionFrameSource, totalFrames: 4 }}
      >
        <PreviewSimulationPlaybackControls />
      </ExecutionFrameSourceContext>,
    );

    expect(panel.getAttribute("data-state")).toBe("expanded");
    expect(timelineReveal.getAttribute("aria-hidden")).toBe("false");
    expect(screen.getByText("Compact simulation timeline")).toBe(timeline);
    expect(
      screen
        .getByText("Compact simulation timeline")
        .getAttribute("data-show-legend"),
    ).toBe("false");

    rerender(
      <ExecutionFrameSourceContext
        value={{ ...emptyExecutionFrameSource, totalFrames: 0 }}
      >
        <PreviewSimulationPlaybackControls />
      </ExecutionFrameSourceContext>,
    );

    expect(panel.getAttribute("data-state")).toBe("collapsed");
    expect(timelineReveal.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Compact simulation timeline")).toBe(timeline);
  });
});
