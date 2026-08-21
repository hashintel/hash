import { describe, expect, test } from "vitest";

import {
  renderProjectGraph,
  type ProjectGraph,
} from "../../../../scripts/linear-project-graph";

describe("the compact Linear project graph", () => {
  test("renders hard-dependency layers with enough issue context for agent inference", () => {
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

  test("makes a hard-dependency cycle explicit instead of inventing an order", () => {
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
