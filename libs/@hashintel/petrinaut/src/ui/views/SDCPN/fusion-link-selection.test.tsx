/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { use, useState, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../react/document/active-net-context";
import { PetrinautInstanceContext } from "../../../react/document/instance-context";
import { SDCPNContext } from "../../../react/document/sdcpn-context";
import {
  defaultPetrinautNavigationState,
  type PetrinautNavigationState,
} from "../../../react/navigation/navigation";
import { PetrinautNavigationProvider } from "../../../react/navigation/navigation-provider";
import { EditorContext } from "../../../react/state/editor-context";
import { EditorProvider } from "../../../react/state/editor-provider";
import { fusionLinks } from "./fusion-links";
import { useCanvasInteractions } from "./use-canvas-interactions";

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
  name: "Belt",
  members: [{ kind: "place", placeId: "buffer" }, port("m1"), port("m2")],
};
const links = fusionLinks(belt);

const itemTypes: Record<string, "place" | "componentInstance" | "fusion"> = {
  buffer: "place",
  m1: "componentInstance",
  m2: "componentInstance",
  belt: "fusion",
};

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

/** The editor's own selection state around the hook, not a stand-in. */
const Wrapper = ({ children }: { children: ReactNode }) => {
  const activeNetContext = use(ActiveNetContext);
  return (
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
                ...activeNetContext,
                activeNet: { ...activeNetContext.activeNet, fusions: [belt] },
              }}
            >
              {children}
            </ActiveNetContext>
          </EditorProvider>
        </NavigationHost>
      </SDCPNContext>
    </PetrinautInstanceContext>
  );
};

it("keeps a fusion selected when one of its links is clicked again", async () => {
  const { result } = renderHook(
    () => ({
      interactions: useCanvasInteractions(),
      selection: use(EditorContext).selection,
    }),
    { wrapper: Wrapper },
  );
  const [firstLink, secondLink] = links;
  const click = async (deselected: string[]) =>
    // One click is two calls from React Flow: the edges it deselects, then
    // the edge that was clicked.
    act(async () => {
      result.current.interactions.applySelectionChanges(
        deselected.map((id) => ({ id, selected: false })),
      );
      result.current.interactions.selectLink({ type: "fusion", id: belt.id });
      await Promise.resolve();
    });

  await click([]);
  expect([...result.current.selection.keys()]).toEqual(["belt"]);

  // Both links are drawn selected, so clicking the first deselects the second.
  expect(firstLink).toBeDefined();
  await click([secondLink!.id]);
  expect([...result.current.selection.keys()]).toEqual(["belt"]);
});
