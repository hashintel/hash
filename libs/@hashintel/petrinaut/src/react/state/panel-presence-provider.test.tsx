/** @vitest-environment jsdom */
import { cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, it } from "vitest";

import {
  type AssistantPlacement,
  EditorContext,
  type EditorContextValue,
} from "./editor-context";
import { usePanelPresence } from "./panel-presence-context";
import { PanelPresenceProvider } from "./panel-presence-provider";
import {
  defaultUserSettingsContextValue,
  UserSettingsContext,
} from "./user-settings-context";

import type { PanelPresence } from "./panel-presence";

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

afterEach(cleanup);

type Flags = Partial<
  Pick<
    EditorContextValue,
    | "isLeftSidebarOpen"
    | "isSearchOpen"
    | "hasSelection"
    | "isBottomPanelOpen"
    | "isAiAssistantOpen"
  >
>;

/** Renders the provider under an editor state that the test changes. */
const setup = ({
  showAnimations,
  flags = {},
  placement = "docked",
}: {
  showAnimations: boolean;
  flags?: Flags;
  placement?: AssistantPlacement;
}) => {
  const editor = renderHook(() => use(EditorContext)).result.current;
  let presence: PanelPresence | undefined;
  const Grabber = ({
    onPresence,
  }: {
    onPresence: (value: PanelPresence) => void;
  }) => {
    onPresence(usePanelPresence());
    return null;
  };
  const tree = (nextFlags: Flags, nextPlacement: AssistantPlacement) => (
    <UserSettingsContext
      value={{ ...defaultUserSettingsContextValue, showAnimations }}
    >
      <EditorContext
        value={{ ...editor, ...nextFlags, assistantPlacement: nextPlacement }}
      >
        <PanelPresenceProvider>
          <Grabber
            onPresence={(value) => {
              presence = value;
            }}
          />
        </PanelPresenceProvider>
      </EditorContext>
    </UserSettingsContext>
  );
  const view = render(tree(flags, placement));

  return {
    presence: presence!,
    change: (nextFlags: Flags, nextPlacement: AssistantPlacement = "docked") =>
      view.rerender(tree(nextFlags, nextPlacement)),
  };
};

it("starts the panels where the editor's state has them, with nothing to animate", async () => {
  const { presence } = setup({
    showAnimations: true,
    flags: { isBottomPanelOpen: true, isSearchOpen: true },
  });
  const seen: number[] = [];
  presence.shown.bottomPanel.on("change", (value) => seen.push(value));

  expect(presence.shown.bottomPanel.get()).toBe(1);
  // Search opens the sidebar without its toggle.
  expect(presence.shown.leftSidebar.get()).toBe(1);
  expect(presence.shown.propertiesPanel.get()).toBe(0);
  await nextFrame();
  expect(seen).toEqual([]);
});

it("slides a panel in when it opens and out when it closes", async () => {
  const { presence, change } = setup({ showAnimations: true });
  const seen: number[] = [];
  presence.shown.propertiesPanel.on("change", (value) => seen.push(value));

  change({ hasSelection: true });
  await waitFor(() => expect(presence.shown.propertiesPanel.get()).toBe(1));
  // It got there through values in between, not in one step.
  expect(seen.some((value) => value > 0 && value < 1)).toBe(true);

  change({ hasSelection: false });
  await waitFor(() => expect(presence.shown.propertiesPanel.get()).toBe(0));
});

it("finishes a slide that nothing is following any more", async () => {
  const { presence, change } = setup({ showAnimations: true });
  const stopFollowing = presence.shown.bottomPanel.on("change", () => {});

  change({ isBottomPanelOpen: true });
  await waitFor(() =>
    expect(presence.shown.bottomPanel.get()).toBeGreaterThan(0),
  );
  // A panel that unmounts while it slides stops following its value.
  stopFollowing();

  await waitFor(() => expect(presence.shown.bottomPanel.get()).toBe(1));
});

it("turns a slide around from where it is when the panel closes again", async () => {
  const { presence, change } = setup({ showAnimations: true });

  change({ isBottomPanelOpen: true });
  await waitFor(() =>
    expect(presence.shown.bottomPanel.get()).toBeGreaterThan(0),
  );
  const reached = presence.shown.bottomPanel.get();
  const seen: number[] = [];
  presence.shown.bottomPanel.on("change", (value) => seen.push(value));
  change({ isBottomPanelOpen: false });

  await waitFor(() => expect(presence.shown.bottomPanel.get()).toBe(0));
  // It closes from where it had got to, with no jump to fully open first.
  expect(reached).toBeLessThan(1);
  expect(Math.max(...seen)).toBeLessThanOrEqual(reached);
});

it("moves a panel in one step where the user wants no animation", () => {
  const { presence, change } = setup({ showAnimations: false });

  change({ isBottomPanelOpen: true });

  expect(presence.shown.bottomPanel.get()).toBe(1);
});

it("gives the docked assistant the room once it has arrived, and takes it back at once when it leaves", async () => {
  const { presence, change } = setup({ showAnimations: true });

  change({ isAiAssistantOpen: true });
  // Still sliding in over the editor.
  expect(presence.aiAssistantHasRoom.get()).toBe(0);
  await waitFor(() => expect(presence.aiAssistantHasRoom.get()).toBe(1));
  expect(presence.shown.aiAssistant.get()).toBe(1);

  change({ isAiAssistantOpen: true }, "floating");
  // The editor has the room back before the panel has moved.
  expect(presence.aiAssistantHasRoom.get()).toBe(0);
  expect(presence.aiAssistantDocked.get()).toBeGreaterThan(0);
  await waitFor(() => expect(presence.aiAssistantDocked.get()).toBe(0));

  change({ isAiAssistantOpen: true }, "docked");
  expect(presence.aiAssistantHasRoom.get()).toBe(0);
  await waitFor(() => expect(presence.aiAssistantHasRoom.get()).toBe(1));
  expect(presence.aiAssistantDocked.get()).toBe(1);
});
