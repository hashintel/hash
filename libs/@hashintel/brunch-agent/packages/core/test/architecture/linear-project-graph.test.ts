import { describe, expect, test } from "vitest";

import {
  fetchProjectGraph,
  parseArguments,
  readProjectIssuePage,
  renderProjectGraph,
  type LinearIssueRecord,
  type ProjectGraph,
  type ProjectIssuePage,
} from "../../src/linear-project-graph";

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

describe("the compact Linear project graph", () => {
  test("parses viewer identity separately from its display name", () => {
    const page = readProjectIssuePage(
      response({ id: "viewer-id", name: "Same Display Name" }, [
        issue("FE-1", { id: "other-id", name: "Same Display Name" }),
      ]),
    );
    expect(page.viewer).toEqual({ id: "viewer-id", name: "Same Display Name" });
  });

  test.each([undefined, null, {}, { id: "", name: "Lu" }])(
    "rejects missing or malformed viewer: %j",
    (viewer) => {
      expect(() => readProjectIssuePage(response(viewer))).toThrow(
        "missing or malformed authenticated viewer",
      );
    },
  );

  test("classifies viewer, wrong, unassigned, null, and absent assignees by ID", () => {
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

  test("accumulates two pages and passes the returned cursor", () => {
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

  test("defaults to open issues and --all includes closed issues", () => {
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

  test("renders hard-dependency layers with enough issue context for agent inference", () => {
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

  test("makes a hard-dependency cycle explicit instead of inventing an order", () => {
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
