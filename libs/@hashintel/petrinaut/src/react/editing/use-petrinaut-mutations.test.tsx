/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { toPetrinautId, type SDCPN } from "@hashintel/petrinaut-core";

import {
  NotificationsContext,
  type AddNotificationInput,
} from "../notifications/context";
import {
  createWrapper,
  emptySdcpn,
  type WrapperOptions,
} from "./editor-test-harness";
import { usePetrinautMutations } from "./use-petrinaut-mutations";

import type { ReactNode } from "react";

const makeSDCPN = (partial?: Partial<SDCPN>): SDCPN => ({
  ...emptySdcpn,
  ...partial,
});

describe("usePetrinautMutations", () => {
  test("gives the same mutations while nothing they read changes", () => {
    const { Wrapper } = createWrapper();
    const { result, rerender } = renderHook(usePetrinautMutations, {
      wrapper: Wrapper,
    });
    const mutations = result.current;

    rerender();

    expect(result.current).toBe(mutations);
  });

  test("guards every mutation of the instance", () => {
    const { Wrapper, instance } = createWrapper();
    const { result } = renderHook(usePetrinautMutations, {
      wrapper: Wrapper,
    });

    expect(Object.keys(result.current)).toEqual(
      Object.keys(instance.mutations),
    );
  });

  describe("when not readonly", () => {
    test("addPlace mutates SDCPN", () => {
      const { Wrapper, instance } = createWrapper();
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.addPlace({
          id: "p1",
          name: "Place1",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      });

      const places = instance.definition.get().places;
      expect(places).toHaveLength(1);
      expect(places[0]!.id).toBe(toPetrinautId("p1"));
    });
  });

  describe("readonly enforcement", () => {
    test("mutations no-op when host readonly prop is true", () => {
      const { Wrapper, instance } = createWrapper({ readonly: true });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.addPlace({
          id: "p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      });

      expect(instance.definition.get().places).toHaveLength(0);
    });

    test("mutations no-op when globalMode is simulate", () => {
      const { Wrapper, instance } = createWrapper({ globalMode: "simulate" });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.addPlace({
          id: "p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      });

      expect(instance.definition.get().places).toHaveLength(0);
    });

    test("mutations no-op when simulation is Running/Paused/Complete", () => {
      for (const state of ["Running", "Paused", "Complete"] as const) {
        const { Wrapper, instance } = createWrapper({ simulationState: state });
        const { result } = renderHook(usePetrinautMutations, {
          wrapper: Wrapper,
        });

        act(() => {
          result.current.addPlace({
            id: "p1",
            name: "P1",
            colorId: null,
            dynamicsEnabled: false,
            x: 0,
            y: 0,
          });
        });

        expect(instance.definition.get().places).toHaveLength(0);
      }
    });

    test("scenario mutations still work in simulate mode", () => {
      const { Wrapper, instance } = createWrapper({ globalMode: "simulate" });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.addScenario({
          id: "scenario-1",
          name: "Default",
          scenarioParameters: [],
          parameterOverrides: {},
          initialState: { type: "per_place", content: {} },
        });
      });

      expect(instance.definition.get().scenarios ?? []).toHaveLength(1);
    });

    test("scenario mutations are blocked by host readonly", () => {
      const { Wrapper, instance } = createWrapper({ readonly: true });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.addScenario({
          id: "scenario-1",
          name: "Default",
          scenarioParameters: [],
          parameterOverrides: {},
          initialState: { type: "per_place", content: {} },
        });
      });

      expect(instance.definition.get().scenarios ?? []).toHaveLength(0);
    });
  });

  describe("in an editor that only composes", () => {
    test("a mutation beyond composing shows the reason and does nothing", () => {
      const addNotification = vi.fn((_notice: AddNotificationInput) => "");
      const { Wrapper, instance } = createWrapper({
        rules: { edit: "compose" },
      });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: ({ children }: { children: ReactNode }) => (
          <NotificationsContext value={{ addNotification }}>
            <Wrapper>{children}</Wrapper>
          </NotificationsContext>
        ),
      });

      act(() => {
        result.current.addPlace({
          id: "p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      });

      expect(instance.definition.get().places).toHaveLength(0);
      expect(addNotification.mock.calls[0]?.[0].message).toBe(
        "This editor only places and connects the components it is given.",
      );
    });

    test("a mutation that composes goes through", () => {
      const sdcpn = makeSDCPN({
        places: [
          {
            id: "p1",
            name: "P1",
            colorId: null,
            dynamicsEnabled: false,
            x: 0,
            y: 0,
          },
        ],
      });
      const { Wrapper, instance } = createWrapper({
        sdcpn,
        rules: { edit: "compose" },
      });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.commitNodePositions({
          commits: [
            { id: "p1", itemType: "place", position: { x: 100, y: 200 } },
          ],
        });
      });

      expect(instance.definition.get().places[0]!.x).toBe(100);
    });
  });

  test("each mutation says whether it went through", () => {
    const place = {
      id: "p1",
      name: "P1",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    };
    const added = (options: WrapperOptions) => {
      const { Wrapper } = createWrapper(options);
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });
      let went: boolean | undefined;
      act(() => {
        went = result.current.addPlace(place);
      });
      return went;
    };

    expect(added({})).toBe(true);
    expect(added({ readonly: true })).toBe(false);
    expect(added({ rules: { edit: "compose" } })).toBe(false);
  });
});

test.each([
  [{ readonly: true }, "This document is read-only."],
  [{ globalMode: "simulate" }, "Switch to Edit to change this net."],
  [{ simulationState: "Paused" }, "Reset the simulation to edit this net."],
] satisfies [WrapperOptions, string][])(
  "explains blocked mutations for %j",
  (options, message) => {
    const { Wrapper, instance } = createWrapper(options);
    const addNotification = vi.fn(() => "notice");
    const { result } = renderHook(usePetrinautMutations, {
      wrapper: ({ children }) => (
        <Wrapper>
          <NotificationsContext value={{ addNotification }}>
            {children}
          </NotificationsContext>
        </Wrapper>
      ),
    });
    act(() => {
      result.current.addPlace({
        id: "blocked",
        name: "Blocked",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      });
    });
    expect(instance.definition.get().places).toHaveLength(0);
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message, tone: "neutral" }),
    );
  },
);

test("allowed scenario mutations in Simulate stay quiet", () => {
  const { Wrapper, instance } = createWrapper({ globalMode: "simulate" });
  const addNotification = vi.fn(() => "notice");
  const { result } = renderHook(usePetrinautMutations, {
    wrapper: ({ children }) => (
      <Wrapper>
        <NotificationsContext value={{ addNotification }}>
          {children}
        </NotificationsContext>
      </Wrapper>
    ),
  });
  act(() => {
    result.current.addScenario({
      id: "scenario",
      name: "Scenario",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    });
  });
  expect(instance.definition.get().scenarios).toHaveLength(1);
  expect(addNotification).not.toHaveBeenCalled();
});

describe("visualizer edits during simulation", () => {
  const place = {
    id: "p1",
    name: "Place",
    colorId: null,
    dynamicsEnabled: false,
    x: 0,
    y: 0,
    visualizerCode: "original",
  };
  test.each(["Running", "Paused", "Complete"] as const)(
    "allows only visualizer updates while %s",
    (simulationState) => {
      const { Wrapper, instance } = createWrapper({
        sdcpn: makeSDCPN({ places: [place] }),
        simulationState,
      });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });
      act(() => {
        result.current.updatePlace({
          placeId: "p1",
          update: { visualizerCode: "edited" },
        });
      });
      expect(instance.definition.get().places[0]?.visualizerCode).toBe(
        "edited",
      );
      act(() => {
        result.current.updatePlace({
          placeId: "p1",
          update: { visualizerCode: "blocked", name: "Changed" },
        });
      });
      expect(instance.definition.get().places[0]).toMatchObject({
        name: "Place",
        visualizerCode: "edited",
      });
      act(() => {
        result.current.updatePlace({
          placeId: "p1",
          update: { visualizerCode: undefined },
        });
      });
      expect(
        instance.definition.get().places[0]?.visualizerCode,
      ).toBeUndefined();
    },
  );
  test.each([false, true])(
    "respects host read-only in simulate mode: %s",
    (readonly) => {
      const { Wrapper, instance } = createWrapper({
        sdcpn: makeSDCPN({ places: [place] }),
        globalMode: "simulate",
        readonly,
      });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });
      act(() => {
        result.current.updatePlace({
          placeId: "p1",
          update: { visualizerCode: "edited" },
        });
      });
      expect(instance.definition.get().places[0]?.visualizerCode).toBe(
        readonly ? "original" : "edited",
      );
    },
  );
});
