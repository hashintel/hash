/**
 * Integration tests for SDCPNView using the real EditorProvider.
 *
 * Only two contexts are explicitly provided:
 * - EditorProvider (real) — manages selection, dragging state, cursor mode, etc.
 * - SDCPNContext (controlled mock) — supplies initial SDCPN data and records mutations.
 *
 * All other contexts (PlaybackContext, SimulationContext, UserSettingsContext,
 * MonacoContext, etc.) fall through to their default `createContext` values.
 */
import "@xyflow/react/dist/style.css";
import "../../index.css";

import { fireEvent } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import type { SDCPN } from "../../core/types/sdcpn";
import { EditorProvider } from "../../state/editor-provider";
import {
  SDCPNContext,
  type SDCPNContextValue,
} from "../../state/sdcpn-context";
import { SDCPNView } from "./sdcpn-view";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function createTestSDCPN(overrides?: Partial<SDCPN>): SDCPN {
  return {
    places: [
      {
        id: "place__1",
        name: "PlaceA",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 100,
        y: 100,
      },
      {
        id: "place__2",
        name: "PlaceB",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 400,
        y: 100,
      },
    ],
    transitions: [
      {
        id: "transition__1",
        name: "TransitionA",
        inputArcs: [],
        outputArcs: [],
        lambdaType: "predicate",
        lambdaCode: "",
        transitionKernelCode: "",
        x: 250,
        y: 250,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [],
    ...overrides,
  };
}

function createMockSDCPNContext(
  sdcpn: SDCPN,
  overrides?: Partial<SDCPNContextValue>,
): SDCPNContextValue {
  return {
    createNewNet: vi.fn(),
    existingNets: [],
    loadPetriNet: vi.fn(),
    petriNetId: "test-net",
    petriNetDefinition: sdcpn,
    readonly: false,
    mutatePetriNetDefinition: vi.fn(),
    setTitle: vi.fn(),
    title: "Test Net",
    addPlace: vi.fn(),
    updatePlace: vi.fn(),
    updatePlacePosition: vi.fn(),
    removePlace: vi.fn(),
    addTransition: vi.fn(),
    updateTransition: vi.fn(),
    updateTransitionPosition: vi.fn(),
    removeTransition: vi.fn(),
    addArc: vi.fn(),
    removeArc: vi.fn(),
    updateArcWeight: vi.fn(),
    addType: vi.fn(),
    updateType: vi.fn(),
    removeType: vi.fn(),
    addDifferentialEquation: vi.fn(),
    updateDifferentialEquation: vi.fn(),
    removeDifferentialEquation: vi.fn(),
    addParameter: vi.fn(),
    updateParameter: vi.fn(),
    removeParameter: vi.fn(),
    getItemType: vi.fn((id: string) => {
      if (id.startsWith("place")) {
        return "place";
      }
      if (id.startsWith("transition")) {
        return "transition";
      }
      if (id.startsWith("$A_")) {
        return "arc";
      }
      return null;
    }),
    deleteItemsByIds: vi.fn(),
    layoutGraph: vi.fn(async () => {}),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

/**
 * Render SDCPNView wrapped in:
 * - The **real** EditorProvider (manages selection, dragging, cursor mode, etc.)
 * - A controlled SDCPNContext (initialised from `sdcpn`, mutations tracked via vi.fn())
 *
 * All other contexts use their default createContext values.
 */
const renderIntegration = (opts?: {
  sdcpn?: SDCPN;
  sdcpnOverrides?: Partial<SDCPNContextValue>;
}) => {
  const sdcpn = opts?.sdcpn ?? createTestSDCPN();
  const sdcpnCtx = createMockSDCPNContext(sdcpn, opts?.sdcpnOverrides);

  const result = render(
    <SDCPNContext value={sdcpnCtx}>
      <EditorProvider>
        <div style={{ width: 800, height: 600 }}>
          <SDCPNView />
        </div>
      </EditorProvider>
    </SDCPNContext>,
  );

  return { result, sdcpnCtx };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForNodes(expectedCount: number) {
  await expect
    .poll(() => document.querySelectorAll(".react-flow__node").length, {
      timeout: 5_000,
      message: `Expected ${expectedCount} rendered nodes`,
    })
    .toBe(expectedCount);
}

function getNodeRect(id: string) {
  const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement;
  return el.getBoundingClientRect();
}

/**
 * Simulate dragging a ReactFlow node via native mouse events.
 * d3-drag listens for mousedown on the node element, then
 * mousemove/mouseup on `event.view` (window).
 *
 * Returns a `release()` function so callers can assert mid-drag state
 * before ending the drag.
 */
const dragNode = (
  nodeEl: Element,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps = 5,
) => {
  fireEvent.mouseDown(nodeEl, {
    clientX: startX,
    clientY: startY,
    button: 0,
    view: window,
  });

  const dx = endX - startX;
  const dy = endY - startY;

  for (let i = 1; i <= steps; i++) {
    fireEvent.mouseMove(window, {
      clientX: startX + (dx * i) / steps,
      clientY: startY + (dy * i) / steps,
      button: 0,
      view: window,
    });
  }

  return {
    release() {
      fireEvent.mouseUp(window, {
        clientX: endX,
        clientY: endY,
        button: 0,
        view: window,
      });
    },
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SDCPNView (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("node selection via click", () => {
    it("selects a node on click (visible via ReactFlow selected class)", async () => {
      renderIntegration();
      await waitForNodes(3);

      const node = document.querySelector('[data-id="place__1"]')!;
      fireEvent.click(node);

      // The real EditorProvider updates selection → mapper sets selected: true
      // → ReactFlow applies the `selected` class on re-render.
      await expect
        .poll(
          () =>
            document
              .querySelector('[data-id="place__1"]')
              ?.classList.contains("selected"),
          { timeout: 3_000 },
        )
        .toBe(true);
    });

    it("ctrl+click toggles a second node into the selection", async () => {
      renderIntegration();
      await waitForNodes(3);

      // Select first node
      fireEvent.click(document.querySelector('[data-id="place__1"]')!);
      await expect
        .poll(
          () =>
            document
              .querySelector('[data-id="place__1"]')
              ?.classList.contains("selected"),
          { timeout: 3_000 },
        )
        .toBe(true);

      // Hold Meta key so ReactFlow's useKeyPress sets multiSelectionActive = true,
      // then click the second node, then release Meta.
      // Use native dispatchEvent since fireEvent may not trigger listeners on window reliably.
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Meta",
          code: "MetaLeft",
          metaKey: true,
          bubbles: true,
        }),
      );

      // Wait for React to process the key press and update multiSelectionActive
      await new Promise((r) => setTimeout(r, 100));

      fireEvent.click(document.querySelector('[data-id="transition__1"]')!, {
        metaKey: true,
      });

      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Meta",
          code: "MetaLeft",
          metaKey: false,
          bubbles: true,
        }),
      );

      await expect
        .poll(
          () =>
            document
              .querySelector('[data-id="transition__1"]')
              ?.classList.contains("selected"),
          { timeout: 3_000 },
        )
        .toBe(true);

      // First node should still be selected
      expect(
        document
          .querySelector('[data-id="place__1"]')
          ?.classList.contains("selected"),
      ).toBe(true);
    });

    it("clicking a new node deselects the previous one", async () => {
      renderIntegration();
      await waitForNodes(3);

      fireEvent.click(document.querySelector('[data-id="place__1"]')!);
      await expect
        .poll(
          () =>
            document
              .querySelector('[data-id="place__1"]')
              ?.classList.contains("selected"),
          { timeout: 3_000 },
        )
        .toBe(true);

      // Click a different node without ctrl
      fireEvent.click(document.querySelector('[data-id="place__2"]')!);
      await expect
        .poll(
          () =>
            document
              .querySelector('[data-id="place__2"]')
              ?.classList.contains("selected"),
          { timeout: 3_000 },
        )
        .toBe(true);

      // First node should no longer be selected
      expect(
        document
          .querySelector('[data-id="place__1"]')
          ?.classList.contains("selected"),
      ).toBe(false);
    });
  });

  describe("pane click clears selection", () => {
    it("clears all selected nodes when clicking empty canvas in pan mode", async () => {
      renderIntegration();
      await waitForNodes(3);

      // Select a node first
      fireEvent.click(document.querySelector('[data-id="place__1"]')!);
      await expect
        .poll(
          () =>
            document
              .querySelector('[data-id="place__1"]')
              ?.classList.contains("selected"),
          { timeout: 3_000 },
        )
        .toBe(true);

      // Click the pane (EditorProvider defaults to pan cursor mode)
      const pane = document.querySelector(".react-flow__pane")!;
      fireEvent.click(pane);

      await expect
        .poll(
          () =>
            document
              .querySelector('[data-id="place__1"]')
              ?.classList.contains("selected"),
          { timeout: 3_000 },
        )
        .toBe(false);
    });
  });

  describe("single-node drag commits position", () => {
    it("updates the SDCPN store position after dragging a node", async () => {
      const { sdcpnCtx } = renderIntegration();
      await waitForNodes(3);

      const nodeEl = document.querySelector('[data-id="place__1"]')!;
      const rect = getNodeRect("place__1");
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;

      const drag = dragNode(
        nodeEl,
        startX,
        startY,
        startX + 90,
        startY + 45,
        6,
      );
      drag.release();

      await expect
        .poll(
          () =>
            (sdcpnCtx.updatePlacePosition as ReturnType<typeof vi.fn>).mock
              .calls.length,
          { timeout: 3_000, message: "updatePlacePosition should be called" },
        )
        .toBeGreaterThan(0);

      // Verify only place__1 was updated
      const calls = (sdcpnCtx.updatePlacePosition as ReturnType<typeof vi.fn>)
        .mock.calls;
      const place1Calls = calls.filter(
        (call: unknown[]) => call[0] === "place__1",
      );
      const place2Calls = calls.filter(
        (call: unknown[]) => call[0] === "place__2",
      );
      expect(place1Calls.length).toBeGreaterThan(0);
      expect(place2Calls).toHaveLength(0);
    });
  });

  describe("multi-node drag", () => {
    it("commits positions for all selected nodes and preserves relative distances", async () => {
      const { sdcpnCtx } = renderIntegration();
      await waitForNodes(3);

      // Step 1: Select place__1
      fireEvent.click(document.querySelector('[data-id="place__1"]')!);
      await expect
        .poll(
          () =>
            document
              .querySelector('[data-id="place__1"]')
              ?.classList.contains("selected"),
          { timeout: 3_000 },
        )
        .toBe(true);

      // Step 2: Hold Meta, click transition__1 to add to selection, release Meta
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Meta",
          code: "MetaLeft",
          metaKey: true,
          bubbles: true,
        }),
      );
      await new Promise((r) => setTimeout(r, 100));

      fireEvent.click(document.querySelector('[data-id="transition__1"]')!, {
        metaKey: true,
      });

      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Meta",
          code: "MetaLeft",
          metaKey: false,
          bubbles: true,
        }),
      );

      await expect
        .poll(
          () =>
            document
              .querySelector('[data-id="transition__1"]')
              ?.classList.contains("selected"),
          { timeout: 3_000 },
        )
        .toBe(true);

      // Record initial screen positions
      const initialPlace1 = getNodeRect("place__1");
      const initialPlace2 = getNodeRect("place__2");
      const initialTrans1 = getNodeRect("transition__1");

      const initialScreenDx = initialTrans1.left - initialPlace1.left;
      const initialScreenDy = initialTrans1.top - initialPlace1.top;

      // Step 3: Drag place__1 (selected) from its center
      const nodeEl = document.querySelector('[data-id="place__1"]')!;
      const startX = initialPlace1.left + initialPlace1.width / 2;
      const startY = initialPlace1.top + initialPlace1.height / 2;
      const dragDx = 105;
      const dragDy = 60;

      const drag = dragNode(
        nodeEl,
        startX,
        startY,
        startX + dragDx,
        startY + dragDy,
        8,
      );

      // Step 4: Verify DURING the drag — selected nodes moved
      await expect
        .poll(
          () => {
            const rect = getNodeRect("place__1");
            return Math.abs(rect.left - initialPlace1.left);
          },
          { timeout: 3_000, message: "place__1 should move during drag" },
        )
        .toBeGreaterThan(10);

      // Unselected node should not have moved significantly
      const place2During = getNodeRect("place__2");
      expect(Math.abs(place2During.left - initialPlace2.left)).toBeLessThan(20);
      expect(Math.abs(place2During.top - initialPlace2.top)).toBeLessThan(20);

      // Selected nodes should maintain relative distance during drag
      const place1During = getNodeRect("place__1");
      const trans1During = getNodeRect("transition__1");
      expect(
        Math.abs(trans1During.left - place1During.left - initialScreenDx),
      ).toBeLessThan(5);
      expect(
        Math.abs(trans1During.top - place1During.top - initialScreenDy),
      ).toBeLessThan(5);

      // Step 5: Release the drag
      drag.release();

      // Step 6: Verify AFTER the drag — positions committed atomically via
      // a single mutatePetriNetDefinition call (batched).
      const mutateFn = sdcpnCtx.mutatePetriNetDefinition as ReturnType<
        typeof vi.fn
      >;
      await expect
        .poll(() => mutateFn.mock.calls.length, {
          timeout: 3_000,
          message: "mutatePetriNetDefinition should be called on drag end",
        })
        .toBeGreaterThan(0);

      // Apply the last mutation to a copy of the SDCPN to inspect committed positions
      const sdcpnCopy = structuredClone(createTestSDCPN());
      const lastMutation = mutateFn.mock.calls.at(-1)![0] as (
        draft: SDCPN,
      ) => void;
      lastMutation(sdcpnCopy);

      // place__1 should have been updated
      const place1 = sdcpnCopy.places.find((place) => place.id === "place__1")!;
      expect(place1.x).not.toBe(100);
      expect(place1.y).not.toBe(100);

      // transition__1 should have been updated
      const trans1 = sdcpnCopy.transitions.find(
        (tr) => tr.id === "transition__1",
      )!;
      expect(trans1.x).not.toBe(250);
      expect(trans1.y).not.toBe(250);

      // place__2 should NOT have been updated (unselected)
      const place2 = sdcpnCopy.places.find((place) => place.id === "place__2")!;
      expect(place2.x).toBe(400);
      expect(place2.y).toBe(100);

      // Verify relative distance preserved in committed SDCPN positions.
      // Original SDCPN centers: place__1 (100,100), transition__1 (250,250)
      // Distance: dx=150, dy=150
      const committedDx = trans1.x - place1.x;
      const committedDy = trans1.y - place1.y;
      expect(committedDx).toBeCloseTo(150, 0);
      expect(committedDy).toBeCloseTo(150, 0);
    });
  });

  describe("keyboard delete", () => {
    it("deletes selected nodes via Delete key", async () => {
      const { sdcpnCtx } = renderIntegration();
      await waitForNodes(3);

      // Select a node
      fireEvent.click(document.querySelector('[data-id="place__1"]')!);
      await expect
        .poll(
          () =>
            document
              .querySelector('[data-id="place__1"]')
              ?.classList.contains("selected"),
          { timeout: 3_000 },
        )
        .toBe(true);

      // Press Delete
      const container = document.querySelector(".react-flow")?.parentElement;
      expect(container).toBeTruthy();
      fireEvent.keyDown(container!, { key: "Delete" });

      expect(sdcpnCtx.deleteItemsByIds).toHaveBeenCalled();

      // The deleted set should contain place__1
      const deletedSet = (sdcpnCtx.deleteItemsByIds as ReturnType<typeof vi.fn>)
        .mock.calls[0]![0] as Set<string>;
      expect(deletedSet.has("place__1")).toBe(true);
    });
  });
});
