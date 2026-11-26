// @vitest-environment jsdom

import { ThemeProvider } from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import { PageSidebar } from "./sidebar";

import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import type { ComponentProps } from "react";

const state = vi.hoisted(() => ({
  path: "/",
  flags: {} as Record<FeatureFlag, boolean>,
  variant: "list",
}));

vi.mock("next/router", () => ({ useRouter: () => ({ asPath: state.path }) }));
vi.mock("../../../pages/shared/use-enabled-feature-flags", () => ({
  useEnabledFeatureFlags: () => state.flags,
}));
vi.mock("../../../pages/shared/workspace-context", () => ({
  useActiveWorkspace: () => ({ activeWorkspaceWebId: "workspace" }),
}));
vi.mock("../../use-user-preferences", () => ({
  useUserPreferences: () => ({
    favorites: [{ type: "entityType", entityTypeId: "favorite" }],
    sidebarSections: {
      entities: { variant: state.variant },
      entityTypes: { variant: state.variant },
    },
  }),
}));
vi.mock("../../draft-entities-count-context", () => ({
  useDraftEntitiesCount: () => ({ count: 2 }),
}));
vi.mock("../../notification-count-context", () => ({
  useNotificationCount: () => ({ numberOfUnreadNotifications: 3 }),
}));
vi.mock("../../invites-context", () => ({
  useInvites: () => ({ pendingInvites: [{}] }),
}));
vi.mock("./sidebar-context", () => ({
  useSidebarContext: () => ({ sidebarOpen: true, closeSidebar: vi.fn() }),
}));
vi.mock("../layout-with-header/page-header", () => ({ HEADER_HEIGHT: 60 }));
vi.mock("./sidebar/workspace-switcher", () => ({
  WorkspaceSwitcher: () => null,
}));
vi.mock("./sidebar/account-entities-list", () => ({
  AccountEntitiesList: () => null,
}));
vi.mock("./sidebar/account-entity-type-list", () => ({
  AccountEntityTypeList: () => null,
}));
vi.mock("./sidebar/favorites-list", () => ({
  FavoritesList: () => "Favorites",
}));
vi.mock("./sidebar/pages-section", () => ({ PagesSection: () => null }));
vi.mock("../../ui", () => ({
  Link: ({ children, href, "aria-current": current }: ComponentProps<"a">) => (
    <a href={href} aria-current={current}>
      {children}
    </a>
  ),
}));
vi.mock("@hashintel/design-system", async () => {
  const mui = await import("@mui/material");
  return {
    IconButton: mui.IconButton,
    FontAwesomeIcon: () => null,
    AsteriskRegularIcon: () => null,
    ShapesRegularIcon: () => null,
  };
});

const renderSidebar = () =>
  render(
    <ThemeProvider theme={theme}>
      <PageSidebar />
    </ThemeProvider>,
  );

afterEach(cleanup);
beforeEach(() => {
  state.path = "/";
  state.flags = { workers: true } as Record<FeatureFlag, boolean>;
});

test("keeps core links in order even when entity and type lists are preferred", () => {
  renderSidebar();
  expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "Home",
    "Inbox6",
    "Processes",
    "Environments",
    "Entities",
    "Types",
  ]);
  expect(
    screen.getByRole("link", { name: "Processes" }).getAttribute("href"),
  ).toBe("/flows");
  expect(
    screen.getByRole("link", { name: "Environments" }).getAttribute("href"),
  ).toBe("/processes");
  expect(screen.queryByText("Apps")).toBeNull();
  expect(screen.queryByText("Notes")).toBeNull();
  expect(screen.queryByText("Favorites")).toBeNull();
});

test("places flagged notes and favorites before the independently flagged apps", () => {
  Object.assign(state.flags, {
    notes: true,
    favorites: true,
    supplyChain: true,
  });
  renderSidebar();
  const navigation = screen.getByRole("navigation");
  const content = navigation.textContent;
  expect(content.indexOf("Notes")).toBeLessThan(content.indexOf("Favorites"));
  expect(content.indexOf("Favorites")).toBeLessThan(content.indexOf("Apps"));
  expect(
    screen.getByRole("link", { name: "Supply Chain" }).getAttribute("href"),
  ).toBe("/supply-chain");
  expect(screen.queryByText("Supplier Risk")).toBeNull();
  expect(screen.queryByText("Fleet Management")).toBeNull();
});

test.each([
  ["/entities?entityTypeIdOrBaseUrl=example", "Entities"],
  ["/@alice/entities/example", "Entities"],
  ["/types?tab=data", "Types"],
  ["/@alice/types/entity-type/example/v/1", "Types"],
  ["/processes/draft?example=example", "Environments"],
  ["/flows?filter=example", "Processes"],
])("highlights the owning section for %s", (path, label) => {
  state.path = path;
  renderSidebar();
  expect(
    screen.getByRole("link", { name: label }).getAttribute("aria-current"),
  ).toBe("page");
});

test("keeps Processes behind the workers flag", () => {
  state.flags.workers = false;
  renderSidebar();
  expect(screen.queryByRole("link", { name: "Processes" })).toBeNull();
  expect(screen.getByRole("link", { name: "Environments" })).toBeTruthy();
});
