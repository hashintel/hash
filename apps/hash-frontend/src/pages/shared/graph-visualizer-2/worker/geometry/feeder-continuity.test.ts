import { describe, expect, it } from "vitest";

import { containerBoundaryWaypoint } from "./edge-geometry";

/**
 * Recursive feeder hop continuity. `emitRecursiveBezierFeeders` draws each hop
 * (childOrContainer → next boundary) as its own curve. A hop's END is a
 * container boundary aimed at the OUTERMOST port; the next hop's START is
 * re-projected onto that container's rim aimed at ITS OWN next target. For the
 * feeder to be continuous, hop[i].end must equal hop[i+1].start on the shared
 * container rim. This test shows they agree with ONE intermediate container but
 * drift apart with TWO — the same "aimed at the wrong reference" class as the
 * entity fan-out, surfacing as a few-degree feeder kink at deep nesting.
 */
const outermostPort = { x: 200, y: 0 };

function angleAt(
  circle: { x: number; y: number },
  pt: { x: number; y: number },
): number {
  return Math.atan2(pt.y - circle.y, pt.x - circle.x);
}

describe("feeder hop continuity", () => {
  it("ONE intermediate container: incoming end == outgoing start (continuous)", () => {
    // participant inside `inner`, `inner` directly inside the outermost.
    const inner = { x: 20, y: 30, radius: 20 };

    // Incoming hop (participant → inner): ends at inner's boundary toward outer.
    const incomingEnd = containerBoundaryWaypoint(
      inner,
      outermostPort.x,
      outermostPort.y,
      0,
    );
    // Outgoing hop (inner → outermost): since inner's parent IS the outermost,
    // its target is the outermost port directly, so its start aims there too.
    const outgoingStart = containerBoundaryWaypoint(
      inner,
      outermostPort.x,
      outermostPort.y,
      0,
    );
    const driftDeg =
      (Math.abs(angleAt(inner, incomingEnd) - angleAt(inner, outgoingStart)) *
        180) /
      Math.PI;
    expect(driftDeg).toBeLessThan(1e-9);
  });

  it("TWO intermediate containers: incoming end != outgoing start (the drift)", () => {
    const outer = { x: 60, y: 10, radius: 40 }; // intermediate closer to outermost
    const inner = { x: 20, y: 30, radius: 20 }; // intermediate around the participant

    // Incoming hop (participant → inner): ends at inner's boundary toward the
    // OUTERMOST port.
    const incomingEnd = containerBoundaryWaypoint(
      inner,
      outermostPort.x,
      outermostPort.y,
      0,
    );
    // Outgoing hop (inner → outer): target is OUTER's boundary toward outermost;
    // the code re-projects the start onto inner's rim aimed at THAT (not the
    // outermost). This is the bug.
    const outerBoundary = containerBoundaryWaypoint(
      outer,
      outermostPort.x,
      outermostPort.y,
      0,
    );
    const outgoingStart = containerBoundaryWaypoint(
      inner,
      outerBoundary.x,
      outerBoundary.y,
      0,
    );

    const driftDeg =
      (Math.abs(angleAt(inner, incomingEnd) - angleAt(inner, outgoingStart)) *
        180) /
      Math.PI;
    // eslint-disable-next-line no-console
    console.log(
      `[feeder] two-intermediate hop drift = ${driftDeg.toFixed(2)}°`,
    );
    expect(driftDeg).toBeGreaterThan(2);

    // The fix: a pass-through container leaves at its boundary toward the
    // OUTERMOST port — the same point the incoming hop ended at — so the hops
    // share an endpoint again.
    const outgoingStartFixed = containerBoundaryWaypoint(
      inner,
      outermostPort.x,
      outermostPort.y,
      0,
    );
    const fixedDriftDeg =
      (Math.abs(
        angleAt(inner, incomingEnd) - angleAt(inner, outgoingStartFixed),
      ) *
        180) /
      Math.PI;
    expect(fixedDriftDeg).toBeLessThan(1e-9);
  });

  it("THREE intermediates: the fix is continuous at EVERY junction (recursive, any depth)", () => {
    // Chain inner→outer: participant → c3 → c2 → c1 → outermost. The feeder hops
    // outward, so each container's "next hop" is the next-OUTER container (and the
    // outermost intermediate hops straight to the port).
    const containers = [
      { x: 35, y: 55, radius: 18 }, // c3 (around the participant — innermost)
      { x: 60, y: 40, radius: 35 }, // c2
      { x: 120, y: 20, radius: 60 }, // c1 (closest to outermost)
    ];

    // Each container's crossing is defined ONCE, toward the outermost port.
    const crossings = containers.map((container) =>
      containerBoundaryWaypoint(container, outermostPort.x, outermostPort.y, 0),
    );

    let maxOldDrift = 0;
    for (let level = 0; level < containers.length; level++) {
      const container = containers[level]!;
      const crossing = crossings[level]!;
      // FIX: the hop ARRIVING here ends at this container's crossing (toward the
      // outermost), and the LEAVING pass-through hop aims at the outermost too —
      // the same point. So the junction is continuous at EVERY level, any depth.
      const fixedStart = containerBoundaryWaypoint(
        container,
        outermostPort.x,
        outermostPort.y,
        0,
      );
      const fixedDrift =
        (Math.abs(
          angleAt(container, crossing) - angleAt(container, fixedStart),
        ) *
          180) /
        Math.PI;
      expect(fixedDrift).toBeLessThan(1e-9);

      // OLD: the leaving hop was re-projected toward the NEXT crossing. The drift
      // is position-dependent (large at one junction, near-zero at another — the
      // "sometimes fits" effect), but present somewhere on any 2+-deep chain.
      if (level < containers.length - 1) {
        const nextCrossing = crossings[level + 1]!;
        const oldStart = containerBoundaryWaypoint(
          container,
          nextCrossing.x,
          nextCrossing.y,
          0,
        );
        const oldDrift =
          (Math.abs(
            angleAt(container, crossing) - angleAt(container, oldStart),
          ) *
            180) /
          Math.PI;
        // eslint-disable-next-line no-console
        console.log(
          `[feeder] level ${level} old drift = ${oldDrift.toFixed(2)}°`,
        );
        maxOldDrift = Math.max(maxOldDrift, oldDrift);
      }
    }
    expect(maxOldDrift).toBeGreaterThan(2);
  });
});
