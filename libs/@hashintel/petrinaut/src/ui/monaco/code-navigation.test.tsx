/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";
import { productionMachines } from "@hashintel/petrinaut-core/examples";

import { ActiveNetContext } from "../../react/state/active-net-context";
import { EditorContext } from "../../react/state/editor-context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import {
  defaultUserSettingsContextValue,
  UserSettingsContext,
} from "../../react/state/user-settings-context";
import { PetrinautPresentationProvider } from "../views/shared/presentation-context";
import { CodeNavigationProvider, useCodeNavigation } from "./code-navigation";

import type { PropsWithChildren } from "react";

const selectItem = vi.fn();
const updateSubViewSection = vi.fn();
const definition = productionMachines.petriNetDefinition;
const activeNet = {
  ...definition,
  componentInstances: definition.componentInstances ?? [],
};

const Harness = ({
  children,
  profile = "editor",
}: PropsWithChildren<{ profile?: "editor" | "preview" }>) => {
  const sdcpn = use(SDCPNContext);
  const editor = use(EditorContext);
  return (
    <SDCPNContext
      value={{
        ...sdcpn,
        petriNetDefinition: definition,
        extensions: DEFAULT_PETRINAUT_EXTENSIONS,
      }}
    >
      <ActiveNetContext
        value={{ activeNet, activeSubnetId: null, setActiveSubnetId: () => {} }}
      >
        <EditorContext value={{ ...editor, selectItem }}>
          <UserSettingsContext
            value={{
              ...defaultUserSettingsContextValue,
              updateSubViewSection,
              subViewPanels: {
                "transition-properties": {
                  "transition-results": { collapsed: true, height: 420 },
                },
              },
            }}
          >
            <PetrinautPresentationProvider profile={profile}>
              <CodeNavigationProvider>{children}</CodeNavigationProvider>
            </PetrinautPresentationProvider>
          </UserSettingsContext>
        </EditorContext>
      </ActiveNetContext>
    </SDCPNContext>
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("opens the matching property section and preserves its saved size", () => {
  const { result } = renderHook(useCodeNavigation, { wrapper: Harness });
  const kernel = result.current.entries.find(
    (entry) => entry.label === "Transition kernel",
  );
  expect(kernel).toBeDefined();
  if (kernel) act(() => result.current.open(kernel.path));
  expect(selectItem).toHaveBeenCalledWith(kernel?.selection);
  expect(updateSubViewSection).toHaveBeenCalledWith(
    "transition-properties",
    "transition-results",
    { collapsed: false, height: 420 },
  );
});

it("does not navigate to unavailable functions or reveal code in a preview", () => {
  const { result } = renderHook(useCodeNavigation, {
    wrapper: ({ children }) => <Harness profile="preview">{children}</Harness>,
  });
  const entry = result.current.entries.at(0);
  expect(entry).toBeDefined();
  if (entry) act(() => result.current.open(entry.path));
  act(() => result.current.open("missing"));
  expect(selectItem).not.toHaveBeenCalled();
  expect(updateSubViewSection).not.toHaveBeenCalled();
});
