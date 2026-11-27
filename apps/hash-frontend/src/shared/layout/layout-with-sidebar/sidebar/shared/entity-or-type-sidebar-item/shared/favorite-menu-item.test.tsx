// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { FavoriteMenuItem } from "./favorite-menu-item";

import type { PopupState } from "material-ui-popup-state/hooks";

const state = vi.hoisted(() => ({ favorites: true, updateUser: vi.fn() }));

vi.mock("../../../../../../../pages/shared/use-enabled-feature-flags", () => ({
  useEnabledFeatureFlags: () => ({ favorites: state.favorites }),
}));
vi.mock(
  "../../../../../../../components/hooks/use-update-authenticated-user",
  () => ({ useUpdateAuthenticatedUser: () => [state.updateUser] }),
);
vi.mock("../../../../../../use-user-preferences", () => ({
  useUserPreferences: () => ({ favorites: [] }),
}));
vi.mock("./sidebar-menu-item", () => ({
  SidebarMenuItem: ({
    title,
    onClick,
  }: {
    title: string;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {title}
    </button>
  ),
}));
vi.mock("@hashintel/design-system", () => ({
  StarRegularIcon: () => null,
  StarSolidIcon: () => null,
}));

const renderItem = () => {
  const popupState = { close: vi.fn() } as unknown as PopupState;
  render(
    <FavoriteMenuItem
      item={{
        type: "entityType",
        entityTypeId: "https://hash.ai/@h/types/entity-type/document/v/1",
      }}
      popupState={popupState}
    />,
  );
  return popupState;
};

afterEach(() => {
  cleanup();
  state.favorites = true;
  state.updateUser.mockClear();
});

test("offers to add a favorite when favorites are enabled", () => {
  const popupState = renderItem();

  fireEvent.click(screen.getByRole("button", { name: "Add to favorites" }));

  expect(state.updateUser).toHaveBeenCalledTimes(1);
  expect(popupState.close).toHaveBeenCalledTimes(1);
});

test("is hidden when favorites are not enabled, as the sidebar would not list them", () => {
  state.favorites = false;
  renderItem();

  expect(screen.queryByRole("button")).toBeNull();
});
