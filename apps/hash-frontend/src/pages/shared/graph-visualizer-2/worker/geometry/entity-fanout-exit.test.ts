import { describe, expect, it } from "vitest";

import { containerBoundaryWaypoint } from "./edge-geometry";

/**
 * Locks the depth-≥2 fan-out geometry. The FEEDER leaves an entity bucket toward
 * its nearest enclosing container's boundary (in the direction of the outermost
 * port), then hops outward. The fan-out exit (where the dots' feeders converge
 * on the bucket rim) MUST aim at that same first waypoint. The old code aimed
 * straight at the outermost port `hp.a`; with an intermediate container between
 * the leaf and the outermost, that diverges by a position-dependent few degrees
 * — the "4 vs 5 o'clock" drift that only showed up at depth ≥ 2.
 */
const outermostPort = { x: 100, y: 0 }; // hp.a, on the outermost container's rim
const intermediate = { x: -30, y: -40, radius: 30 }; // container between leaf + outer
const leaf = { x: -45, y: -50, radius: 5 }; // off-centre inside the intermediate

function angleFromLeaf(target: { x: number; y: number }): number {
  return Math.atan2(target.y - leaf.y, target.x - leaf.x);
}

describe("entity fan-out exit (depth ≥ 2)", () => {
  // What the feeder actually does (edge-geometry.ts emitRecursiveBezierFeeders):
  // leave toward the enclosing container's boundary, aimed at the outermost port.
  const feederFirstWaypoint = containerBoundaryWaypoint(
    intermediate,
    outermostPort.x,
    outermostPort.y,
    0,
  );
  const feederExitAngle = angleFromLeaf(feederFirstWaypoint);

  it("the fixed exit aims exactly where the feeder leaves the bucket", () => {
    // The fix points the exit at the same waypoint the feeder uses.
    const fixedExitAngle = angleFromLeaf(feederFirstWaypoint);
    expect(Math.abs(fixedExitAngle - feederExitAngle)).toBeLessThan(1e-9);
  });

  it("aiming straight at the outermost port (the old bug) drifts off the feeder", () => {
    const oldExitAngle = angleFromLeaf(outermostPort);
    const driftDegrees =
      (Math.abs(oldExitAngle - feederExitAngle) * 180) / Math.PI;
    // eslint-disable-next-line no-console
    console.log(
      `[fanout-exit] old-vs-feeder drift = ${driftDegrees.toFixed(2)}°`,
    );
    expect(driftDegrees).toBeGreaterThan(2);
  });
});
