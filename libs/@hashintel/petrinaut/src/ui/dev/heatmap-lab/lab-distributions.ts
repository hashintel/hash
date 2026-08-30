/**
 * Deterministic synthetic distributions for the heatmap lab, chosen to
 * exercise the renderer's failure modes: heavy tails that saturate an
 * alpha ramp, near-point spikes that alias, bimodal splits (an epidemic's
 * die-out-or-take-off), and run counts from 8 to 100 000.
 */
import type { DistributionColumn } from "./density-grid";

export type LabDistributionId =
  | "sir-wave"
  | "bimodal-split"
  | "heavy-tail"
  | "narrow-spike"
  | "uniform-wide"
  | "drifting-noise";

export const LAB_DISTRIBUTION_IDS: readonly LabDistributionId[] = [
  "sir-wave",
  "bimodal-split",
  "heavy-tail",
  "narrow-spike",
  "uniform-wide",
  "drifting-noise",
];

/** Deterministic pseudo-random fraction in [0, 1) per (a, b, c). */
function noise(a: number, b: number, c: number): number {
  const raw =
    Math.sin((a + 1) * 374.761 + (b + 1) * 668.265 + (c + 1) * 941.183) *
    43_758.545;
  return raw - Math.floor(raw);
}

/** Approximate a normal draw from three uniform ones (Irwin–Hall). */
function normalish(a: number, b: number, c: number): number {
  return noise(a, b, 0) + noise(a, b, c + 7) + noise(a, b, c + 13) - 1.5;
}

type ColumnShape = {
  /** Mixture components: center, sigma, and share of the runs. */
  modes: readonly { center: number; sigma: number; share: number }[];
};

function shapeAt(id: LabDistributionId, t: number): ColumnShape {
  switch (id) {
    case "sir-wave": {
      const peak = 210 * Math.exp(-(((t - 0.38) / 0.24) ** 2));
      return {
        modes: [{ center: 10 + peak, sigma: 4 + peak * 0.06, share: 1 }],
      };
    }
    case "bimodal-split": {
      // Die-out mass near zero, outbreak mass rising away from it.
      const outbreak = 20 + 180 * Math.min(1, t * 1.6);
      return {
        modes: [
          { center: 2, sigma: 1.5, share: 0.35 },
          { center: outbreak, sigma: 6 + outbreak * 0.08, share: 0.65 },
        ],
      };
    }
    case "heavy-tail": {
      // A dense floor with a long upward tail: the alpha-saturation case.
      const floor = 15 + 10 * t;
      return {
        modes: [
          { center: floor, sigma: 2, share: 0.8 },
          { center: floor * 4, sigma: floor * 1.6, share: 0.2 },
        ],
      };
    }
    case "narrow-spike": {
      // Near-deterministic trajectory: one or two rows of mass.
      return {
        modes: [{ center: 40 + 25 * Math.sin(t * 6), sigma: 0.6, share: 1 }],
      };
    }
    case "uniform-wide":
      return { modes: [{ center: 100, sigma: 55, share: 1 }] };
    case "drifting-noise": {
      const drift = 30 + 140 * t;
      return {
        modes: [
          { center: drift, sigma: 12, share: 0.7 },
          { center: drift * 0.5, sigma: 20, share: 0.3 },
        ],
      };
    }
  }
}

/**
 * Sampled histogram columns for `id`: `frames` columns, each binning `runs`
 * draws from the column's mixture into integer values ≥ 0.
 */
export function labDistribution(
  id: LabDistributionId,
  frames: number,
  runs: number,
): DistributionColumn[] {
  return Array.from({ length: frames }, (_, frame) => {
    const shape = shapeAt(id, frames <= 1 ? 0 : frame / (frames - 1));
    const counts = new Map<number, number>();
    // Draw a bounded sample and scale counts up, so 100 000 runs costs the
    // same to generate as 2 000 while keeping integer frequencies.
    const sampled = Math.min(runs, 2_000);
    const scale = runs / sampled;
    for (let draw = 0; draw < sampled; draw++) {
      const pick = noise(frame, draw, 1);
      let cumulative = 0;
      let mode = shape.modes[0]!;
      for (const candidate of shape.modes) {
        cumulative += candidate.share;
        if (pick <= cumulative) {
          mode = candidate;
          break;
        }
      }
      const value = Math.max(
        0,
        Math.round(mode.center + normalish(frame, draw, 3) * 2 * mode.sigma),
      );
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const bins = [...counts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([value, count]) => [value, Math.round(count * scale)] as const);
    return { time: frame, bins };
  });
}
