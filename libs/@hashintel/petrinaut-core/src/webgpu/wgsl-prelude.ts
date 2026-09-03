/**
 * Fixed WGSL support code shared by every generated shader.
 *
 * Kept separate from the generated body so it can be snapshot-tested once and
 * read as ordinary WGSL rather than as template-string fragments.
 */

/**
 * Counter-based RNG.
 *
 * The CPU engine's generator (`../simulation/engine/seeded-rng.ts`) cannot be
 * reproduced here: it computes `1103515245 * seed` in f64, which exceeds 2^53
 * for all but 0.4% of its seed space, so its stream is V8's rounding behaviour
 * rather than a mathematically defined LCG. Emulating that in WGSL's 32-bit
 * integers is not practical, so this backend uses PCG instead — which is also
 * a far better generator: full 2^32 period per stream against the CPU
 * generator's measured 10,466-step cycle.
 *
 * The consequence is deliberate and must be stated wherever backends are
 * compared: the GPU backend does not reproduce CPU trajectories seed for seed.
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
 * The CPU path compares `exp(-lambda * elapsed) > u` and skips when true
 * (`../simulation/monte-carlo/transition-effect.ts`), so firing happens when
 * `exp(-lambda * elapsed) <= u`. A predicate lambda arrives as a boolean and
 * bypasses this entirely rather than going through the CPU's `Infinity`
 * sentinel, which would be a NaN hazard in f32.
 */
export const WGSL_FIRING = `
fn accepts_firing(lambda_value: f32, elapsed_seconds: f32, u: f32) -> bool {
  let lambda_total = lambda_value * elapsed_seconds;
  return exp(-lambda_total) <= u;
}
`;

/** Every prelude section, in dependency order. */
export function wgslPrelude(): string {
  return [WGSL_RNG, WGSL_DISTRIBUTIONS, WGSL_FIRING].join("\n");
}
