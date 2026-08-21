import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

import { CONTEXT_ROOT, contextRootPresent } from "./workspace";

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
  readonly external: boolean;
}

interface ProjectGraph {
  readonly projectName: string;
  readonly issues: readonly ProjectIssue[];
  readonly hardEdges: readonly { readonly from: string; readonly to: string }[];
}

interface LinearProjectGraphModule {
  readonly renderProjectGraph: (graph: ProjectGraph) => string;
}

async function loadRenderProjectGraph(): Promise<
  LinearProjectGraphModule["renderProjectGraph"]
> {
  const module = (await import(SCRIPT_MODULE_URL)) as LinearProjectGraphModule;
  return module.renderProjectGraph;
}

describe.skipIf(!contextRootPresent)("the compact Linear project graph", () => {
  test("renders hard-dependency layers with enough issue context for agent inference", async () => {
    const renderProjectGraph = await loadRenderProjectGraph();
    const graph: ProjectGraph = {
      projectName: "brunch-agent",
      issues: [
        {
          identifier: "FE-100",
          title: "Build the transport",
          stateName: "In progress",
          parentIdentifier: "FE-1",
          external: false,
        },
        {
          identifier: "FE-101",
          title: "Return client tools",
          stateName: "Todo",
          parentIdentifier: "FE-1",
          external: false,
        },
        {
          identifier: "FE-102",
          title: "Add private sessions",
          stateName: "Todo",
          external: false,
        },
        {
          identifier: "FE-103",
          title: "Ship the integration",
          stateName: "Todo",
          parentIdentifier: "FE-1",
          external: false,
        },
      ],
      hardEdges: [
        { from: "FE-100", to: "FE-101" },
        { from: "FE-100", to: "FE-102" },
        { from: "FE-101", to: "FE-103" },
      ],
    };

    expect(renderProjectGraph(graph)).toBe(`project brunch-agent open=4 hard=3
legend: L=hard-dependency layer; p=parent; <=blocked by; =>blocks; *=outside project
L0 FE-100 [In progress p:FE-1] =>FE-101,FE-102 | Build the transport
L1 FE-101 [Todo p:FE-1] <=FE-100 =>FE-103 | Return client tools
L1 FE-102 [Todo root] <=FE-100 | Add private sessions
L2 FE-103 [Todo p:FE-1] <=FE-101 | Ship the integration
cycles: none`);
  });

  test("makes a hard-dependency cycle explicit instead of inventing an order", async () => {
    const renderProjectGraph = await loadRenderProjectGraph();
    const graph: ProjectGraph = {
      projectName: "brunch-agent",
      issues: [
        {
          identifier: "FE-100",
          title: "First issue",
          stateName: "Todo",
          external: false,
        },
        {
          identifier: "FE-101",
          title: "Second issue",
          stateName: "Todo",
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
