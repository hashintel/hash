// @vitest-environment jsdom

import { ThemeProvider } from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import EntitiesPage from "./entities.page";
import { EntitiesVisualizer } from "./shared/entities-visualizer";

const state = vi.hoisted(() => ({
  flags: { pages: true, dashboards: true, documents: true, canvases: true },
  pagesAreEnabled: true,
  router: {
    asPath: "/pages",
    pathname: "/entities",
    isReady: true,
    query: {
      entityTypeIdOrBaseUrl: "https://hash.ai/@h/types/entity-type/page/",
    },
    push: vi.fn(),
  },
}));

vi.mock("next/router", () => ({ useRouter: () => state.router }));
vi.mock("next-seo", () => ({ NextSeo: () => null }));
vi.mock("../components/hooks/use-account-pages", () => ({
  useAccountPages: () => ({ lastRootPageIndex: null }),
}));
vi.mock("../components/hooks/use-create-page", () => ({
  useCreatePage: () => [vi.fn()],
}));
vi.mock("../components/hooks/use-hash-instance", () => ({
  useHashInstance: () => ({ hashInstance: { properties: state } }),
}));
vi.mock("../shared/entity-types-context/hooks", () => ({
  useLatestEntityTypesOptional: () => ({
    latestEntityTypes: [
      {
        schema: {
          $id: systemEntityTypes.page.entityTypeId,
          title: "Page",
          titlePlural: "Pages",
        },
      },
    ],
  }),
}));
vi.mock(
  "../shared/entity-types-context/hooks/use-entity-types-context-required",
  () => ({
    useEntityTypesContextRequired: () => ({ isSpecialEntityTypeLookup: null }),
  }),
);
vi.mock("../shared/use-user-permissions-on-entity-type", () => ({
  useUserPermissionsOnEntityType: () => ({
    userPermissions: { instantiate: true },
    loading: false,
  }),
}));
vi.mock("../shared/layout", () => ({ getLayoutWithSidebar: () => null }));
vi.mock("./entities.page/create-dashboard", () => ({
  CreateDashboard: () => null,
}));
vi.mock("./shared/entities-visualizer", () => ({
  EntitiesVisualizer: vi.fn(() => null),
}));
vi.mock("./shared/top-context-bar", () => ({ TopContextBar: () => null }));
vi.mock("./shared/use-enabled-feature-flags", () => ({
  useEnabledFeatureFlags: () => state.flags,
}));
vi.mock("./shared/workspace-context", () => ({
  useActiveWorkspace: () => ({
    activeWorkspaceWebId: "00000000-0000-4000-8000-000000000001",
    activeWorkspace: { shortname: "alice" },
  }),
}));

const renderPage = () =>
  render(
    <ThemeProvider theme={theme}>
      <EntitiesPage />
    </ThemeProvider>,
  );

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  state.flags.pages = true;
  state.flags.dashboards = true;
  state.pagesAreEnabled = true;
  state.router.asPath = "/pages";
});

test.each([
  {
    pages: true,
    dashboards: true,
    pagesAreEnabled: true,
    expected: ["page", "dashboard"],
  },
  {
    pages: false,
    dashboards: true,
    pagesAreEnabled: true,
    expected: ["dashboard"],
  },
  {
    pages: true,
    dashboards: true,
    pagesAreEnabled: false,
    expected: ["dashboard"],
  },
  { pages: true, dashboards: false, pagesAreEnabled: true, expected: ["page"] },
])("lists only enabled page types: %j", ({ expected, ...flags }) => {
  Object.assign(state.flags, flags);
  state.pagesAreEnabled = flags.pagesAreEnabled;
  renderPage();

  expect(vi.mocked(EntitiesVisualizer).mock.lastCall?.[0]).toMatchObject({
    entityTypeBaseUrl: undefined,
    entityTypeId: undefined,
    entityTypeBaseUrls: expected.map(
      (kind) =>
        systemEntityTypes[kind as "page" | "dashboard"].entityTypeBaseUrl,
    ),
    isViewingPages: true,
  });
});

test.each([false, true])(
  "does not query all entities when no page type is enabled (pages flag: %s)",
  (pages) => {
    state.flags.pages = pages;
    state.flags.dashboards = false;
    state.pagesAreEnabled = false;
    renderPage();
    expect(EntitiesVisualizer).not.toHaveBeenCalled();
    expect(screen.getByText("No pages to display.")).toBeTruthy();
  },
);

test("keeps ordinary Page entity lists pinned to their requested type", () => {
  state.router.asPath =
    "/entities?entityTypeIdOrBaseUrl=https://hash.ai/@h/types/entity-type/page/";
  renderPage();
  expect(vi.mocked(EntitiesVisualizer).mock.lastCall?.[0]).toMatchObject({
    entityTypeBaseUrl: systemEntityTypes.page.entityTypeBaseUrl,
    entityTypeBaseUrls: undefined,
    isViewingPages: false,
  });
});
