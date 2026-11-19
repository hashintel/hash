/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  emptyExecutionFrameSource,
  ExecutionFrameSourceContext,
} from "../../react/execution-frame/context";
import {
  SimulationContext,
  type SimulationContextValue,
} from "../../react/simulation/context";
import { PreviewSimulationPlaybackControls } from "./preview-quick-simulation-controls";

vi.mock(
  "../views/Editor/components/BottomBar/event-simulation-controls",
  () => ({
    EventSimulationControls: () => <div>Event simulation controls</div>,
  }),
);

vi.mock(
  "../views/Editor/panels/BottomPanel/subviews/event-timeline/content",
  () => ({
    EventTimeline: ({ showLegend }: { showLegend?: boolean }) => (
      <div data-show-legend={showLegend}>Compact event timeline</div>
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
    const timeline = screen.getByText("Compact event timeline");

    rerender(
      <ExecutionFrameSourceContext
        value={{ ...emptyExecutionFrameSource, totalFrames: 4 }}
      >
        <PreviewSimulationPlaybackControls />
      </ExecutionFrameSourceContext>,
    );

    expect(panel.getAttribute("data-state")).toBe("expanded");
    expect(timelineReveal.getAttribute("aria-hidden")).toBe("false");
    expect(screen.getByText("Compact event timeline")).toBe(timeline);
    expect(
      screen
        .getByText("Compact event timeline")
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
    expect(screen.getByText("Compact event timeline")).toBe(timeline);
  });

  it("plays the run with the controls and timeline that address time", () => {
    const { container } = render(
      <SimulationContext
        value={
          {
            scenarioCompilationErrors: null,
          } as SimulationContextValue
        }
      >
        <ExecutionFrameSourceContext
          value={{ ...emptyExecutionFrameSource, totalFrames: 4 }}
        >
          <PreviewSimulationPlaybackControls />
        </ExecutionFrameSourceContext>
      </SimulationContext>,
    );

    const rendered = within(container);
    expect(rendered.getByText("Event simulation controls")).toBeDefined();
    expect(
      rendered
        .getByText("Compact event timeline")
        .getAttribute("data-show-legend"),
    ).toBe("false");
  });
});
