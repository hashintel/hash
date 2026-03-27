import { describe, expect, it } from "vitest";

import {
  getNavLinkDisplayState,
  type NavLinkDefinition,
} from "./sidebar/nav-link-state";

describe("getNavLinkDisplayState", () => {
  const agentsDefinition: NavLinkDefinition = {
    title: "Agents",
    path: "/goals",
    activeIfPathMatches: /^\/@([^/]+)\/(flows|agents|workers)\//,
    children: [
      {
        title: "Goals",
        path: "/goals",
      },
      {
        title: "Flows",
        path: "/flows",
        activeIfPathMatches: /^\/@([^/]+)\/flows\//,
      },
      {
        title: "Activity Log",
        path: "/workers",
        activeIfPathMatches: /^\/@([^/]+)\/workers\//,
      },
      {
        title: "Ingest",
        path: "/ingest",
        activeIfPathMatches: /^\/ingest/,
      },
    ],
  };

  it("expands a parent section when a child route matches without highlighting the parent", () => {
    expect(
      getNavLinkDisplayState({
        definition: agentsDefinition,
        currentPath: "/ingest?runId=run-123",
      }),
    ).toEqual({
      isDirectlyActive: false,
      hasActiveChild: true,
      isExpanded: true,
      isHighlighted: false,
    });
  });

  it("highlights the matching child link", () => {
    expect(
      getNavLinkDisplayState({
        definition: agentsDefinition.children![3]!,
        currentPath: "/ingest?runId=run-123",
      }),
    ).toEqual({
      isDirectlyActive: true,
      hasActiveChild: false,
      isExpanded: true,
      isHighlighted: true,
    });
  });
});
