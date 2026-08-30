/**
 * Fixed WGSL support code shared by every generated shader.
 *
 * Kept separate from the generated body so it can be snapshot-tested once and
 * read as ordinary WGSL rather than as template-string fragments.
 */

/**
 * Counter-based RNG.
 *
 * The CPU engine's generator (`../simulation/engine/seeded-rng.ts`) is an
 * exact 31-bit LCG since FE-1499 and could be reproduced in WGSL bit for
 * bit. This backend deliberately uses PCG instead — a stronger generator,
 * and keeping the streams distinct makes cross-backend comparisons
 * statistical by construction rather than accidentally seed-coupled.
 *
 * The consequence must be stated wherever backends are compared: the GPU
 * backend does not reproduce CPU trajectories seed for seed, by choice.
 */
export const WGSL_RNG = `
// PCG-RXS-M-XS, 32-bit state and output.
fn rng_next_u32(rng: ptr<function, u32>) -> u32 {
  let previous = *rng;
  *rng = previous * 747796405u + 2891336453u;
  let word = ((previous >> ((previous >> 28u) + 4u)) ^ previous) * 277803737u;
  return (word >> 22u) ^ word;
}

// Uniform in [0, 1). Dividing a 24-bit mantissa keeps every result exactly
// representable in f32, which a full 32-bit divide would not.
fn rng_next_f32(rng: ptr<function, u32>) -> f32 {
  return f32(rng_next_u32(rng) >> 8u) * 5.9604645e-8;
}

// Seeds one stream per (run, replicate) pair. Mixing with a large odd constant
// and one PCG advance decorrelates adjacent run indices, which sequential
// seeding alone would leave visibly correlated in the first few draws.
fn rng_seed(base: u32, run_index: u32) -> u32 {
  var seeded = base ^ (run_index * 2654435761u);
  seeded = seeded * 747796405u + 2891336453u;
  return seeded;
}
`;

/**
 * Gaussian sampling.
 *
 * Box–Muller rather than the Ziggurat method: it needs no lookup tables (which
 * would cost a storage binding and a memory round-trip per sample) and its two
 * transcendental calls are cheap on a GPU. One of the two normals it produces is
 * discarded, which is the usual trade for not carrying spare state per token.
 */
export const WGSL_DISTRIBUTIONS = `
fn sample_gaussian(rng: ptr<function, u32>, mean: f32, deviation: f32) -> f32 {
  // Guard the log against exactly zero, which rng_next_f32 can return.
  let u1 = max(rng_next_f32(rng), 1.0e-7);
  let u2 = rng_next_f32(rng);
  return mean + deviation * sqrt(-2.0 * log(u1)) * cos(6.2831853071795862 * u2);
}

fn sample_uniform(rng: ptr<function, u32>, low: f32, high: f32) -> f32 {
  return low + (high - low) * rng_next_f32(rng);
}

fn sample_lognormal(rng: ptr<function, u32>, mean: f32, deviation: f32) -> f32 {
  return exp(sample_gaussian(rng, mean, deviation));
}
`;

/**
 * Firing acceptance test, matching the CPU engine's rule.
 *
 * The CPU path compares `exp(-lambda * dt) > u` and skips when true
 * (`../simulation/monte-carlo/transition-effect.ts`), so firing happens when
 * `exp(-lambda * dt) <= u` — a memoryless per-frame Bernoulli over the time
 * step, with the draw consumed whether or not the transition fires. A
 * predicate lambda arrives as a boolean and bypasses this entirely rather
 * than going through the CPU's `Infinity` sentinel, which would be a NaN
 * hazard in f32.
 */
export const WGSL_FIRING = `
fn accepts_firing(lambda_value: f32, window_seconds: f32, u: f32) -> bool {
  let lambda_total = lambda_value * window_seconds;
  return exp(-lambda_total) <= u;
}
`;

/** Every prelude section, in dependency order. */
export function wgslPrelude(): string {
  return [WGSL_RNG, WGSL_DISTRIBUTIONS, WGSL_FIRING].join("\n");
}
