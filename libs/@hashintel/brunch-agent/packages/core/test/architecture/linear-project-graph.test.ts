import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

import { CONTEXT_ROOT, contextRootPresent } from "./context-root";

/**
 * The module under test lives at the context root, outside every workspace, so
 * CI's pruned checkout lacks it. The specifier is computed so `lint:tsc` does
 * not resolve it statically; the structural types below restate the contract
 * the tests exercise.
 */
const SCRIPT_MODULE_URL = pathToFileURL(
  join(CONTEXT_ROOT, "scripts/linear-project-graph.ts"),
).href;

interface ProjectIssue {
  readonly identifier: string;
  readonly title: string;
  readonly stateName: string;
  readonly parentIdentifier?: string;
  readonly assigneeName?: string;
  readonly assignedToViewer: boolean;
  readonly external: boolean;
}

interface ProjectGraph {
  readonly projectName: string;
  readonly viewerName: string;
  readonly includeClosed: boolean;
  readonly issues: readonly ProjectIssue[];
  readonly hardEdges: readonly { readonly from: string; readonly to: string }[];
}

interface LinearProjectGraphModule {
  readonly renderProjectGraph: (graph: ProjectGraph) => string;
  readonly readProjectIssuePage: (value: unknown) => ProjectIssuePage;
  readonly fetchProjectGraph: (
    projectName: string,
    includeClosed: boolean,
    queryPage: (projectName: string, after: string | null) => ProjectIssuePage,
  ) => ProjectGraph;
  readonly parseArguments: (arguments_: readonly string[]) => {
    readonly projectName: string;
    readonly includeClosed: boolean;
    readonly help: boolean;
  };
}

interface ProjectIssuePage {
  readonly projectName: string;
  readonly viewer: { readonly id: string; readonly name: string };
  readonly issues: readonly LinearIssueRecord[];
  readonly hasNextPage: boolean;
  readonly endCursor: string | null;
}

interface LinearIssueRecord {
  readonly identifier: string;
  readonly title: string;
  readonly state: { readonly name: string; readonly type: string };
  readonly project: { readonly name: string } | null;
  readonly assignee?: { readonly id: string; readonly name: string } | null;
  readonly parent: { readonly identifier: string } | null;
  readonly relations: {
    readonly pageInfo: { readonly hasNextPage: boolean };
    readonly nodes: readonly [];
  };
  readonly inverseRelations: {
    readonly pageInfo: { readonly hasNextPage: boolean };
    readonly nodes: readonly [];
  };
}

const issue = (
  identifier: string,
  assignee: LinearIssueRecord["assignee"],
  type = "started",
): LinearIssueRecord => ({
  identifier,
  title: identifier,
  state: { name: type === "completed" ? "Done" : "In progress", type },
  project: { name: "brunch-agent" },
  assignee,
  parent: null,
  relations: { pageInfo: { hasNextPage: false }, nodes: [] },
  inverseRelations: { pageInfo: { hasNextPage: false }, nodes: [] },
});

const response = (
  viewer: unknown,
  issues: readonly LinearIssueRecord[] = [],
) => ({
  data: {
    viewer,
    projects: {
      nodes: [
        {
          name: "brunch-agent",
          issues: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: issues,
          },
        },
      ],
    },
  },
});

async function loadRenderProjectGraph(): Promise<
  LinearProjectGraphModule["renderProjectGraph"]
> {
  const module = (await import(SCRIPT_MODULE_URL)) as LinearProjectGraphModule;
  return module.renderProjectGraph;
}

describe.skipIf(!contextRootPresent)("the compact Linear project graph", () => {
  test("parses viewer identity separately from its display name", async () => {
    const { readProjectIssuePage } = (await import(
      SCRIPT_MODULE_URL
    )) as LinearProjectGraphModule;
    const page = readProjectIssuePage(
      response({ id: "viewer-id", name: "Same Display Name" }, [
        issue("FE-1", { id: "other-id", name: "Same Display Name" }),
      ]),
    );
    expect(page.viewer).toEqual({ id: "viewer-id", name: "Same Display Name" });
  });

  test.each([undefined, null, {}, { id: "", name: "Lu" }])(
    "rejects missing or malformed viewer: %j",
    async (viewer) => {
      const { readProjectIssuePage } = (await import(
        SCRIPT_MODULE_URL
      )) as LinearProjectGraphModule;
      expect(() => readProjectIssuePage(response(viewer))).toThrow(
        "missing or malformed authenticated viewer",
      );
    },
  );

  test("classifies viewer, wrong, unassigned, null, and absent assignees by ID", async () => {
    const { readProjectIssuePage, fetchProjectGraph } = (await import(
      SCRIPT_MODULE_URL
    )) as LinearProjectGraphModule;
    const parsed = readProjectIssuePage(
      response({ id: "viewer-id", name: "Lu" }, [
        issue("FE-1", { id: "viewer-id", name: "Lu" }),
        issue("FE-2", { id: "other-id", name: "Other" }),
        issue("FE-3", null),
        issue("FE-4", undefined),
      ]),
    );
    const graph = fetchProjectGraph("brunch-agent", false, () => parsed);
    expect(
      graph.issues.map(({ identifier, assignedToViewer, assigneeName }) => ({
        identifier,
        assignedToViewer,
        assigneeName,
      })),
    ).toEqual([
      { identifier: "FE-1", assignedToViewer: true, assigneeName: "Lu" },
      { identifier: "FE-2", assignedToViewer: false, assigneeName: "Other" },
      { identifier: "FE-3", assignedToViewer: false, assigneeName: undefined },
      { identifier: "FE-4", assignedToViewer: false, assigneeName: undefined },
    ]);
  });

  test("accumulates two pages and passes the returned cursor", async () => {
    const { fetchProjectGraph } = (await import(
      SCRIPT_MODULE_URL
    )) as LinearProjectGraphModule;
    const calls: Array<string | null> = [];
    const pages: ProjectIssuePage[] = [
      {
        projectName: "brunch-agent",
        viewer: { id: "viewer-id", name: "Lu" },
        issues: [issue("FE-1", { id: "viewer-id", name: "Lu" })],
        hasNextPage: true,
        endCursor: "next-page",
      },
      {
        projectName: "brunch-agent",
        viewer: { id: "viewer-id", name: "Lu" },
        issues: [issue("FE-2", { id: "viewer-id", name: "Lu" })],
        hasNextPage: false,
        endCursor: null,
      },
    ];
    const graph = fetchProjectGraph(
      "brunch-agent",
      false,
      (_project, after) => {
        calls.push(after);
        return pages[calls.length - 1]!;
      },
    );
    expect(calls).toEqual([null, "next-page"]);
    expect(graph.issues.map(({ identifier }) => identifier)).toEqual([
      "FE-1",
      "FE-2",
    ]);
  });

  test("defaults to open issues and --all includes closed issues", async () => {
    const { fetchProjectGraph, parseArguments, renderProjectGraph } =
      (await import(SCRIPT_MODULE_URL)) as LinearProjectGraphModule;
    const page: ProjectIssuePage = {
      projectName: "brunch-agent",
      viewer: { id: "viewer-id", name: "Lu" },
      issues: [
        issue("FE-1", { id: "viewer-id", name: "Lu" }),
        issue("FE-2", { id: "viewer-id", name: "Lu" }, "completed"),
      ],
      hasNextPage: false,
      endCursor: null,
    };
    expect(parseArguments([]).includeClosed).toBe(false);
    expect(parseArguments(["--all"]).includeClosed).toBe(true);
    const openGraph = fetchProjectGraph("brunch-agent", false, () => page);
    const allGraph = fetchProjectGraph("brunch-agent", true, () => page);
    expect(openGraph.issues).toHaveLength(1);
    expect(allGraph.issues).toHaveLength(2);
    expect(renderProjectGraph(openGraph)).toContain(
      "project brunch-agent open=1",
    );
    expect(renderProjectGraph(allGraph)).toContain(
      "project brunch-agent issues=2",
    );
  });

  test("renders hard-dependency layers with enough issue context for agent inference", async () => {
    const renderProjectGraph = await loadRenderProjectGraph();
    const graph: ProjectGraph = {
      projectName: "brunch-agent",
      viewerName: "Lu Nelson",
      includeClosed: false,
      issues: [
        {
          identifier: "FE-100",
          title: "Build the transport",
          stateName: "In progress",
          parentIdentifier: "FE-1",
          assignedToViewer: true,
          external: false,
        },
        {
          identifier: "FE-101",
          title: "Return client tools",
          stateName: "Todo",
          parentIdentifier: "FE-1",
          assigneeName: "Another Owner",
          assignedToViewer: false,
          external: false,
        },
        {
          identifier: "FE-102",
          title: "Add private sessions",
          stateName: "Todo",
          assignedToViewer: true,
          external: false,
        },
        {
          identifier: "FE-103",
          title: "Ship the integration",
          stateName: "Todo",
          parentIdentifier: "FE-1",
          assignedToViewer: true,
          external: false,
        },
      ],
      hardEdges: [
        { from: "FE-100", to: "FE-101" },
        { from: "FE-100", to: "FE-102" },
        { from: "FE-101", to: "FE-103" },
      ],
    };

    expect(renderProjectGraph(graph))
      .toBe(`project brunch-agent open=4 hard=3 assignee-mismatches=1
viewer: Lu Nelson
legend: L=hard-dependency layer; p=parent; a=assignee; <=blocked by; =>blocks; *=outside project
L0 FE-100 [In progress p:FE-1 a:self] =>FE-101,FE-102 | Build the transport
L1 FE-101 [Todo p:FE-1 a:Another Owner] <=FE-100 =>FE-103 | Return client tools
L1 FE-102 [Todo root a:self] <=FE-100 | Add private sessions
L2 FE-103 [Todo p:FE-1 a:self] <=FE-101 | Ship the integration
cycles: none`);
  });

  test("makes a hard-dependency cycle explicit instead of inventing an order", async () => {
    const renderProjectGraph = await loadRenderProjectGraph();
    const graph: ProjectGraph = {
      projectName: "brunch-agent",
      viewerName: "Lu Nelson",
      includeClosed: false,
      issues: [
        {
          identifier: "FE-100",
          title: "First issue",
          stateName: "Todo",
          assignedToViewer: true,
          external: false,
        },
        {
          identifier: "FE-101",
          title: "Second issue",
          stateName: "Todo",
          assignedToViewer: false,
          external: true,
        },
      ],
      hardEdges: [
        { from: "FE-100", to: "FE-101" },
        { from: "FE-101", to: "FE-100" },
      ],
    };

    expect(renderProjectGraph(graph)).toContain(
      "L? FE-101 [Todo root *] <=FE-100 =>FE-100 | Second issue",
    );
    expect(renderProjectGraph(graph)).toContain("cycles: FE-100,FE-101");
  });
});
