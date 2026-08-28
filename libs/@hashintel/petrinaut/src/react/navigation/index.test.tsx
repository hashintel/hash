// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  defaultPetrinautNavigationState,
  navigationResourceToSimulateDrawer,
  openPetrinautSimulationResource,
  openPetrinautSubnet,
  PetrinautNavigationProvider,
  simulateDrawerToNavigationOverlay,
  simulateDrawerToNavigationResource,
  usePetrinautNavigation,
} from ".";

import type {
  PetrinautNavigationController,
  PetrinautNavigationState,
} from ".";

describe("Petrinaut navigation", () => {
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
              { subnetId: "subnet-a" },
              { cause: "user", action: "subnet" },
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
      subnetId: "subnet-a",
    });
    expect(options).toEqual({
      history: "push",
      intent: { cause: "user", action: "subnet" },
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
              { subnetId: "subnet-a" },
              { cause: "user", action: "subnet" },
            );
            navigate(
              { subnetId: "subnet-a" },
              { cause: "user", action: "subnet" },
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
    expect(hostState.subnetId).toBe("subnet-a");
  });

  test("allows a controlled host to override the default history policy", () => {
    const historyPolicy = vi.fn(() => "replace" as const);
    const onNavigate = vi.fn<PetrinautNavigationController["onNavigate"]>();
    const controller: PetrinautNavigationController = {
      state: defaultPetrinautNavigationState,
      historyPolicy,
      onNavigate,
    };
    const intent = { cause: "user", action: "subnet" } as const;
    const Probe = () => {
      const { navigate } = usePetrinautNavigation();
      return (
        <button
          type="button"
          onClick={() => navigate({ subnetId: "subnet-a" }, intent)}
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
                { subnetId: null },
                { cause: "normalization", action: "subnet" },
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
    // Normalizing an already-null subnet is a semantic no-op.
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  test("works uncontrolled: updates internal state without a controller", () => {
    const Probe = () => {
      const { controlled, navigate, state } = usePetrinautNavigation();
      return (
        <>
          <output aria-label="Location">
            {`${String(controlled)} ${state.mode} ${state.subnetId ?? "root"}`}
          </output>
          <button
            type="button"
            onClick={() =>
              navigate(
                { mode: "simulate", subnetId: "subnet-a" },
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
      <PetrinautNavigationProvider initialState={{ subnetId: "subnet-b" }}>
        <Probe />
      </PetrinautNavigationProvider>,
    );

    // The initial location merges initialState over the defaults.
    expect(screen.getByLabelText("Location").textContent).toBe(
      "false edit subnet-b",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Update uncontrolled" }),
    );
    expect(screen.getByLabelText("Location").textContent).toBe(
      "false simulate subnet-a",
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
              { subnetId: "subnet-a" },
              { cause: "user", action: "subnet" },
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
    expect(hostState.subnetId).toBe("subnet-a");
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
      openPetrinautSubnet("subnet-a")({
        ...defaultPetrinautNavigationState,
        selection: [{ type: "place", id: "place-a" }],
      }),
    ).toEqual({
      ...defaultPetrinautNavigationState,
      subnetId: "subnet-a",
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
      "create-optimization",
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
    expect(
      navigationResourceToSimulateDrawer({
        type: "optimization",
        id: "optimization-a",
      }),
    ).toEqual({ type: "closed" });
  });
});
