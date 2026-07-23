//! Exhaustive ULP verification for the vendored transcendental kernels.
//!
//! Each sweep runs every `f32` bit pattern in a kernel's non-trivial domain (the region the
//! backstop clamps do not decide) against an `f64` libm reference, threaded across all cores. The
//! tests are ignored by default; run them explicitly in release mode, where the full set takes
//! tens of seconds:
//!
//! ```text
//! cargo test --release -p hash-graph-atlas --features bench ulp_sweep -- --ignored --nocapture
//! ```
//!
//! An `f64` reference carries far more precision than one `f32` ULP, so it measures the `f32`
//! kernels exactly. It cannot certify `exp_f64` to sub-ULP; that kernel's overflow classes are
//! pinned exhaustively in [`sleef`](super::sleef)'s tests and its distance bound rides the strided
//! sweep there.
#![expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::float_cmp,
    reason = "measurement code: the casts are the measurement's narrowing steps, and the exact \
              float comparison is the correctly-rounded check itself"
)]

use core::simd::prelude::*;
use std::thread;

use super::{
    exp_table,
    sleef::{exp_f32, exp2_f32, log2_f32},
};

const LANES: usize = 8;

/// Error statistics accumulated over one sweep.
#[derive(Clone, Copy, Default)]
struct Accumulator {
    max_ulp: f64,
    worst_argument: u32,
    total: u64,
    not_correctly_rounded: u64,
    above_one_ulp: u64,
    above_two_ulp: u64,
    misclassified: u64,
}

impl Accumulator {
    fn merge(&mut self, other: &Self) {
        if other.max_ulp > self.max_ulp {
            self.max_ulp = other.max_ulp;
            self.worst_argument = other.worst_argument;
        }
        self.total += other.total;
        self.not_correctly_rounded += other.not_correctly_rounded;
        self.above_one_ulp += other.above_one_ulp;
        self.above_two_ulp += other.above_two_ulp;
        self.misclassified += other.misclassified;
    }

    fn record(&mut self, bits: u32, kernel: f32, reference: f64) {
        self.total += 1;
        if reference.is_nan() {
            self.misclassified += u64::from(!kernel.is_nan());
            return;
        }
        let rounded = reference as f32;
        if rounded.is_infinite() {
            // The reference overflows f32: the kernel must agree exactly.
            self.misclassified += u64::from(kernel != rounded);
            return;
        }
        if kernel.is_infinite() {
            self.misclassified += 1;
            return;
        }
        let error = (f64::from(kernel) - reference).abs() / ulp32_at(reference);
        self.not_correctly_rounded += u64::from(kernel != rounded);
        self.above_one_ulp += u64::from(error > 1.0);
        self.above_two_ulp += u64::from(error > 2.0);
        if error > self.max_ulp {
            self.max_ulp = error;
            self.worst_argument = bits;
        }
    }

    fn report(&self, name: &str) {
        println!(
            "{name}: n={}  max={:.4} ulp at x={:?} ({:#010x})  not-correctly-rounded={} ({:.3}%)  \
             >1ulp={}  >2ulp={}  misclassified={}",
            self.total,
            self.max_ulp,
            f32::from_bits(self.worst_argument),
            self.worst_argument,
            self.not_correctly_rounded,
            100.0 * self.not_correctly_rounded as f64 / self.total.max(1) as f64,
            self.above_one_ulp,
            self.above_two_ulp,
            self.misclassified,
        );
    }
}

/// Spacing of `f32` at the magnitude of `reference`.
///
/// For `|reference| = m · 2^e` with `m ∈ [1, 2)`, one ULP is `2^(e - 23)`, clamped to the
/// subnormal spacing `2^-149` below the normal range.
fn ulp32_at(reference: f64) -> f64 {
    let magnitude = reference.abs();
    if magnitude < f64::from(f32::MIN_POSITIVE) {
        return 2_f64.powi(-149);
    }
    let exponent = ((magnitude.to_bits() >> 52) & 0x7FF) as i32 - 1023;
    2_f64.powi(exponent - 23)
}

/// Sweeps every bit pattern in each inclusive range through `kernel`, lane-wise against
/// `reference`, spread across all cores.
fn sweep(
    ranges: &[(u32, u32)],
    kernel: fn(Simd<f32, LANES>) -> Simd<f32, LANES>,
    reference: fn(f64) -> f64,
) -> Accumulator {
    let threads = thread::available_parallelism().map_or(8, usize::from) as u64;
    let mut accumulated = Accumulator::default();
    for &(low, high) in ranges {
        let length = u64::from(high) - u64::from(low) + 1;
        let chunk = length.div_ceil(threads);
        let partials = thread::scope(|scope| {
            #[expect(
                clippy::needless_collect,
                reason = "collecting spawns every worker before the first join; the suggested \
                          lazy iterator would run them one at a time"
            )]
            let handles: Vec<_> = (0..threads)
                .map(|thread_index| {
                    let start = u64::from(low) + thread_index * chunk;
                    let end = (start + chunk).min(u64::from(high) + 1);
                    scope.spawn(move || {
                        let mut local = Accumulator::default();
                        let mut bits = start;
                        while bits < end {
                            let mut lane_bits = [0_u32; LANES];
                            for (offset, slot) in lane_bits.iter_mut().enumerate() {
                                *slot = (bits + offset as u64).min(end - 1) as u32;
                            }
                            let input = Simd::from_array(lane_bits.map(f32::from_bits));
                            let output = kernel(input).to_array();
                            let live = ((end - bits) as usize).min(LANES);
                            for lane in 0..live {
                                let argument = f64::from(f32::from_bits(lane_bits[lane]));
                                local.record(lane_bits[lane], output[lane], reference(argument));
                            }
                            bits += LANES as u64;
                        }
                        local
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().expect("sweep worker panicked"))
                .collect::<Vec<_>>()
        });
        for partial in &partials {
            accumulated.merge(partial);
        }
    }
    accumulated
}

#[test]
#[ignore = "exhaustive: ~2.2e9 inputs; run in release mode"]
fn exp_f32_is_faithfully_rounded_over_its_domain() {
    let accumulated = sweep(
        &[
            (1, 110_f32.to_bits()),              // (0, 110]
            (0x8000_0001, (-110_f32).to_bits()), // [-110, 0)
            (0, 0),                              // +0
            (0x8000_0000, 0x8000_0000),          // -0
        ],
        exp_f32::<LANES>,
        f64::exp,
    );
    accumulated.report("exp_f32");
    assert_eq!(accumulated.misclassified, 0);
    assert!(
        accumulated.max_ulp < 1.0,
        "faithful rounding expected, got {} ulp",
        accumulated.max_ulp
    );
}

#[test]
#[ignore = "exhaustive: ~2.2e9 inputs; run in release mode"]
fn exp_f32_table_is_faithfully_rounded_over_its_domain() {
    let accumulated = sweep(
        &[
            (1, 110_f32.to_bits()),
            (0x8000_0001, (-110_f32).to_bits()),
            (0, 0),
            (0x8000_0000, 0x8000_0000),
        ],
        exp_table::exp_f32::<LANES>,
        f64::exp,
    );
    accumulated.report("exp_f32_table");
    assert_eq!(accumulated.misclassified, 0);
    assert!(
        accumulated.max_ulp < 1.0,
        "faithful rounding expected, got {} ulp",
        accumulated.max_ulp
    );
}

#[cfg(all(target_arch = "aarch64", target_endian = "little"))]
#[test]
#[ignore = "exhaustive: ~2.2e9 inputs; run in release mode"]
fn exp_f32_table_tbl4_form_is_faithfully_rounded_over_its_domain() {
    let accumulated = sweep(
        &[
            (1, 110_f32.to_bits()),
            (0x8000_0001, (-110_f32).to_bits()),
            (0, 0),
            (0x8000_0000, 0x8000_0000),
        ],
        exp_table::exp_f32x8,
        f64::exp,
    );
    accumulated.report("exp_f32_table_tbl4");
    assert_eq!(accumulated.misclassified, 0);
    assert!(
        accumulated.max_ulp < 1.0,
        "faithful rounding expected, got {} ulp",
        accumulated.max_ulp
    );
}

#[test]
#[ignore = "exhaustive: ~2.3e9 inputs; run in release mode"]
fn exp2_f32_is_faithfully_rounded_over_its_domain() {
    let accumulated = sweep(
        &[
            (1, 160_f32.to_bits()),
            (0x8000_0001, (-160_f32).to_bits()),
            (0, 0),
        ],
        exp2_f32::<LANES>,
        f64::exp2,
    );
    accumulated.report("exp2_f32");
    assert_eq!(accumulated.misclassified, 0);
    assert!(
        accumulated.max_ulp < 1.0,
        "faithful rounding expected, got {} ulp",
        accumulated.max_ulp
    );
}

#[test]
#[ignore = "exhaustive: all 2.1e9 finite positive inputs; run in release mode"]
fn log2_f32_stays_inside_its_tier_over_all_positive_inputs() {
    let accumulated = sweep(
        &[(1, 0x7F7F_FFFF)], // minimum subnormal ..= f32::MAX
        log2_f32::<LANES>,
        f64::log2,
    );
    accumulated.report("log2_f32");
    assert_eq!(accumulated.misclassified, 0);
    assert!(
        accumulated.max_ulp < 3.5,
        "u35 tier expected, got {} ulp",
        accumulated.max_ulp
    );
}
