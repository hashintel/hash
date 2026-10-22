/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetrinautPreview } from "./petrinaut-preview";

import type { PetrinautPreviewProps } from "./petrinaut-preview";
import type { SDCPN } from "@hashintel/petrinaut-core";

/* The canvas reports what it would draw: the mode, and each place's tokens in the frame it's on. */
vi.mock("../views/SDCPN/sdcpn-view", async () => {
  const [{ use }, { EditorContext }, { ExecutionFrameSourceContext }] =
    await Promise.all([
      import("react"),
      import("../../react/state/editor-context"),
      import("../../react/execution-frame/context"),
    ]);

  return {
    SDCPNView: () => {
      const { globalMode } = use(EditorContext);
      const { currentViewedFrame, totalFrames } = use(
        ExecutionFrameSourceContext,
      );

      return (
        <div
          data-testid="canvas"
          data-mode={globalMode}
          data-total-frames={totalFrames}
          data-tokens={JSON.stringify(
            Object.fromEntries(
              Object.entries(currentViewedFrame?.places ?? {}).map(
                ([placeId, placeState]) => [placeId, placeState?.tokenCount],
              ),
            ),
          )}
        />
      );
    },
  };
});

/* The timelines' charts need a browser's canvas. */
vi.mock(
  "../views/Editor/panels/BottomPanel/subviews/simulation-timeline/actual",
  () => ({
    actualTimelineSubView: { component: () => <div>Actual timeline</div> },
  }),
);

vi.mock(
  "../views/Editor/panels/BottomPanel/subviews/simulation-timeline/content",
  () => ({ SimulationTimeline: () => <div>Simulation timeline</div> }),
);

const placeId = "00000000-0000-4000-8000-0000000000a1";
const otherPlaceId = "00000000-0000-4000-8000-0000000000a2";
const transitionId = "00000000-0000-4000-8000-0000000000b1";

const place = (id: string, name: string) => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const definition: SDCPN = {
  places: [place(placeId, "Queued"), place(otherPlaceId, "Done")],
  transitions: [
    {
      id: transitionId,
      name: "Finish",
      inputArcs: [{ placeId, weight: 1, type: "standard" }],
      outputArcs: [{ placeId: otherPlaceId, weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const actualMode: NonNullable<PetrinautPreviewProps["actualMode"]> = {
  available: true,
  source: { id: "run-1" },
  status: "complete",
  title: null,
  definition,
  initialState: { [placeId]: 1 },
  transitionFirings: [
    {
      transitionId,
      input: { [placeId]: 1 },
      output: { [otherPlaceId]: 1 },
      ts: "2026-10-22T08:00:00.000Z",
    },
  ],
  timelineStartedAtMs: Date.parse("2026-10-22T08:00:00.000Z"),
  timelineNowMs: null,
  error: null,
};

afterEach(cleanup);

describe("PetrinautPreview", () => {
  it("shows a model to edit without an execution", () => {
    render(<PetrinautPreview definition={definition} />);

    const canvas = screen.getByTestId("canvas");

    expect(canvas.getAttribute("data-mode")).toBe("edit");
    expect(canvas.getAttribute("data-total-frames")).toBe("0");
    expect(
      screen.queryByRole("region", { name: "Execution timeline" }),
    ).toBeNull();
  });

  it("opens an execution in Actual mode, with its timeline", () => {
    render(
      <PetrinautPreview definition={definition} actualMode={actualMode} />,
    );

    const canvas = screen.getByTestId("canvas");

    expect(canvas.getAttribute("data-mode")).toBe("actual");
    expect(Number(canvas.getAttribute("data-total-frames"))).toBeGreaterThan(0);
    expect(JSON.parse(canvas.getAttribute("data-tokens")!)).toEqual({
      [placeId]: 1,
      [otherPlaceId]: 0,
    });
    expect(
      screen.getByRole("region", { name: "Execution timeline" }).textContent,
    ).toBe("Actual timeline");
  });

  it("refuses both an execution and Quick Simulation", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      render(
        <PetrinautPreview
          definition={definition}
          actualMode={actualMode}
          quickSimulation={
            {} as NonNullable<PetrinautPreviewProps["quickSimulation"]>
          }
        />,
      ),
    ).toThrow("either `quickSimulation` or `actualMode`");
  });
});
