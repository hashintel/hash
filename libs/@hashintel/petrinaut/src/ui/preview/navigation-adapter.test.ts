import { describe, expect, test, vi } from "vitest";

import { defaultPetrinautNavigationState } from "../../react/navigation";
import {
  createPreviewNavigationAdapter,
  toPreviewNavigationState,
  type PetrinautPreviewNavigationState,
} from "./navigation-adapter";

import type { PetrinautNavigationController } from "../../react/navigation";

describe("Preview navigation adapter", () => {
  test("pins editor-only state while preserving Preview state", () => {
    const controller: PetrinautNavigationController<PetrinautPreviewNavigationState> =
      {
        state: {
          scenarioId: "scenario-a",
          subnetId: "subnet-a",
          selection: [{ type: "place", id: "place-a" }],
        },
        onNavigate: vi.fn(),
      };

    expect(createPreviewNavigationAdapter(controller).state).toEqual({
      ...defaultPetrinautNavigationState,
      mode: "edit",
      simulateView: "scenarios",
      scenarioId: "scenario-a",
      subnetId: "subnet-a",
      selection: [{ type: "place", id: "place-a" }],
    });
  });

  test("projects full-state updaters back onto the Preview contract", () => {
    const onNavigate =
      vi.fn<
        PetrinautNavigationController<PetrinautPreviewNavigationState>["onNavigate"]
      >();
    const controller: PetrinautNavigationController<PetrinautPreviewNavigationState> =
      {
        state: {
          scenarioId: undefined,
          subnetId: null,
          selection: [],
        },
        onNavigate,
      };
    const adapter = createPreviewNavigationAdapter(controller);
    const options = {
      history: "replace" as const,
      intent: { cause: "user", action: "selection" } as const,
    };

    adapter.onNavigate(
      (state) => ({
        ...state,
        mode: "actual",
        simulateResource: { type: "metric", id: "metric-a" },
        scenarioId: "scenario-b",
        subnetId: "subnet-b",
        selection: [{ type: "transition", id: "transition-b" }],
      }),
      options,
    );

    expect(onNavigate).toHaveBeenCalledOnce();
    const [update, receivedOptions] = onNavigate.mock.calls[0]!;
    expect(update(controller.state)).toEqual({
      scenarioId: "scenario-b",
      subnetId: "subnet-b",
      selection: [{ type: "transition", id: "transition-b" }],
    });
    expect(receivedOptions).toEqual(options);
  });

  test("drops editor-only navigation fields", () => {
    expect(
      toPreviewNavigationState({
        ...defaultPetrinautNavigationState,
        mode: "simulate",
        simulateView: "metrics",
        simulateResource: { type: "metric", id: "metric-a" },
        overlay: { type: "viewport-settings" },
      }),
    ).toEqual({
      scenarioId: undefined,
      subnetId: null,
      selection: [],
    });
  });
});
