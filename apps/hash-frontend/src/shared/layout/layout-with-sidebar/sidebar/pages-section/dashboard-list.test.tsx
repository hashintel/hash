// @vitest-environment jsdom

import { MockedProvider } from "@apollo/client/testing";
import { ThemeProvider } from "@mui/material";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import { querySidebarDashboardsQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { DashboardList } from "./dashboard-list";

import type { MockedResponse } from "@apollo/client/testing";
import type { WebId } from "@blockprotocol/type-system";
import type { ComponentProps } from "react";

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
vi.mock("../../../../ui", () => ({
  Link: ({ href, children, "aria-current": current }: ComponentProps<"a">) => (
    <a href={href} aria-current={current}>
      {children}
    </a>
  ),
}));
vi.mock("../../../../ui/button", () => ({
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
vi.mock("@hashintel/design-system", async () => {
  const mui = await import("@mui/material");
  return { FontAwesomeIcon: () => null, TextField: mui.TextField };
});

const webId = "00000000-0000-4000-8000-000000000001" as WebId;
const nameUrl =
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/";
const dashboard = (id: string, title: unknown) => {
  // Tests add and remove properties, so the fixture is not limited to the name.
  const properties: Record<string, unknown> = { [nameUrl]: title };

  return {
    metadata: { recordId: { entityId: `${webId}~${id}` } },
    properties,
  };
};
const listResult = (roots: ReturnType<typeof dashboard>[]) => ({
  data: { queryEntitySubgraph: { roots } },
});
const renderList = (mocks: MockedResponse[]) =>
  render(
    <MockedProvider mocks={mocks}>
      <ThemeProvider theme={theme}>
        <DashboardList webId={webId} />
      </ThemeProvider>
    </MockedProvider>,
  );
afterEach(() => {
  cleanup();
  router.push.mockClear();
});

test("requests only current-workspace, unarchived dashboards without chart traversals", async () => {
  const variables = vi.fn(() => true);
  renderList([
    {
      request: { query: querySidebarDashboardsQuery },
      variableMatcher: variables,
      result: listResult([
        dashboard("dashboard-z", "Zulu"),
        dashboard("dashboard-a", "Alpha"),
      ]),
    },
  ]);
  await screen.findByRole("link", { name: "Alpha" });
  expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "Alpha",
    "Zulu",
  ]);
  expect(
    screen.getByRole("link", { name: "Alpha" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(variables).toHaveBeenCalledWith(
    expect.objectContaining({
      request: expect.objectContaining({
        filter: {
          all: expect.arrayContaining([
            { equal: [{ path: ["webId"] }, { parameter: webId }] },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ]),
        },
        graphResolveDepths: { inheritsFrom: 0, isOfType: false },
        includeDrafts: false,
      }),
    }),
  );
});

test("offers a retry after a failed dashboard request", async () => {
  renderList([
    {
      request: { query: querySidebarDashboardsQuery },
      variableMatcher: () => true,
      error: new Error("Offline"),
    },
    {
      request: { query: querySidebarDashboardsQuery },
      variableMatcher: () => true,
      result: listResult([dashboard("dashboard-a", "Recovered")]),
    },
  ]);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: "Recovered" });
  expect(screen.queryByRole("alert")).toBeNull();
});

test.each([false, true])(
  "uses the canonical dashboard name despite a colliding custom property (with sibling: %s)",
  async (withSibling) => {
    const entity = dashboard("dashboard-a", "Alpha");
    entity.properties["https://example.com/types/property-type/name/"] = {
      nested: "Custom name",
    };

    renderList([
      {
        request: { query: querySidebarDashboardsQuery },
        variableMatcher: () => true,
        result: listResult([
          ...(withSibling ? [dashboard("dashboard-z", "Zulu")] : []),
          entity,
        ]),
      },
    ]);

    await screen.findByRole("link", { name: "Alpha" });
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      withSibling ? ["Alpha", "Zulu"] : ["Alpha"],
    );
    expect(
      screen.getByRole("link", { name: "Alpha" }).getAttribute("href"),
    ).toBe("/dashboard/dashboard-a");
  },
);

test.each([
  { label: "missing", name: undefined },
  { label: "null", name: null },
  { label: "object", name: { nested: "Name" } },
  { label: "array", name: ["Name"] },
  { label: "number", name: 42 },
  { label: "boolean", name: true },
])(
  "keeps valid dashboard links usable when another name is $label",
  async ({ name: invalidName }) => {
    const malformed = dashboard("dashboard-invalid", invalidName);
    if (invalidName === undefined) {
      delete malformed.properties[nameUrl];
    }
    malformed.properties["https://example.com/types/property-type/name/"] =
      "Custom title";

    renderList([
      {
        request: { query: querySidebarDashboardsQuery },
        variableMatcher: () => true,
        result: listResult([
          dashboard("dashboard-z", "Zulu"),
          malformed,
          dashboard("dashboard-a", "Alpha"),
        ]),
      },
    ]);

    await screen.findByRole("link", { name: "Alpha" });
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["Alpha", "Zulu"],
    );
    expect(screen.queryByRole("alert")).toBeNull();
  },
);
