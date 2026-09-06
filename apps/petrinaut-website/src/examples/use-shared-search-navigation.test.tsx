// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSharedSearchNavigation } from "./use-shared-search-navigation";

import type { SharedExampleSearch } from "./example-search";
import type {
  PetrinautNavigationController,
  PetrinautNavigationState,
} from "@hashintel/petrinaut/react";

const Probe = ({
  initialState,
  onController,
  onSearchChange,
  search,
}: {
  initialState?: Partial<
    Omit<PetrinautNavigationState, "scenarioId" | "subnetId" | "selection">
  >;
  onController: (controller: PetrinautNavigationController) => void;
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
}) => {
  onController(
    useSharedSearchNavigation(search, onSearchChange, { initialState }),
  );
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

    // The resource open inside Simulate is the one location field the URL does
    // not carry: it applies in memory and produces no URL write.
    act(() => {
      controller.onNavigate(
        (current) => ({
          ...current,
          simulateResource: { type: "experiment", id: "experiment-1" },
        }),
        {
          history: "push",
          intent: { cause: "user", action: "simulation-resource" },
        },
      );
    });
    expect(controller.state.simulateResource).toEqual({
      type: "experiment",
      id: "experiment-1",
    });
    expect(onSearchChange).not.toHaveBeenCalled();

    // A subnet change is shared: it applies in memory AND writes the URL.
    act(() => {
      controller.onNavigate(
        (current) => ({ ...current, subnetId: "subnet-1" }),
        { history: "push", intent: { cause: "user", action: "subnet" } },
      );
    });
    expect(controller.state.subnetId).toBe("subnet-1");
    expect(controller.state.simulateResource).toEqual({
      type: "experiment",
      id: "experiment-1",
    });
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
      controller.onNavigate(
        (current) => ({
          ...current,
          simulateResource: { type: "experiment", id: "experiment-1" },
        }),
        {
          history: "push",
          intent: { cause: "user", action: "simulation-resource" },
        },
      );
    });

    // Back/Forward delivers a different shared search: URL-owned fields
    // update, and the one field the URL cannot carry survives.
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
    expect(controller.state.simulateResource).toEqual({
      type: "experiment",
      id: "experiment-1",
    });
  });

  it("returns a URL-owned field to the baseline when Back drops it", () => {
    let controller!: PetrinautNavigationController;
    const onSearchChange = vi.fn();
    const view = render(
      <Probe
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{}}
      />,
    );

    // Opening the create-experiment overlay in Simulate is a location, so it
    // reaches the URL and therefore the history stack.
    act(() => {
      controller.onNavigate(
        (current) => ({
          ...current,
          mode: "simulate",
          overlay: { type: "create-experiment" },
        }),
        { history: "push", intent: { cause: "user", action: "overlay" } },
      );
    });
    expect(onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "simulate",
        overlay: "create-experiment",
      }),
      "push",
    );

    // The router delivers the hook's own write back first; that echo is
    // suppressed, since the in-memory location already holds it.
    view.rerender(
      <Probe
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{ mode: "simulate", overlay: "create-experiment" }}
      />,
    );
    expect(controller.state.overlay).toEqual({ type: "create-experiment" });

    // Back then returns to an entry that names neither, which is what closes
    // the overlay and restores the mode rather than leaving them applied.
    view.rerender(
      <Probe
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{}}
      />,
    );
    expect(controller.state.overlay).toBeNull();
    expect(controller.state.mode).toBe("edit");
  });

  it("keeps a multi-item selection when the router echoes its own URL write", () => {
    let controller!: PetrinautNavigationController;
    const onSearchChange = vi.fn();
    const view = render(
      <Probe
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{ itemType: "place", itemId: "place-1" }}
      />,
    );

    // A second selected item cannot be spelled in the URL, so the write drops
    // the item entirely. The echo of that write must not be mistaken for an
    // external change, or it merges the lossy projection back over the
    // in-memory selection and clears it.
    act(() => {
      controller.onNavigate(
        (current) => ({
          ...current,
          selection: [
            { type: "place", id: "place-1" },
            { type: "place", id: "place-2" },
          ],
        }),
        { history: "push", intent: { cause: "user", action: "selection" } },
      );
    });

    expect(onSearchChange).toHaveBeenCalledWith({}, "push");
    expect(controller.state.selection).toHaveLength(2);

    view.rerender(
      <Probe
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{}}
      />,
    );

    expect(controller.state.selection).toHaveLength(2);
  });

  it("seeds the fields the URL does not carry, alongside the ones it does", () => {
    let controller!: PetrinautNavigationController;
    const onSearchChange = vi.fn();
    render(
      <Probe
        initialState={{ mode: "actual" }}
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{ subnet: "subnet-from-url" }}
      />,
    );

    // A controlled host replaces the provider's initial state, so a page that
    // opens in a non-default mode has to seed it here. The URL-owned fields
    // still come from the link the visitor opened; the option's type excludes
    // them rather than accepting a value it would discard.
    expect(controller.state.mode).toBe("actual");
    expect(controller.state.subnetId).toBe("subnet-from-url");
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("keeps a seeded field across an external URL change", () => {
    let controller!: PetrinautNavigationController;
    const onSearchChange = vi.fn();
    const view = render(
      <Probe
        initialState={{ mode: "actual" }}
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{}}
      />,
    );

    view.rerender(
      <Probe
        initialState={{ mode: "actual" }}
        onController={(value) => {
          controller = value;
        }}
        onSearchChange={onSearchChange}
        search={{ scenario: "scenario-1" }}
      />,
    );

    expect(controller.state.scenarioId).toBe("scenario-1");
    expect(controller.state.mode).toBe("actual");
  });
});
