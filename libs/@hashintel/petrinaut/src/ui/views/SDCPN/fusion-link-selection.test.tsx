/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { use, useState, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import { PetrinautInstanceContext } from "../../../react/instance-context";
import {
  defaultPetrinautNavigationState,
  PetrinautNavigationProvider,
  type PetrinautNavigationState,
} from "../../../react/navigation";
import { ActiveNetContext } from "../../../react/state/active-net-context";
import {
  EditorContext,
  type EditorContextValue,
} from "../../../react/state/editor-context";
import { EditorProvider } from "../../../react/state/editor-provider";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { fusionLinks } from "./fusion-links";
import {
  useCanvasInteractions,
  type CanvasInteractions,
} from "./use-canvas-interactions";

import type { CanvasScene } from "./canvas-scene";
import type {
  Fusion,
  FusionMember,
  Petrinaut,
} from "@hashintel/petrinaut-core";

afterEach(cleanup);

const port = (componentInstanceId: string): FusionMember => ({
  kind: "componentPort",
  componentInstanceId,
  portPlaceId: "in",
});

/** Three members, so the fusion draws two links. */
const belt: Fusion = {
  id: "belt",
  members: [{ kind: "place", placeId: "buffer" }, port("m1"), port("m2")],
};
const links = fusionLinks(belt);

const itemTypes: Record<string, "place" | "componentInstance" | "fusion"> = {
  buffer: "place",
  m1: "componentInstance",
  m2: "componentInstance",
  belt: "fusion",
};

const scene = {
  nodes: [
    { id: "buffer", kind: "place" },
    { id: "m1", kind: "componentInstance" },
    { id: "m2", kind: "componentInstance" },
  ],
  arcs: [],
  fusions: links.map((link) => ({ id: link.id, fusionId: belt.id })),
} as unknown as CanvasScene;

const NavigationHost = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<PetrinautNavigationState>(
    defaultPetrinautNavigationState,
  );
  return (
    <PetrinautNavigationProvider controller={{ state, onNavigate: setState }}>
      {children}
    </PetrinautNavigationProvider>
  );
};

const held: { interactions?: CanvasInteractions; editor?: EditorContextValue } =
  {};

const Probe = () => {
  Object.assign(held, {
    interactions: useCanvasInteractions(scene),
    editor: use(EditorContext),
  });
  return null;
};

/** The canvas hook over the editor's own selection state, not a stand-in. */
const App = () => (
  <PetrinautInstanceContext value={{ mutations: {} } as unknown as Petrinaut}>
    <SDCPNContext
      value={{
        ...use(SDCPNContext),
        readonly: false,
        extensions: DEFAULT_PETRINAUT_EXTENSIONS,
        getItemType: (id) => itemTypes[id] ?? null,
      }}
    >
      <NavigationHost>
        <EditorProvider>
          <ActiveNetContext
            value={{
              ...use(ActiveNetContext),
              activeNet: {
                ...use(ActiveNetContext).activeNet,
                fusions: [belt],
              },
            }}
          >
            <Probe />
          </ActiveNetContext>
        </EditorProvider>
      </NavigationHost>
    </SDCPNContext>
  </PetrinautInstanceContext>
);

it("keeps a fusion selected when one of its links is clicked again", async () => {
  render(<App />);
  const [firstLink, secondLink] = links;
  const click = async (deselected: string[]) =>
    // One click is two calls from React Flow: the edges it deselects, then
    // the edge that was clicked.
    act(async () => {
      held.interactions!.applySelectionChanges(
        deselected.map((id) => ({ id, selected: false })),
      );
      held.interactions!.selectLink({ type: "fusion", id: belt.id });
      await Promise.resolve();
    });

  await click([]);
  expect([...held.editor!.selection.keys()]).toEqual(["belt"]);

  // Both links are drawn selected, so clicking the first deselects the second.
  expect(firstLink).toBeDefined();
  await click([secondLink!.id]);
  expect([...held.editor!.selection.keys()]).toEqual(["belt"]);
});
