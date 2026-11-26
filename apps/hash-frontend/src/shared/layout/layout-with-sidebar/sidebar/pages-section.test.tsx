// @vitest-environment jsdom

import { ThemeProvider } from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import { PagesSection } from "./pages-section";

import type { WebId } from "@blockprotocol/type-system";

const state = vi.hoisted(() => ({
  dashboards: false,
  pages: false,
  pagesAreEnabled: false,
}));
const dashboardList = vi.hoisted(() => vi.fn());
vi.mock("../../../../pages/shared/use-enabled-feature-flags", () => ({
  useEnabledFeatureFlags: () => state,
}));
vi.mock("../../../../components/hooks/use-hash-instance", () => ({
  useHashInstance: () => ({ hashInstance: { properties: state } }),
}));
vi.mock("../../../routing", () => ({ useRoutePageInfo: () => ({}) }));
vi.mock("./pages-section/dashboard-list", () => ({
  DashboardList: ({ webId }: { webId: WebId }) => {
    dashboardList(webId);
    return "Dashboard links";
  },
}));
vi.mock("./account-page-list", () => ({
  AccountPageList: () => "Block page links",
}));
const renderPages = (webId = "workspace-one") =>
  render(
    <ThemeProvider theme={theme}>
      <PagesSection webId={webId as WebId} />
    </ThemeProvider>,
  );

afterEach(cleanup);
beforeEach(() => {
  Object.assign(state, {
    dashboards: false,
    pages: false,
    pagesAreEnabled: false,
  });
  dashboardList.mockClear();
});

test("does not mount dashboard queries or show Pages when its features are disabled", () => {
  renderPages();
  expect(screen.queryByRole("region", { name: "Pages" })).toBeNull();
  expect(dashboardList).not.toHaveBeenCalled();
});

test("lists dashboards without requiring the block-page instance setting", () => {
  state.dashboards = true;
  renderPages();
  expect(screen.getByText("Dashboard links")).toBeTruthy();
  expect(screen.queryByText("Block page links")).toBeNull();
  expect(dashboardList).toHaveBeenCalledWith("workspace-one");
});

test.each([false, true])(
  "requires both the block-page flag and instance setting (%s)",
  (pagesAreEnabled) => {
    state.pages = true;
    state.pagesAreEnabled = pagesAreEnabled;
    renderPages();
    expect(Boolean(screen.queryByText("Block page links"))).toBe(
      pagesAreEnabled,
    );
    expect(dashboardList).not.toHaveBeenCalled();
  },
);

test("places both kinds of pages under one Pages heading", () => {
  Object.assign(state, {
    dashboards: true,
    pages: true,
    pagesAreEnabled: true,
  });
  renderPages("workspace-two");
  expect(screen.getAllByRole("heading", { name: "Pages" })).toHaveLength(1);
  expect(screen.getByRole("region", { name: "Pages" }).textContent).toContain(
    "Block page links",
  );
  expect(dashboardList).toHaveBeenCalledWith("workspace-two");
});
