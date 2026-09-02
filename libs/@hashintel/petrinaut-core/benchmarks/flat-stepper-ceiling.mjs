/**
 * Measures the achievable ceiling for the SIR Monte Carlo workload in plain JS:
 * a flat, allocation-free, structure-of-arrays stepper equivalent to what a
 * codegen backend (JS or WASM) would emit for the same net.
 *
 * Mirrors the semantics of the current engine for this net:
 *  - 3 uncoloured places (S, I, R), 2 transitions (infection, recovery)
 *  - per transition per frame: one RNG draw, exp(-lambda * timeSinceLastFiring)
 *    acceptance test, structural enablement on input arc weights
 *  - infection: S-1, I+1 (consumes 1 S + 1 I, emits 2 I)
 *  - recovery:  I-1, R+1
 *  - deadlock when no transition is structurally enabled
 */
import { performance } from "node:perf_hooks";

const RUNS = 4000;
const DT = 0.1;
const MAX_TIME = 60;
const MAX_FRAMES = Math.round(MAX_TIME / DT);
const INFECTION_RATE = 0.4;
const RECOVERY_RATE = 0.1;

const S0 = 500;
const I0 = 5;

// ---- Structure of arrays: one lane per run, no per-run objects. -------------
const s = new Int32Array(RUNS).fill(S0);
const i = new Int32Array(RUNS).fill(I0);
const r = new Int32Array(RUNS);
// Elapsed frames since last firing, per transition per run.
const elapsed0 = new Int32Array(RUNS);
const elapsed1 = new Int32Array(RUNS);
const rng = new Uint32Array(RUNS);
const frameNumber = new Int32Array(RUNS);
const active = new Uint8Array(RUNS).fill(1);

for (let run = 0; run < RUNS; run++) {
  rng[run] = (42 + run * 2654435761) >>> 0;
}

// mulberry32-style step, matching the shape of the engine's seeded RNG:
// one u32 state, one float out.
const start = performance.now();

let advancedTotal = 0;
let activeCount = RUNS;

for (let frame = 0; frame < MAX_FRAMES && activeCount > 0; frame++) {
  for (let run = 0; run < RUNS; run++) {
    if (active[run] === 0) {
      continue;
    }

    const sv = s[run];
    const iv = i[run];

    // Deadlock check: infection needs S>=1 && I>=1, recovery needs I>=1.
    if (iv === 0) {
      active[run] = 0;
      activeCount--;
      continue;
    }

    let state = rng[run];
    let fired0 = 0;
    let fired1 = 0;

    // --- transition 0: infection (S>=1, I>=1) ---
    if (sv >= 1 && iv >= 1) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      const lambda = INFECTION_RATE * (elapsed0[run] * DT);
      if (Math.exp(-lambda) <= u) {
        fired0 = 1;
      }
    }

    // --- transition 1: recovery (I>=1) ---
    if (iv >= 1) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      const lambda = RECOVERY_RATE * (elapsed1[run] * DT);
      if (Math.exp(-lambda) <= u) {
        fired1 = 1;
      }
    }

    rng[run] = state;

    if (fired0 === 1) {
      s[run] = sv - 1;
      i[run] = iv + 1;
      elapsed0[run] = 0;
    } else {
      elapsed0[run]++;
    }

    if (fired1 === 1) {
      i[run] = i[run] - 1;
      r[run] = r[run] + 1;
      elapsed1[run] = 0;
    } else {
      elapsed1[run]++;
    }

    frameNumber[run]++;
    advancedTotal++;

    if (frameNumber[run] >= MAX_FRAMES) {
      active[run] = 0;
      activeCount--;
    }
  }
}

const ms = performance.now() - start;
process.stdout.write(
  `flat SoA stepper: ${ms.toFixed(0)} ms, ${advancedTotal} run-frames, ${(
    (ms / advancedTotal) *
    1e6
  ).toFixed(0)} ns/run-frame\n`,
);

let sumR = 0;
for (let run = 0; run < RUNS; run++) {
  sumR += r[run];
}
process.stdout.write(`mean recovered: ${(sumR / RUNS).toFixed(1)}\n`);
