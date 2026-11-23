/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveLibrary } from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../react/document/active-net-context";
import { CompositionContext } from "../../../react/document/composition-context";
import { PetrinautInstanceContext } from "../../../react/document/instance-context";
import { SDCPNContext } from "../../../react/document/sdcpn-context";
import { NotificationsContext } from "../../../react/notifications/context";
import { EditorContext } from "../../../react/state/editor-context";
import { logisticsLibrary } from "../../libraries-story-fixtures";
import { CanvasPointerContext, createCanvasPointer } from "./canvas-pointer";
import { fusionLinks } from "./fusion-links";
import { useCanvasInteractions } from "./use-canvas-interactions";

import type { ActiveNetDefinition } from "../../../react/document/active-net-context";
import type {
  CanvasConnection,
  CanvasLinkRewire,
} from "./use-canvas-interactions";
import type {
  Fusion,
  FusionMember,
  Petrinaut,
  PetrinautRules,
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
const belt: Fusion = {
  id: "belt",
  name: "Belt",
  members: [place("buffer"), port("m1")],
};
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

const idsOf = (type: string) =>
  Object.entries(itemTypes)
    .filter(([, itemType]) => itemType === type)
    .map(([id]) => ({ id }));
const net = {
  places: idsOf("place"),
  transitions: idsOf("transition"),
  componentInstances: idsOf("componentInstance"),
  fusions: [belt],
} as unknown as ActiveNetDefinition;

const connection = (
  sourceId: string,
  sourcePortId: string | null,
  targetId: string,
  targetPortId: string | null,
): CanvasConnection => ({ sourceId, sourcePortId, targetId, targetPortId });

const mutations = {
  addPlace: vi.fn(),
  addComponentInstance: vi.fn(),
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
  fusionId: belt.id,
  from: { nodeId: "m1", portId: "in" },
  onto: nodeId === undefined ? null : { nodeId, portId },
});
const addNotification = vi.fn();
const setEditionMode = vi.fn();
const editor: {
  selection: SelectionMap;
  rules: PetrinautRules;
  /** What the host's rules answer a mutation with. */
  refusal: string | null;
} = {
  selection: new Map(),
  rules: {},
  refusal: null,
};
const libraries = new Map([
  [logisticsLibrary.id, resolveLibrary(logisticsLibrary.id, logisticsLibrary)],
]);

beforeEach(() => {
  vi.clearAllMocks();
  editor.selection = new Map([[belt.id, { type: "fusion", id: belt.id }]]);
  editor.rules = {};
  editor.refusal = null;
});

const Wrapper = ({ children }: { children: ReactNode }) => (
  <PetrinautInstanceContext
    value={
      {
        mutations,
        mutationRefusal: () => editor.refusal,
      } as unknown as Petrinaut
    }
  >
    <SDCPNContext
      value={{
        ...use(SDCPNContext),
        readonly: false,
      }}
    >
      <ActiveNetContext
        value={{
          ...use(ActiveNetContext),
          activeNet: { ...use(ActiveNetContext).activeNet, ...net },
        }}
      >
        <NotificationsContext
          value={{ ...use(NotificationsContext), addNotification }}
        >
          <CompositionContext
            value={{
              ...use(CompositionContext),
              libraries,
              rules: editor.rules,
            }}
          >
            <EditorContext
              value={{
                ...use(EditorContext),
                editionMode: "add-component",
                componentToAdd: { id: "stage" },
                setEditionMode,
                setSelection: (next) => {
                  editor.selection =
                    typeof next === "function" ? next(editor.selection) : next;
                },
                selectItem: (item) => {
                  editor.selection = new Map([[item.id, item]]);
                },
              }}
            >
              {children}
            </EditorContext>
          </CompositionContext>
        </NotificationsContext>
      </ActiveNetContext>
    </SDCPNContext>
  </PetrinautInstanceContext>
);

const renderInteractions = () => {
  const pointer = createCanvasPointer();
  const WithPointer = ({ children }: { children: ReactNode }) => (
    <CanvasPointerContext value={pointer}>
      <Wrapper>{children}</Wrapper>
    </CanvasPointerContext>
  );
  return {
    interactions: renderHook(() => useCanvasInteractions(), {
      wrapper: WithPointer,
    }).result.current,
    selectedIds: () => [...editor.selection.keys()],
    hoveredId: () => pointer.hoveredId.get(),
  };
};

const free = { pressed: false, connecting: false };
const pressed = { pressed: true, connecting: false };
const connecting = { pressed: true, connecting: true };

describe("the hover of what the pointer comes onto", () => {
  it("is the item, with no button down", () => {
    const { interactions, hoveredId } = renderInteractions();

    interactions.enter("store", free);
    expect(hoveredId()).toBe("store");

    interactions.clearHover();
    expect(hoveredId()).toBeNull();
  });

  it("waits for the release while a button is down", () => {
    const { interactions, hoveredId } = renderInteractions();

    // What a pan reports as it carries a node, then an arc, under the pointer.
    interactions.enter("store", pressed);
    interactions.clearHover();
    interactions.enter("t", pressed);
    expect(hoveredId()).toBeNull();

    interactions.releasePointer();
    expect(hoveredId()).toBe("t");
  });

  it("is nothing after a release on the empty canvas", () => {
    const { interactions, hoveredId } = renderInteractions();

    interactions.enter("store", pressed);
    interactions.clearHover();
    interactions.releasePointer();

    expect(hoveredId()).toBeNull();
  });

  it("leaves an item hovered before the press as it is at the release", () => {
    const { interactions, hoveredId } = renderInteractions();

    interactions.enter("store", free);
    interactions.releasePointer();

    expect(hoveredId()).toBe("store");
  });

  it("forgets the item that waited once another one is hovered", () => {
    const { interactions, hoveredId } = renderInteractions();

    // A release the canvas did not hear, then the pointer back on another item.
    interactions.enter("store", pressed);
    interactions.enter("t", free);
    interactions.releasePointer();

    expect(hoveredId()).toBe("t");
  });

  it("is the node a connection is drawn onto, at once", () => {
    const { interactions, hoveredId } = renderInteractions();

    interactions.enter("t", connecting);

    expect(hoveredId()).toBe("t");
  });

  it("stays the dragged node, whatever the drag carries it over", () => {
    const { interactions, hoveredId } = renderInteractions();

    // A drag starts with the button down and hovers its node at once.
    interactions.hover("store");
    interactions.enter("t", pressed);

    expect(hoveredId()).toBe("store");
  });
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

  it("connects by fusion alone in an editor that only composes", () => {
    editor.rules = { edit: "compose" };
    const { interactions } = renderInteractions();
    const valid = (...ends: Parameters<typeof connection>) =>
      interactions.isValidConnection(connection(...ends));

    expect(valid("m1", "out", "m2", "in")).toBe(true);
    expect(valid("store", null, "m2", "in")).toBe(true);
    // No arc is drawn, to a place or to a port.
    expect(valid("buffer", null, "t", null)).toBe(false);
    expect(valid("t", null, "m2", "in")).toBe(false);
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

  it("starts a fusion without a name, which core then gives it", () => {
    const { interactions } = renderInteractions();

    interactions.connect(connection("store", null, "m2", "in"));

    expect(mutations.addFusion).toHaveBeenCalledExactlyOnceWith({
      id: expect.any(String) as string,
      members: [place("store"), port("m2")],
      targetComponentId: null,
    });
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
      interactions.canRewireLink({ ...dropPortEnd("m2", "in"), fusionId: "x" }),
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
    interactions.rewireLink({
      ...dropPortEnd("store"),
      from: { nodeId: "buffer", portId: null },
    });
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

  it("places an instance of the component dropped on the canvas, named after it", () => {
    const { interactions } = renderInteractions();

    interactions.dropComponent(
      { from: logisticsLibrary.id, id: "conveyor" },
      { x: 40, y: 60 },
    );
    interactions.dropComponent({ id: "stage" }, { x: 0, y: 0 });

    expect(mutations.addComponentInstance).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "Conveyor",
        component: { from: logisticsLibrary.id, id: "conveyor" },
        parameterValues: {},
      }),
    );
    expect(mutations.addComponentInstance).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ component: { id: "stage" } }),
    );
  });

  it("selects the instance a click places and puts the tool down", () => {
    const { interactions, selectedIds } = renderInteractions();

    interactions.clickPane({ x: 40, y: 60 });

    const [[placed]] = mutations.addComponentInstance.mock.calls as [
      [{ id: string }],
    ];
    expect(selectedIds()).toEqual([placed.id]);
    expect(setEditionMode).toHaveBeenCalledExactlyOnceWith("cursor");
  });

  it("keeps the selection and the tool as they were when the host's rules refuse what a click or a drop would add", () => {
    editor.rules = { edit: "compose" };
    editor.refusal =
      "This editor only places and connects the components it is given.";
    const { interactions, selectedIds } = renderInteractions();

    interactions.clickPane({ x: 40, y: 60 });
    interactions.dropNode("place", { x: 0, y: 0 });
    interactions.connect(connection("store", null, "m2", "in"));

    expect(mutations.addComponentInstance).not.toHaveBeenCalled();
    expect(mutations.addPlace).not.toHaveBeenCalled();
    expect(mutations.addFusion).not.toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: "host-rules", message: editor.refusal }),
    );
    // Nothing was added: what was selected stays, and the tool stays armed.
    expect(selectedIds()).toEqual([belt.id]);
    expect(setEditionMode).not.toHaveBeenCalled();
  });
});
