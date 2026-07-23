//! Wall-time benchmarks for the restricted-view backfill walk variants.
//!
//! The two candidate-selection variants share one response shape and differ in cost structure
//! alone: the independent walk visits one extent, the chained walk re-derives every ancestor
//! delivery first. The decision between them is a number - per-tile selection time as the zoom
//! deepens - so this target produces exactly that curve.
//!
//! Before the timed groups, one report prints the full sweep: both variants across mask shape
//! (independent rows hidden versus whole spatial blocks), visible fraction, and zoom along the
//! fixture's densest descent path, with scan counts, per-tile medians, and the independent
//! variant's re-delivery census (the crowding the chained variant exists to remove). The timed
//! groups then pin the decision points: both variants at the root and at the deepest zoom under
//! the adversarial mask.
//!
//! The corpus defaults to 300,000 points so a sweep stays in seconds; set
//! `ATLAS_BACKFILL_POINTS` for other scales. Wall time depends on the host: compare numbers
//! within one machine, not across.
#![expect(
    clippy::print_stdout,
    clippy::float_arithmetic,
    clippy::significant_drop_tightening,
    reason = "the sweep is a calibration report beside the timings, its arithmetic is wall-clock \
              bookkeeping, and Criterion owns group drops"
)]

use core::hint::black_box;
use std::time::Instant;

use codspeed_criterion_compat::{Criterion, criterion_group, criterion_main};
use hash_graph_atlas::bench::lod::WalkBench;

/// The corpus scale a default sweep runs at.
const DEFAULT_POINTS: usize = 300_000;

/// The fixture seed: equal seeds reproduce the corpus, the masks, and the path.
const SEED: u64 = 0x0BAC_F111;

/// Median-of-five timing repetitions per sweep cell.
const REPETITIONS: usize = 5;

/// The median sample's index once the five sort.
const MEDIAN: usize = 2;

fn points() -> usize {
    std::env::var("ATLAS_BACKFILL_POINTS").map_or(DEFAULT_POINTS, |value| {
        value
            .parse()
            .expect("ATLAS_BACKFILL_POINTS should be a point count")
    })
}

/// Returns the median wall time of [`REPETITIONS`] runs, in microseconds.
fn median_micros(mut run: impl FnMut()) -> f64 {
    let mut samples = [0.0_f64; REPETITIONS];
    for sample in &mut samples {
        let start = Instant::now();
        run();
        *sample = start.elapsed().as_secs_f64() * 1e6;
    }
    samples.sort_by(f64::total_cmp);
    samples[MEDIAN]
}

/// Prints the sweep: variants across mask shape, visible fraction, and zoom.
fn sweep(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!(
        "backfill walk sweep: {} points, deepest zoom {}, densest-descent path of {} tiles",
        bench.points(),
        bench.max_zoom(),
        path.len(),
    );
    println!(
        "{:<10} {:>8} {:>4} {:>10} {:>12} {:>12} {:>12} {:>12} {:>10} {:>12}",
        "mask",
        "visible",
        "z",
        "budget",
        "indep us",
        "chain us",
        "indep scan",
        "chain scan",
        "dupes",
        "delivered",
    );

    for clustered in [false, true] {
        for visible in [0.5, 0.1, 0.01] {
            if clustered {
                bench.mask_clustered(visible, SEED);
            } else {
                bench.mask_uniform(visible, SEED);
            }

            for &(z, x, y) in path {
                if !z.is_multiple_of(3) {
                    continue;
                }

                let independent = bench.independent(z, x, y);
                let chained = bench.chained(z, x, y);
                let crowding = bench.crowding(z, x, y);
                let independent_micros = median_micros(|| {
                    black_box(bench.independent(black_box(z), black_box(x), black_box(y)));
                });
                let chained_micros = median_micros(|| {
                    black_box(bench.chained(black_box(z), black_box(x), black_box(y)));
                });

                println!(
                    "{:<10} {:>8} {:>4} {:>10} {:>12.1} {:>12.1} {:>12} {:>12} {:>10} {:>12}",
                    if clustered { "clustered" } else { "uniform" },
                    format!("{:.0}%", visible * 100.0),
                    z,
                    independent.budget,
                    independent_micros,
                    chained_micros,
                    independent.scanned,
                    chained.scanned,
                    crowding.duplicates,
                    crowding.delivered,
                );
            }
        }
    }
}

fn benches(criterion: &mut Criterion) {
    let mut bench = WalkBench::build(points(), SEED);
    let path = bench.descent();
    let &(deep_z, deep_x, deep_y) = path.last().expect("the descent path holds the root");

    sweep(&mut bench, &path);

    // The decision points: both variants at the root and at the deepest zoom, under the
    // adversarial mask.
    bench.mask_clustered(0.01, SEED);
    let mut group = criterion.benchmark_group("backfill_walk");
    group.sample_size(10);
    group.bench_function("independent/root", |bencher| {
        bencher.iter(|| black_box(bench.independent(0, 0, 0)));
    });
    group.bench_function("chained/root", |bencher| {
        bencher.iter(|| black_box(bench.chained(0, 0, 0)));
    });
    group.bench_function("independent/deepest", |bencher| {
        bencher.iter(|| black_box(bench.independent(deep_z, deep_x, deep_y)));
    });
    group.bench_function("chained/deepest", |bencher| {
        bencher.iter(|| black_box(bench.chained(deep_z, deep_x, deep_y)));
    });
    group.finish();
}

criterion_group!(walk, benches);
criterion_main!(walk);
