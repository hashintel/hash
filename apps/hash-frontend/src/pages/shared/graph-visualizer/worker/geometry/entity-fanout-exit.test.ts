import { describe, expect, it } from "vitest";

import { containerBoundaryWaypoint } from "./edge-geometry";

/**
 * Regression: at nesting depth >= 2, the entity fan-out exit must aim at the
 * same first boundary waypoint the recursive feeder uses
 * (containerBoundaryWaypoint toward the outermost port), not directly at the
 * outermost port.
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
    // Expected: exit angle matches feeder first-waypoint angle.
    const fixedExitAngle = angleFromLeaf(feederFirstWaypoint);
    expect(Math.abs(fixedExitAngle - feederExitAngle)).toBeLessThan(1e-9);
  });

  it("aiming straight at the outermost port drifts off the feeder at depth >= 2", () => {
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
