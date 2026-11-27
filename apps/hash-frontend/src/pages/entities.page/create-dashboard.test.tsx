// @vitest-environment jsdom

import { MockedProvider } from "@apollo/client/testing";
import { ThemeProvider } from "@mui/material";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import {
  createEntityMutation,
  querySidebarDashboardsQuery,
} from "../../graphql/queries/knowledge/entity.queries";
import { DashboardList } from "../../shared/layout/layout-with-sidebar/sidebar/pages-section/dashboard-list";
import { CreateDashboard } from "./create-dashboard";

import type { MockedResponse } from "@apollo/client/testing";
import type { WebId } from "@blockprotocol/type-system";
import type { ComponentProps, ReactNode } from "react";

const router = vi.hoisted(() => ({
  asPath: "/dashboard/dashboard-a?tab=edit",
  push: vi.fn(),
}));
vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("@blockprotocol/graph/stdlib", () => ({
  getRoots: (subgraph: { roots: unknown[] }) => subgraph.roots,
}));
vi.mock("@local/hash-graph-sdk/entity", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deserializeQueryEntitySubgraphResponse: (subgraph: unknown) => ({ subgraph }),
}));
vi.mock("../../shared/ui", () => ({
  Link: ({ href, children, "aria-current": current }: ComponentProps<"a">) => (
    <a href={href} aria-current={current}>
      {children}
    </a>
  ),
}));
vi.mock("../../shared/ui/button", () => ({
  Button: ({ children, onClick, disabled, type }: ComponentProps<"button">) => (
    <button
      type={type === "submit" ? "submit" : "button"}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
}));
vi.mock("../../shared/ui/modal", () => ({
  Modal: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
}));
vi.mock("@hashintel/design-system", async () => {
  const mui = await import("@mui/material");
  return { FontAwesomeIcon: () => null, TextField: mui.TextField };
});

const webId = "00000000-0000-4000-8000-000000000001" as WebId;
const nameUrl =
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/";
const dashboard = (id: string, title: string) => ({
  metadata: { recordId: { entityId: `${webId}~${id}` } },
  properties: { [nameUrl]: title },
});
const listResult = (roots: ReturnType<typeof dashboard>[]) => ({
  data: { queryEntitySubgraph: { roots } },
});
const renderList = (mocks: MockedResponse[]) =>
  render(
    <MockedProvider mocks={mocks}>
      <ThemeProvider theme={theme}>
        <DashboardList webId={webId} />
        <CreateDashboard webId={webId} />
      </ThemeProvider>
    </MockedProvider>,
  );
afterEach(() => {
  cleanup();
  router.push.mockClear();
});

test("preserves a dashboard draft when creation in the selected workspace fails", async () => {
  const variables = vi.fn(() => true);
  renderList([
    {
      request: { query: querySidebarDashboardsQuery },
      variableMatcher: () => true,
      result: listResult([]),
      maxUsageCount: 2,
    },
    {
      request: { query: createEntityMutation },
      variableMatcher: variables,
      error: new Error("Offline"),
    },
  ]);
  await waitFor(() =>
    expect(
      screen.queryByRole("status", { name: "Loading dashboards" }),
    ).toBeNull(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create dashboard" }));
  const input = screen.getByRole("textbox", { name: "Dashboard title" });
  fireEvent.change(input, { target: { value: "  Team dashboard  " } });
  const form = input.closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
  await screen.findByRole("alert");
  expect((input as HTMLInputElement).value).toBe("  Team dashboard  ");
  expect(variables).toHaveBeenCalledWith(
    expect.objectContaining({
      webId,
      properties: expect.objectContaining({
        value: expect.objectContaining({
          [nameUrl]: expect.objectContaining({ value: "Team dashboard" }),
        }),
      }),
    }),
  );
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("button", { name: "Create dashboard" })
        .every((button) => !button.hasAttribute("disabled")),
    ).toBe(true),
  );
  expect(router.push).not.toHaveBeenCalled();
});

test("opens a created dashboard and refreshes the Pages list", async () => {
  const created = dashboard("dashboard-new", "Team dashboard");
  renderList([
    {
      request: { query: querySidebarDashboardsQuery },
      variableMatcher: () => true,
      result: listResult([]),
    },
    {
      request: { query: createEntityMutation },
      variableMatcher: () => true,
      result: { data: { createEntity: created } },
    },
    {
      request: { query: querySidebarDashboardsQuery },
      variableMatcher: () => true,
      result: listResult([created]),
    },
  ]);
  await waitFor(() =>
    expect(
      screen.queryByRole("status", { name: "Loading dashboards" }),
    ).toBeNull(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create dashboard" }));
  const input = screen.getByRole("textbox", { name: "Dashboard title" });
  fireEvent.change(input, { target: { value: "Team dashboard" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith("/dashboard/dashboard-new"),
  );
  await screen.findByRole("link", { name: "Team dashboard" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
