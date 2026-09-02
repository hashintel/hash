// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSharedSearchNavigation } from "./use-shared-search-navigation";

import type { SharedExampleSearch } from "./example-search";
import type { PetrinautNavigationController } from "@hashintel/petrinaut/react";

const Probe = ({
  onController,
  onSearchChange,
  search,
}: {
  onController: (controller: PetrinautNavigationController) => void;
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
}) => {
  onController(useSharedSearchNavigation(search, onSearchChange));
  return null;
};

describe("useSharedSearchNavigation", () => {
  it("keeps URL-unrepresentable state in memory and mirrors the shared subset", () => {
    let controller!: PetrinautNavigationController;
    const onSearchChange = vi.fn();
    render(
      <Probe
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{ scenario: "scenario-1" }}
      />,
    );

    // A mode change is not part of the URL contract: it applies in memory
    // and produces no URL write.
    act(() => {
      controller.onNavigate((current) => ({ ...current, mode: "simulate" }), {
        history: "push",
        intent: { cause: "user", action: "mode" },
      });
    });
    expect(controller.state.mode).toBe("simulate");
    expect(onSearchChange).not.toHaveBeenCalled();

    // A subnet change is shared: it applies in memory AND writes the URL.
    act(() => {
      controller.onNavigate(
        (current) => ({ ...current, subnetId: "subnet-1" }),
        { history: "push", intent: { cause: "user", action: "subnet" } },
      );
    });
    expect(controller.state.subnetId).toBe("subnet-1");
    expect(controller.state.mode).toBe("simulate");
    expect(onSearchChange).toHaveBeenCalledOnce();
    expect(onSearchChange).toHaveBeenCalledWith(
      { scenario: "scenario-1", subnet: "subnet-1" },
      "push",
    );
  });

  it("merges an external URL change without resetting in-memory fields", () => {
    let controller!: PetrinautNavigationController;
    const onSearchChange = vi.fn();
    const view = render(
      <Probe
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{ scenario: "scenario-1" }}
      />,
    );

    act(() => {
      controller.onNavigate((current) => ({ ...current, mode: "simulate" }), {
        history: "push",
        intent: { cause: "user", action: "mode" },
      });
    });

    // Back/Forward delivers a different shared search: URL-owned fields
    // update, the in-memory mode survives.
    view.rerender(
      <Probe
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{ scenario: "scenario-2" }}
      />,
    );
    expect(controller.state.scenarioId).toBe("scenario-2");
    expect(controller.state.mode).toBe("simulate");
  });
});
