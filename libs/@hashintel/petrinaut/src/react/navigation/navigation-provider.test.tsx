// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
  defaultPetrinautNavigationState,
  navigationResourceToSimulateDrawer,
  openPetrinautComponent,
  openPetrinautSimulationResource,
  petrinautNavigationStatesMatch,
  simulateDrawerToNavigationOverlay,
  simulateDrawerToNavigationResource,
  usePetrinautNavigation,
} from "./navigation";
import { PetrinautNavigationProvider } from "./navigation-provider";

import type {
  PetrinautNavigationController,
  PetrinautNavigationState,
} from "./navigation";

describe("Petrinaut navigation", () => {
  test("clears an expanded SubView when its item or component changes", () => {
    const initialState: PetrinautNavigationState = {
      ...defaultPetrinautNavigationState,
      selection: [{ type: "transition", id: "collision" }],
      expandedSubView: {
        container: "transition-properties",
        id: "transition-results",
      },
    };
    const onNavigate = vi.fn<PetrinautNavigationController["onNavigate"]>();
    const Probe = () => {
      const { navigate } = usePetrinautNavigation();
      return (
        <>
          <button
            type="button"
            onClick={() =>
              navigate(
                { selection: [{ type: "transition", id: "crash" }] },
                { cause: "user", action: "selection" },
              )
            }
          >
            Select another transition
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(openPetrinautComponent("component"), {
                cause: "user",
                action: "component",
              })
            }
          >
            Open component
          </button>
        </>
      );
    };
    render(
      <PetrinautNavigationProvider
        controller={{ state: initialState, onNavigate }}
      >
        <Probe />
      </PetrinautNavigationProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select another transition" }),
    );
    expect(
      onNavigate.mock.calls.at(-1)?.[0](initialState).expandedSubView,
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open component" }));
    expect(
      onNavigate.mock.calls.at(-1)?.[0](initialState).expandedSubView,
    ).toBeNull();
  });

  test("distinguishes settings sections and normalizes the default section", () => {
    const state = (
      section?: "general" | "viewport",
    ): PetrinautNavigationState => ({
      ...defaultPetrinautNavigationState,
      overlay: { type: "user-settings", section },
    });
    expect(petrinautNavigationStatesMatch(state(), state("general"))).toBe(
      true,
    );
    expect(
      petrinautNavigationStatesMatch(state("general"), state("viewport")),
    ).toBe(false);
  });

  test("passes an updater and app-history intent to a controlled host", () => {
    const onNavigate = vi.fn<PetrinautNavigationController["onNavigate"]>();
    const controller: PetrinautNavigationController = {
      state: defaultPetrinautNavigationState,
      onNavigate,
    };
    const Probe = () => {
      const { navigate } = usePetrinautNavigation();
      return (
        <button
          type="button"
          onClick={() =>
            navigate(
              { componentId: "component-a" },
              { cause: "user", action: "component" },
            )
          }
        >
          Update navigation
        </button>
      );
    };

    render(
      <PetrinautNavigationProvider controller={controller}>
        <Probe />
      </PetrinautNavigationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Update navigation" }));

    expect(onNavigate).toHaveBeenCalledOnce();
    const [update, options] = onNavigate.mock.calls[0]!;
    expect(update(defaultPetrinautNavigationState)).toEqual({
      ...defaultPetrinautNavigationState,
      componentId: "component-a",
    });
    expect(options).toEqual({
      history: "push",
      intent: { cause: "user", action: "component" },
    });
  });

  test("tracks optimistic controlled state across updates before rerender", () => {
    const selectedPlace = { type: "place", id: "place-a" } as const;
    const initialState: PetrinautNavigationState = {
      ...defaultPetrinautNavigationState,
      selection: [selectedPlace],
    };
    let hostState = initialState;
    const onNavigate = vi.fn<PetrinautNavigationController["onNavigate"]>(
      (update) => {
        hostState = update(hostState);
      },
    );
    const controller: PetrinautNavigationController = {
      state: initialState,
      onNavigate,
    };
    const Probe = () => {
      const { navigate } = usePetrinautNavigation();
      return (
        <button
          type="button"
          onClick={() => {
            navigate(
              { selection: [] },
              { cause: "user", action: "selection", phase: "start" },
            );
            navigate(
              { selection: [selectedPlace] },
              { cause: "user", action: "selection", phase: "continue" },
            );
          }}
        >
          Queue selection updates
        </button>
      );
    };

    render(
      <PetrinautNavigationProvider controller={controller}>
        <Probe />
      </PetrinautNavigationProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Queue selection updates" }),
    );

    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onNavigate.mock.calls.map(([, options]) => options.history)).toEqual(
      ["push", "replace"],
    );
    expect(hostState.selection).toEqual([selectedPlace]);
  });

  test("suppresses a duplicate controlled update before rerender", () => {
    let hostState = defaultPetrinautNavigationState;
    const onNavigate = vi.fn<PetrinautNavigationController["onNavigate"]>(
      (update) => {
        hostState = update(hostState);
      },
    );
    const controller: PetrinautNavigationController = {
      state: defaultPetrinautNavigationState,
      onNavigate,
    };
    const Probe = () => {
      const { navigate } = usePetrinautNavigation();
      return (
        <button
          type="button"
          onClick={() => {
            navigate(
              { componentId: "component-a" },
              { cause: "user", action: "component" },
            );
            navigate(
              { componentId: "component-a" },
              { cause: "user", action: "component" },
            );
          }}
        >
          Repeat navigation
        </button>
      );
    };

    render(
      <PetrinautNavigationProvider controller={controller}>
        <Probe />
      </PetrinautNavigationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Repeat navigation" }));

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(hostState.componentId).toBe("component-a");
  });

  test("allows a controlled host to override the default history policy", () => {
    const historyPolicy = vi.fn(() => "replace" as const);
    const onNavigate = vi.fn<PetrinautNavigationController["onNavigate"]>();
    const controller: PetrinautNavigationController = {
      state: defaultPetrinautNavigationState,
      historyPolicy,
      onNavigate,
    };
    const intent = { cause: "user", action: "component" } as const;
    const Probe = () => {
      const { navigate } = usePetrinautNavigation();
      return (
        <button
          type="button"
          onClick={() => navigate({ componentId: "component-a" }, intent)}
        >
          Override history
        </button>
      );
    };

    render(
      <PetrinautNavigationProvider controller={controller}>
        <Probe />
      </PetrinautNavigationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Override history" }));

    expect(historyPolicy).toHaveBeenCalledOnce();
    expect(historyPolicy).toHaveBeenCalledWith(intent);
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate.mock.calls[0]?.[1]).toEqual({
      history: "replace",
      intent,
    });
  });

  test("uses replace for continuation and normalization intents", () => {
    const onNavigate = vi.fn<PetrinautNavigationController["onNavigate"]>();
    const controller: PetrinautNavigationController = {
      state: defaultPetrinautNavigationState,
      onNavigate,
    };
    const Probe = () => {
      const { navigate } = usePetrinautNavigation();
      return (
        <>
          <button
            type="button"
            onClick={() =>
              navigate(
                { selection: [{ type: "place", id: "place-a" }] },
                {
                  cause: "user",
                  action: "selection",
                  phase: "continue",
                },
              )
            }
          >
            Continue selection
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(
                { componentId: null },
                { cause: "normalization", action: "component" },
              )
            }
          >
            Normalize
          </button>
        </>
      );
    };

    render(
      <PetrinautNavigationProvider controller={controller}>
        <Probe />
      </PetrinautNavigationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue selection" }));
    fireEvent.click(screen.getByRole("button", { name: "Normalize" }));

    expect(onNavigate.mock.calls[0]?.[1]).toMatchObject({ history: "replace" });
    // Normalizing an already-null component is a semantic no-op.
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  test("works uncontrolled: updates internal state without a controller", () => {
    const Probe = () => {
      const { controlled, navigate, state } = usePetrinautNavigation();
      return (
        <>
          <output aria-label="Location">
            {`${String(controlled)} ${state.mode} ${state.componentId ?? "root"}`}
          </output>
          <button
            type="button"
            onClick={() =>
              navigate(
                { mode: "simulate", componentId: "component-a" },
                { cause: "user", action: "mode" },
              )
            }
          >
            Update uncontrolled
          </button>
        </>
      );
    };

    render(
      <PetrinautNavigationProvider
        initialState={{ componentId: "component-b" }}
      >
        <Probe />
      </PetrinautNavigationProvider>,
    );

    // The initial location merges initialState over the defaults.
    expect(screen.getByLabelText("Location").textContent).toBe(
      "false edit component-b",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Update uncontrolled" }),
    );
    expect(screen.getByLabelText("Location").textContent).toBe(
      "false simulate component-a",
    );
  });

  test("canonicalizes uncontrolled selection updates and suppresses duplicates", () => {
    const navigateResults: boolean[] = [];
    const Probe = () => {
      const { navigate, state } = usePetrinautNavigation();
      return (
        <>
          <output aria-label="Selection">
            {state.selection.map((item) => `${item.type}:${item.id}`).join(",")}
          </output>
          <button
            type="button"
            onClick={() =>
              navigateResults.push(
                navigate(
                  {
                    selection: [
                      { type: "transition", id: "transition-b" },
                      { type: "place", id: "place-a" },
                      { type: "transition", id: "transition-b" },
                    ],
                  },
                  { cause: "user", action: "selection" },
                ),
              )
            }
          >
            Select items
          </button>
        </>
      );
    };

    render(
      <PetrinautNavigationProvider>
        <Probe />
      </PetrinautNavigationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select items" }));
    expect(screen.getByLabelText("Selection").textContent).toBe(
      "place:place-a,transition:transition-b",
    );

    // The same selection again is a semantic no-op.
    fireEvent.click(screen.getByRole("button", { name: "Select items" }));
    expect(navigateResults).toEqual([true, false]);
  });

  test("controlled: a declined navigation does not swallow a later retry", async () => {
    // A host that declines (a navigation guard, an aborted transition) changes
    // nothing, so it never rerenders. The optimistic preview must not outlive
    // the event that produced it, or the user's retry is swallowed.
    let acceptNavigation = false;
    let hostState = defaultPetrinautNavigationState;
    const onNavigate = vi.fn<PetrinautNavigationController["onNavigate"]>(
      (update) => {
        if (acceptNavigation) {
          hostState = update(hostState);
        }
      },
    );
    const Probe = () => {
      const { navigate } = usePetrinautNavigation();
      return (
        <button
          type="button"
          onClick={() =>
            navigate(
              { componentId: "component-a" },
              { cause: "user", action: "component" },
            )
          }
        >
          Retry without rerender
        </button>
      );
    };
    render(
      <PetrinautNavigationProvider
        controller={{ state: hostState, onNavigate }}
      >
        <Probe />
      </PetrinautNavigationProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retry without rerender" }),
    );
    expect(onNavigate).toHaveBeenCalledOnce();

    // A retry is a separate user event, so the preview is no longer fresh.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    acceptNavigation = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry without rerender" }),
    );
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(hostState.componentId).toBe("component-a");
  });

  test("controlled: a rerender before an async host applies does not lose the next update", () => {
    // A host backed by a router applies on a later tick. Any unrelated
    // rerender in that window must not roll the optimistic base back to the
    // state the host has already been asked to leave.
    const hostState = defaultPetrinautNavigationState;
    const applied: PetrinautNavigationState[] = [];
    const onNavigate = vi.fn<PetrinautNavigationController["onNavigate"]>(
      (update) => {
        applied.push(update(applied.at(-1) ?? hostState));
      },
    );
    const Probe = () => {
      const { navigate } = usePetrinautNavigation();
      return (
        <>
          <button
            type="button"
            onClick={() =>
              navigate(
                { selection: [{ type: "place", id: "place-a" }] },
                { cause: "user", action: "selection" },
              )
            }
          >
            Select A
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(
                { selection: [] },
                { cause: "user", action: "selection" },
              )
            }
          >
            Clear selection
          </button>
        </>
      );
    };
    const tree = () => (
      <PetrinautNavigationProvider
        controller={{ state: hostState, onNavigate }}
      >
        <Probe />
      </PetrinautNavigationProvider>
    );
    const view = render(tree());

    fireEvent.click(screen.getByRole("button", { name: "Select A" }));
    expect(onNavigate).toHaveBeenCalledOnce();

    // The router has not landed yet, so `state` is still the pre-selection
    // value when this commit happens.
    view.rerender(tree());

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(applied.at(-1)?.selection).toEqual([]);
  });

  test("creates complete atomic destinations", () => {
    expect(
      openPetrinautSimulationResource({
        type: "experiment",
        id: "experiment-a",
      })({
        ...defaultPetrinautNavigationState,
        overlay: { type: "create-experiment" },
        selection: [{ type: "place", id: "place-a" }],
      }),
    ).toEqual({
      ...defaultPetrinautNavigationState,
      mode: "simulate",
      simulateView: "experiments",
      simulateResource: { type: "experiment", id: "experiment-a" },
      selection: [{ type: "place", id: "place-a" }],
    });
    expect(
      openPetrinautComponent("component-a")({
        ...defaultPetrinautNavigationState,
        selection: [{ type: "place", id: "place-a" }],
      }),
    ).toEqual({
      ...defaultPetrinautNavigationState,
      componentId: "component-a",
      selection: [],
    });
  });

  test("maps view resources and create overlays to drawers", () => {
    const openExperiment = { type: "experiment", id: "experiment-a" } as const;
    const withOpenExperiment = {
      ...defaultPetrinautNavigationState,
      simulateResource: openExperiment,
    };
    const empty = defaultPetrinautNavigationState;

    expect(
      simulateDrawerToNavigationResource(
        { type: "view-scenario", scenarioId: "scenario-a" },
        empty,
      ),
    ).toEqual({ type: "scenario", id: "scenario-a" });

    for (const type of [
      "create-scenario",
      "create-metric",
      "create-experiment",
    ] as const) {
      const drawer = { type };
      // A create drawer layers over the open record rather than replacing it.
      expect(
        simulateDrawerToNavigationResource(drawer, withOpenExperiment),
      ).toEqual(openExperiment);
      expect(simulateDrawerToNavigationResource(drawer, empty)).toBeNull();
      expect(simulateDrawerToNavigationOverlay(drawer, null)).toEqual(drawer);
      expect(navigationResourceToSimulateDrawer(null, drawer)).toEqual(drawer);
    }
    // Closing a create overlay reveals the record it was layered over, while
    // closing the record's own drawer clears it.
    expect(
      simulateDrawerToNavigationResource(
        { type: "closed" },
        {
          ...defaultPetrinautNavigationState,
          simulateResource: openExperiment,
          overlay: { type: "create-experiment" },
        },
      ),
    ).toEqual(openExperiment);
    expect(
      simulateDrawerToNavigationResource(
        { type: "closed" },
        {
          ...defaultPetrinautNavigationState,
          simulateResource: openExperiment,
          overlay: null,
        },
      ),
    ).toBeNull();
    expect(
      navigationResourceToSimulateDrawer({
        type: "experiment",
        id: "experiment-a",
      }),
    ).toEqual({ type: "view-experiment", experimentId: "experiment-a" });
    expect(navigationResourceToSimulateDrawer(null)).toEqual({
      type: "closed",
    });
  });
});

test.each([null, { type: "metric", id: "metric-a" }] as const)(
  "clears fullscreen when leaving a panel for %j",
  (resource) => {
    const Probe = () => {
      const { state, navigate } = usePetrinautNavigation();
      return (
        <>
          <output aria-label="Presentation">
            {state.simulatePresentation ?? "panel"}
          </output>
          <button
            type="button"
            onClick={() =>
              navigate(
                { simulateResource: resource },
                { cause: "user", action: "simulation-resource" },
              )
            }
          >
            Leave panel
          </button>
        </>
      );
    };
    const view = render(
      <PetrinautNavigationProvider
        initialState={{
          mode: "simulate",
          simulateResource: { type: "experiment", id: "experiment-a" },
          simulatePresentation: "fullscreen",
        }}
      >
        <Probe />
      </PetrinautNavigationProvider>,
    );
    expect(screen.getByLabelText("Presentation").textContent).toBe(
      "fullscreen",
    );
    fireEvent.click(screen.getByRole("button", { name: "Leave panel" }));
    expect(screen.getByLabelText("Presentation").textContent).toBe("panel");
    view.unmount();
  },
);

test("compares a navigation made in the layout phase with the state of that commit", () => {
  const onNavigate = vi.fn<PetrinautNavigationController["onNavigate"]>();
  // As a plugin that is told of the new location in the layout phase and
  // answers at once: keep the editor out of Simulate.
  const KeepsEditMode = () => {
    const { navigate, state } = usePetrinautNavigation();
    useLayoutEffect(() => {
      if (state.mode === "simulate") {
        navigate({ mode: "edit" }, { cause: "user", action: "mode" });
      }
    }, [navigate, state.mode]);
    return null;
  };
  const Host = () => {
    const [state, setState] = useState(defaultPetrinautNavigationState);
    return (
      <PetrinautNavigationProvider controller={{ state, onNavigate }}>
        <KeepsEditMode />
        {/* The host moves by itself, as on the browser's Back button. */}
        <button
          type="button"
          onClick={() => setState({ ...state, mode: "simulate" })}
        >
          Back
        </button>
      </PetrinautNavigationProvider>
    );
  };

  const view = render(<Host />);
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(onNavigate).toHaveBeenCalledTimes(1);
  view.unmount();
});

describe.each([true, false])("with a host in control: %s", (controlled) => {
  const Host = ({ children }: { children: React.ReactNode }) => {
    const [state, setState] = useState<PetrinautNavigationState>({
      ...defaultPetrinautNavigationState,
      mode: "simulate",
      simulateView: "scenarios",
    });
    return (
      <PetrinautNavigationProvider
        controller={
          controlled
            ? { state, onNavigate: (update) => setState(update) }
            : undefined
        }
        initialState={state}
      >
        {children}
      </PetrinautNavigationProvider>
    );
  };

  test("navigate is one function across navigations", () => {
    const seen = new Set<unknown>();
    const Probe = () => {
      const { navigate, state } = usePetrinautNavigation();
      seen.add(navigate);
      return (
        <button
          type="button"
          onClick={() =>
            navigate(
              {
                selection: [
                  { type: "place", id: `place-${state.selection.length}` },
                  ...state.selection,
                ],
              },
              { cause: "user", action: "selection" },
            )
          }
        >
          Select another place
        </button>
      );
    };
    const view = render(<Probe />, { wrapper: Host });
    const select = screen.getByRole("button", { name: "Select another place" });

    fireEvent.click(select);
    fireEvent.click(select);

    expect(seen.size).toBe(1);
    view.unmount();
  });

  test("a Simulate section reopens the record it was left with", () => {
    const Probe = () => {
      const { navigate, state } = usePetrinautNavigation();
      const show = (simulateView: PetrinautNavigationState["simulateView"]) =>
        navigate(
          { simulateView },
          { cause: "user", action: "simulation-view" },
        );
      return (
        <>
          <output aria-label="Record">
            {state.simulateResource?.id ?? "none"}
          </output>
          <button
            type="button"
            onClick={() =>
              navigate(
                { simulateResource: { type: "scenario", id: "scenario-a" } },
                { cause: "user", action: "simulation-resource" },
              )
            }
          >
            Open scenario
          </button>
          <button type="button" onClick={() => show("metrics")}>
            Metrics
          </button>
          <button type="button" onClick={() => show("scenarios")}>
            Scenarios
          </button>
        </>
      );
    };
    const view = render(<Probe />, { wrapper: Host });
    const record = () => screen.getByLabelText("Record").textContent;

    fireEvent.click(screen.getByRole("button", { name: "Open scenario" }));
    fireEvent.click(screen.getByRole("button", { name: "Metrics" }));
    expect(record()).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "Scenarios" }));
    expect(record()).toBe("scenario-a");
    view.unmount();
  });
});
