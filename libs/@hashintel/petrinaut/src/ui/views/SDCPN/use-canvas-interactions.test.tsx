/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PetrinautInstanceContext } from "../../../react/instance-context";
import { NotificationsContext } from "../../../react/notifications/context";
import { ActiveNetContext } from "../../../react/state/active-net-context";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { fusionLinks } from "./fusion-links";
import { useCanvasInteractions } from "./use-canvas-interactions";

import type { CanvasScene } from "./canvas-scene";
import type {
  CanvasConnection,
  CanvasLinkRewire,
} from "./use-canvas-interactions";
import type {
  Fusion,
  FusionMember,
  Petrinaut,
  SelectionMap,
} from "@hashintel/petrinaut-core";

afterEach(cleanup);

const place = (placeId: string): FusionMember => ({ kind: "place", placeId });
const port = (
  componentInstanceId: string,
  portPlaceId = "in",
): FusionMember => ({
  kind: "componentPort",
  componentInstanceId,
  portPlaceId,
});

/** Buffer is fused with the port of M1; Store, T and M2 stand alone. */
const belt: Fusion = { id: "belt", members: [place("buffer"), port("m1")] };
const itemTypes: Record<
  string,
  "place" | "transition" | "componentInstance" | "fusion"
> = {
  buffer: "place",
  store: "place",
  t: "transition",
  m1: "componentInstance",
  m2: "componentInstance",
  belt: "fusion",
};
const [beltLink] = fusionLinks(belt);

const scene = {
  nodes: Object.entries(itemTypes)
    .filter(([, kind]) => kind !== "fusion")
    .map(([id, kind]) => ({ id, kind })),
  arcs: [],
  // Buffer on the left, M1's port on the right.
  fusions: [
    {
      id: beltLink!.id,
      fusionId: belt.id,
      sourceId: "buffer",
      sourcePortId: null,
      targetId: "m1",
      targetPortId: "in",
    },
  ],
} as unknown as CanvasScene;

const connection = (
  sourceId: string,
  sourcePortId: string | null,
  targetId: string,
  targetPortId: string | null,
): CanvasConnection => ({ sourceId, sourcePortId, targetId, targetPortId });

const mutations = {
  addFusion: vi.fn(),
  addFusionMember: vi.fn(),
  removeFusionMember: vi.fn(),
  replaceFusionMember: vi.fn(),
};
/** The end of the belt at M1's port, dropped on a node or on nothing. */
const dropPortEnd = (
  nodeId?: string,
  portId: string | null = null,
): CanvasLinkRewire => ({
  linkId: beltLink!.id,
  end: "target",
  onto: nodeId === undefined ? null : { nodeId, portId },
});
const addNotification = vi.fn();
const editor: { selection: SelectionMap } = { selection: new Map() };

beforeEach(() => {
  vi.clearAllMocks();
  editor.selection = new Map([[belt.id, { type: "fusion", id: belt.id }]]);
});

const Wrapper = ({ children }: { children: ReactNode }) => (
  <PetrinautInstanceContext value={{ mutations } as unknown as Petrinaut}>
    <SDCPNContext
      value={{
        ...use(SDCPNContext),
        readonly: false,
        getItemType: (id) => itemTypes[id] ?? null,
      }}
    >
      <ActiveNetContext
        value={{
          ...use(ActiveNetContext),
          activeNet: { ...use(ActiveNetContext).activeNet, fusions: [belt] },
        }}
      >
        <NotificationsContext
          value={{ ...use(NotificationsContext), addNotification }}
        >
          <EditorContext
            value={{
              ...use(EditorContext),
              setSelection: (next) => {
                editor.selection =
                  typeof next === "function" ? next(editor.selection) : next;
              },
            }}
          >
            {children}
          </EditorContext>
        </NotificationsContext>
      </ActiveNetContext>
    </SDCPNContext>
  </PetrinautInstanceContext>
);

const renderInteractions = () => ({
  interactions: renderHook(() => useCanvasInteractions(scene), {
    wrapper: Wrapper,
  }).result.current,
  selectedIds: () => [...editor.selection.keys()],
});

describe("useCanvasInteractions", () => {
  it("lets go of a selected fusion when its link is deselected for a node", () => {
    const { interactions, selectedIds } = renderInteractions();

    // What a click on M2 reports while the fusion is selected.
    interactions.applySelectionChanges([{ id: "m2", selected: true }]);
    interactions.applySelectionChanges([{ id: beltLink!.id, selected: false }]);

    expect(selectedIds()).toEqual(["m2"]);
  });

  it("never selects a fusion from a selection box", () => {
    const { interactions, selectedIds } = renderInteractions();

    interactions.applySelectionChanges([{ id: beltLink!.id, selected: false }]);
    interactions.applySelectionChanges([{ id: beltLink!.id, selected: true }]);

    expect(selectedIds()).toEqual([]);
  });

  it("fuses a place with a port and two ports, in either direction, and nothing else", () => {
    const { interactions } = renderInteractions();
    const valid = (...ends: Parameters<typeof connection>) =>
      interactions.isValidConnection(connection(...ends));

    expect(valid("store", null, "m2", "in")).toBe(true);
    expect(valid("m2", "in", "store", null)).toBe(true);
    expect(valid("m1", "out", "m2", "in")).toBe(true);
    expect(valid("m2", "in", "m2", "out")).toBe(true);
    expect(valid("m2", "in", "m2", "in")).toBe(false);
    expect(valid("buffer", null, "store", null)).toBe(false);
    // A place to a transition is an arc.
    expect(valid("buffer", null, "t", null)).toBe(true);
  });

  it("adds a port to the fusion its other end is in, and refuses a second place", () => {
    const { interactions } = renderInteractions();

    interactions.connect(connection("buffer", null, "m2", "in"));
    expect(mutations.addFusionMember).toHaveBeenCalledWith(
      expect.objectContaining({ fusionId: "belt", member: port("m2") }),
    );

    interactions.connect(connection("store", null, "m1", "in"));
    expect(addNotification).toHaveBeenCalledOnce();
    expect(mutations.addFusionMember).toHaveBeenCalledOnce();
    expect(mutations.addFusion).not.toHaveBeenCalled();
  });

  it("offers a link's end to a port or place outside its fusion, and to nothing else", () => {
    const { interactions } = renderInteractions();

    expect(interactions.canRewireLink(dropPortEnd("m2", "in"))).toBe(true);
    expect(interactions.canRewireLink(dropPortEnd())).toBe(true);
    // A transition, the bare card and the fusion's own members take no end.
    expect(interactions.canRewireLink(dropPortEnd("t"))).toBe(false);
    expect(interactions.canRewireLink(dropPortEnd("m2"))).toBe(false);
    expect(interactions.canRewireLink(dropPortEnd("buffer"))).toBe(false);
    expect(
      interactions.canRewireLink({ ...dropPortEnd("m2", "in"), linkId: "x" }),
    ).toBe(false);
  });

  it("moves the fusion to where an end of its link is dropped", () => {
    const { interactions, selectedIds } = renderInteractions();

    interactions.rewireLink(dropPortEnd("m2", "in"));
    expect(mutations.replaceFusionMember).toHaveBeenCalledWith(
      expect.objectContaining({
        fusionId: "belt",
        member: port("m1"),
        replacement: port("m2"),
      }),
    );
    expect(selectedIds()).toEqual(["belt"]);

    // The other end is the place: it gives way to another place.
    interactions.rewireLink({ ...dropPortEnd("store"), end: "source" });
    expect(mutations.replaceFusionMember).toHaveBeenLastCalledWith(
      expect.objectContaining({
        member: place("buffer"),
        replacement: place("store"),
      }),
    );
  });

  it("takes a member out when its end is dropped on the empty canvas, and refuses a second place", () => {
    const { interactions } = renderInteractions();

    interactions.rewireLink(dropPortEnd());
    expect(mutations.removeFusionMember).toHaveBeenCalledWith(
      expect.objectContaining({ fusionId: "belt", member: port("m1") }),
    );

    interactions.rewireLink(dropPortEnd("store"));
    expect(addNotification).toHaveBeenCalledOnce();
    expect(mutations.replaceFusionMember).not.toHaveBeenCalled();
  });
});
