/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import { defaultPanelSizes } from "./panel-sizes";
import { usePanelSizes } from "./panel-sizes-context";
import { PanelSizesProvider } from "./panel-sizes-provider";
import { UserSettingsContext } from "./user-settings-context";

afterEach(cleanup);

it("starts the sizes from the saved settings", () => {
  const settings = {
    ...renderHook(() => use(UserSettingsContext)).result.current,
    leftSidebarWidth: 300,
    propertiesPanelWidth: 520,
    bottomPanelHeight: 240,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UserSettingsContext value={settings}>
      <PanelSizesProvider>{children}</PanelSizesProvider>
    </UserSettingsContext>
  );

  const sizes = renderHook(() => usePanelSizes(), { wrapper }).result.current;

  expect(sizes.leftSidebarWidth.get()).toBe(300);
  expect(sizes.propertiesPanelWidth.get()).toBe(520);
  expect(sizes.bottomPanelHeight.get()).toBe(240);
  expect(sizes.aiAssistantWidth.get()).toBe(defaultPanelSizes.aiAssistantWidth);
});
