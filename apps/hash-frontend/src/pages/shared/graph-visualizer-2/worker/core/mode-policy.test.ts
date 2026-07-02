import { describe, expect, it } from "vitest";

import { defaultVizConfig } from "../../config";
import { nextVizMode } from "./mode-policy";

// Thresholds under test (from defaultVizConfig): flat exits above 250,
// re-enters below 200; community exits above 5000, re-enters below 4000.
const config = defaultVizConfig;

describe("nextVizMode", () => {
  it("keeps flat-force up to its exit threshold", () => {
    expect(nextVizMode("flat-force", config.flatLayoutExitNodes, config)).toBe(
      "flat-force",
    );
  });

  it("promotes flat-force to community-force just past the exit threshold", () => {
    expect(
      nextVizMode("flat-force", config.flatLayoutExitNodes + 1, config),
    ).toBe("community-force");
  });

  it("jumps flat-force straight to hierarchical-lod when the count clears both thresholds", () => {
    expect(
      nextVizMode("flat-force", config.communityColorExitNodes + 1, config),
    ).toBe("hierarchical-lod");
  });

  it("promotes community-force to hierarchical-lod just past its exit threshold", () => {
    expect(
      nextVizMode(
        "community-force",
        config.communityColorExitNodes + 1,
        config,
      ),
    ).toBe("hierarchical-lod");
    expect(
      nextVizMode("community-force", config.communityColorExitNodes, config),
    ).toBe("community-force");
  });

  it("demotes community-force to flat-force only below the re-entry threshold", () => {
    expect(
      nextVizMode("community-force", config.flatLayoutMaxNodes - 1, config),
    ).toBe("flat-force");
    expect(
      nextVizMode("community-force", config.flatLayoutMaxNodes, config),
    ).toBe("community-force");
  });

  it("demotes hierarchical-lod to community-force only below the re-entry threshold", () => {
    expect(
      nextVizMode(
        "hierarchical-lod",
        config.communityColorMaxNodes - 1,
        config,
      ),
    ).toBe("community-force");
    expect(
      nextVizMode("hierarchical-lod", config.communityColorMaxNodes, config),
    ).toBe("hierarchical-lod");
  });

  it("is hysteretic: both regimes are stable inside the flat boundary band", () => {
    for (
      let nodeCount = config.flatLayoutMaxNodes;
      nodeCount <= config.flatLayoutExitNodes;
      nodeCount++
    ) {
      expect(nextVizMode("flat-force", nodeCount, config)).toBe("flat-force");
      expect(nextVizMode("community-force", nodeCount, config)).toBe(
        "community-force",
      );
    }
  });

  it("is hysteretic: both regimes are stable inside the community boundary band", () => {
    for (
      let nodeCount = config.communityColorMaxNodes;
      nodeCount <= config.communityColorExitNodes;
      nodeCount += 100
    ) {
      expect(nextVizMode("community-force", nodeCount, config)).toBe(
        "community-force",
      );
      expect(nextVizMode("hierarchical-lod", nodeCount, config)).toBe(
        "hierarchical-lod",
      );
    }
  });
});
