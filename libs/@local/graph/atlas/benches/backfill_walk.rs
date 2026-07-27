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
    clippy::cast_precision_loss,
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    clippy::significant_drop_tightening,
    reason = "the sweep is a calibration report beside the timings, its arithmetic is wall-clock \
              and ratio bookkeeping over counts far below the mantissa width, its corpus scales \
              are integer fractions of one setting, and Criterion owns group drops"
)]

use core::hint::black_box;
use std::time::Instant;

use codspeed_criterion_compat::{Criterion, criterion_group, criterion_main};
use hash_graph_atlas::{
    bench::lod::{ChainAudit, FillRule, VisibleRankOrder, WalkBench},
    morton::{Depth, MortonCell},
};

/// The corpus scale a default sweep runs at.
const DEFAULT_POINTS: usize = 300_000;

/// The fixture seed: equal seeds reproduce the corpus, the masks, and the path.
const SEED: u64 = 0x0BAC_F111;

/// Median-of-five timing repetitions per sweep cell.
const REPETITIONS: usize = 5;

/// The median sample's index once the five sort.
const MEDIAN: usize = 2;

/// The visible fractions every table sweeps.
const FRACTIONS: [f64; 5] = [1.0, 0.75, 0.5, 0.25, 0.05];

/// The mask shapes every table sweeps: independent rows, then whole spatial blocks.
const SHAPES: [bool; 2] = [false, true];

/// Names one mask shape.
const fn shape_name(clustered: bool) -> &'static str {
    if clustered { "clustered" } else { "uniform" }
}

/// Names one fill rule.
const fn rule_name(rule: FillRule) -> &'static str {
    match rule {
        FillRule::Unmasked => "unmasked",
        FillRule::Coverage => "coverage",
        FillRule::Visible => "visible-scheduled",
        FillRule::CoverageCells => "coverage-cells",
    }
}

/// Replaces the mask with one sweep cell's shape and fraction.
fn remask(bench: &mut WalkBench, clustered: bool, visible: f64) {
    if clustered {
        bench.mask_clustered(visible, SEED);
    } else {
        bench.mask_uniform(visible, SEED);
    }
}

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

/// One tile's ground truth from the visible-only cascade.
#[derive(Debug, Copy, Clone)]
struct Truth {
    /// Visible points the tile's cut reaches inside the tile cell.
    covered: i64,
    /// Visible points the tile's own cut schedules inside the tile cell.
    schedule: i64,
}

/// One sweep cell's cross-check tallies against the visible-only cascade.
#[derive(Debug, Default)]
struct CrossCheck {
    /// Tiles whose cut reaches a visible point.
    live: usize,
    /// Tiles where the pyramid's covered count equals the cascade's cut-reached count.
    pyramid_agrees: usize,
    /// Tiles where the coverage target equals the visible-only scheduled count.
    target_agrees: usize,
    /// The largest excess of the coverage target over that schedule.
    target_over: i64,
    /// The largest shortfall of the coverage target under that schedule.
    target_under: i64,
    /// The shallowest zoom whose target deviates.
    first_target_gap: Option<u8>,
    /// Tiles where the chain's cumulative delivery count equals the covered count.
    count_restored: usize,
    /// Tiles where the chain's cumulative delivery count exceeds the covered count.
    count_over: usize,
    /// Tiles where the chain's cumulative delivery count falls below the covered count.
    count_under: usize,
    /// Tiles where the chain's cumulative delivery occupies every covered cell.
    cells_restored: usize,
    /// The largest count of covered cells the cumulative delivery leaves unrepresented.
    cell_deficit: i64,
    /// The shallowest zoom whose cumulative delivery misses a covered cell.
    first_cell_gap: Option<u8>,
}

impl CrossCheck {
    /// Folds one tile's audit against the ground truth.
    fn observe(&mut self, z: u8, audit: &ChainAudit, truth: Truth) {
        let covered = count(audit.covered);
        let target = count(audit.target);
        let cells = count(audit.cumulative_cells);
        let cumulative = count(audit.cumulative);

        if covered == 0 && truth.covered == 0 {
            return;
        }

        self.live += 1;
        self.pyramid_agrees += usize::from(covered == truth.covered);
        self.target_agrees += usize::from(target == truth.schedule);
        self.count_restored += usize::from(cumulative == covered);
        self.count_over += usize::from(cumulative > covered);
        self.count_under += usize::from(cumulative < covered);
        self.cells_restored += usize::from(cells == covered);

        let deviation = target - truth.schedule;
        self.target_over = self.target_over.max(deviation);
        self.target_under = self.target_under.max(-deviation);
        if deviation != 0 && self.first_target_gap.is_none() {
            self.first_target_gap = Some(z);
        }

        self.cell_deficit = self.cell_deficit.max(covered - cells);
        if cells != covered && self.first_cell_gap.is_none() {
            self.first_cell_gap = Some(z);
        }
    }
}

/// Widens a count for signed comparison.
fn count(value: usize) -> i64 {
    i64::try_from(value).expect("corpus counts fit i64")
}

/// Renders an optional zoom.
fn zoom(value: Option<u8>) -> String {
    value.map_or_else(|| "-".to_owned(), |z| z.to_string())
}

/// Returns the cross-check's tile set: every shallow tile plus the descent path and its siblings.
///
/// Zooms 0 through 3 whole put every extent of the domain in the comparison, dense and empty
/// alike; the path's cells and their children carry it into the deepest zooms.
fn audit_tiles(bench: &WalkBench, path: &[(u8, u32, u32)]) -> Vec<(u8, u32, u32)> {
    let mut tiles: Vec<(u8, u32, u32)> = Vec::new();
    for z in 0..=3_u8 {
        let side = 1_u32 << z;
        for x in 0..side {
            for y in 0..side {
                tiles.push((z, x, y));
            }
        }
    }
    for &(z, x, y) in path {
        tiles.push((z, x, y));
        if z == bench.max_zoom() {
            continue;
        }
        for quadrant in 0..4_u32 {
            tiles.push((z + 1, 2 * x + (quadrant & 1), 2 * y + (quadrant >> 1)));
        }
    }
    tiles.sort_unstable();
    tiles.dedup();

    tiles
}

/// Prints the correctness cross-check: one rule's targets against the visible-only cascade.
fn cross_check(bench: &mut WalkBench, path: &[(u8, u32, u32)], rule: FillRule) {
    println!(
        "\n{} cross-check against the visible-only cascade: {} points, {} tiles per row",
        rule_name(rule),
        bench.points(),
        path.len(),
    );
    println!(
        "{:<10} {:>7} {:>9} {:>5} {:>9} {:>10} {:>6} {:>6} {:>6} {:>8} {:>5} {:>5} {:>10} {:>7} \
         {:>6} {:>7} {:>6}",
        "mask",
        "visible",
        "vis rows",
        "live",
        "pyr=casc",
        "tgt=sched",
        "tgt>",
        "tgt<",
        "z tgt",
        "cum=cov",
        "cum>",
        "cum<",
        "cells=cov",
        "missing",
        "z cell",
        "cascade",
        "ranks",
    );

    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            let cascade = bench.visible_cascade(VisibleRankOrder::Base);
            let reversed = bench.visible_cascade(VisibleRankOrder::Reversed);

            let mut check = CrossCheck::default();
            let mut ranks_agree = true;
            for &(z, x, y) in path {
                let audit = bench.audit(rule, z, x, y, &pyramid);
                ranks_agree &= reversed.schedule(z, x, y) == cascade.schedule(z, x, y)
                    && reversed.covered(z, x, y) == cascade.covered(z, x, y);
                check.observe(
                    z,
                    &audit,
                    Truth {
                        covered: count(cascade.covered(z, x, y)),
                        schedule: count(cascade.schedule(z, x, y)),
                    },
                );
            }

            println!(
                "{:<10} {:>7} {:>9} {:>5} {:>9} {:>10} {:>6} {:>6} {:>6} {:>8} {:>5} {:>5} {:>10} \
                 {:>7} {:>6} {:>7} {:>6}",
                shape_name(clustered),
                format!("{:.0}%", visible * 100.0),
                bench.visible_rows(),
                check.live,
                check.pyramid_agrees,
                check.target_agrees,
                check.target_over,
                check.target_under,
                zoom(check.first_target_gap),
                check.count_restored,
                check.count_over,
                check.count_under,
                check.cells_restored,
                check.cell_deficit,
                zoom(check.first_cell_gap),
                if cascade.coverage_holds() {
                    "ok"
                } else {
                    "GAP"
                },
                if ranks_agree { "equal" } else { "DIFFER" },
            );
        }
    }
}

/// The fill rules, in target order: today's, the proposal, the rejected floor, the cell repair.
const RULES: [FillRule; 4] = [
    FillRule::Unmasked,
    FillRule::Coverage,
    FillRule::Visible,
    FillRule::CoverageCells,
];

/// Returns the cell at one tile coordinate.
const fn cell_of(z: u8, x: u32, y: u32) -> MortonCell {
    MortonCell::new(
        Depth::new(z).expect("tile zooms lie within the key width"),
        x,
        y,
    )
    .expect("the coordinate lies on the zoom's grid")
}

/// Prints the density delta: the three fill targets and what each one delivers.
fn density(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!(
        "\ndensity delta, three fill targets side by side: {} points",
        bench.points(),
    );
    println!(
        "{:<10} {:>7} {:>3} {:>8} {:>8} {:>7} {:>8} {:>8} {:>7} {:>8} {:>8} {:>8} {:>7} {:>8} \
         {:>8} {:>7}",
        "mask",
        "visible",
        "z",
        "unmasked",
        "coverage",
        "visible",
        "del unm",
        "del cov",
        "del vis",
        "covered",
        "cum unm",
        "cum cov",
        "cum vis",
        "cell unm",
        "cell cov",
        "cell vis",
    );

    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();

            for &(z, x, y) in path {
                if !z.is_multiple_of(3) {
                    continue;
                }
                let audits = RULES.map(|rule| bench.audit(rule, z, x, y, &pyramid));
                let [unmasked, coverage, floor, _] = &audits;

                println!(
                    "{:<10} {:>7} {:>3} {:>8} {:>8} {:>7} {:>8} {:>8} {:>7} {:>8} {:>8} {:>8} \
                     {:>7} {:>8} {:>8} {:>7}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    z,
                    unmasked.target,
                    coverage.target,
                    floor.target,
                    unmasked.delivered,
                    coverage.delivered,
                    floor.delivered,
                    coverage.covered,
                    unmasked.cumulative,
                    coverage.cumulative,
                    floor.cumulative,
                    unmasked.cumulative_cells,
                    coverage.cumulative_cells,
                    floor.cumulative_cells,
                );
            }
        }
    }
}

/// Prints per-tile selection cost: the chained variant against the coverage variant.
fn selection_cost(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!(
        "\nper-tile selection cost, median of {REPETITIONS}: {} points",
        bench.points(),
    );
    println!(
        "{:<10} {:>7} {:>3} {:>9} {:>9} {:>9} {:>9} {:>11} {:>11} {:>11}",
        "mask",
        "visible",
        "z",
        "chain us",
        "unm us",
        "cov us",
        "cell us",
        "chain scan",
        "cov scan",
        "cell scan",
    );

    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();

            for &(z, x, y) in path {
                if !z.is_multiple_of(3) {
                    continue;
                }
                let chained = bench.chained(z, x, y);
                let coverage = bench.deliver(FillRule::Coverage, z, x, y, &pyramid);
                let cells = bench.deliver(FillRule::CoverageCells, z, x, y, &pyramid);

                let chained_micros = median_micros(|| {
                    black_box(bench.chained(black_box(z), black_box(x), black_box(y)));
                });
                let unmasked_micros = median_micros(|| {
                    black_box(bench.deliver(
                        FillRule::Unmasked,
                        black_box(z),
                        black_box(x),
                        black_box(y),
                        &pyramid,
                    ));
                });
                let coverage_micros = median_micros(|| {
                    black_box(bench.deliver(
                        FillRule::Coverage,
                        black_box(z),
                        black_box(x),
                        black_box(y),
                        &pyramid,
                    ));
                });
                let cells_micros = median_micros(|| {
                    black_box(bench.deliver(
                        FillRule::CoverageCells,
                        black_box(z),
                        black_box(x),
                        black_box(y),
                        &pyramid,
                    ));
                });

                println!(
                    "{:<10} {:>7} {:>3} {:>9.1} {:>9.1} {:>9.1} {:>9.1} {:>11} {:>11} {:>11}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    z,
                    chained_micros,
                    unmasked_micros,
                    coverage_micros,
                    cells_micros,
                    chained.scanned,
                    coverage.scanned,
                    cells.scanned,
                );
            }
        }
    }
}

/// Prints the density summary: cumulative delivery inside the path's cells under each rule.
fn density_summary(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!(
        "\ndensity summary over the {} path tiles, cumulative delivery inside each tile cell",
        path.len(),
    );
    println!(
        "{:<10} {:>7} {:>9} {:>9} {:>9} {:>9} {:>9} {:>7} {:>7} {:>7} {:>9} {:>9}",
        "mask",
        "visible",
        "covered",
        "cum unm",
        "cum cov",
        "cum vis",
        "cum cell",
        "cov/unm",
        "vis/unm",
        "cell/unm",
        "cells cov",
        "cells vis",
    );

    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();

            let mut totals = [0_usize; 8];
            for &(z, x, y) in path {
                let audits = RULES.map(|rule| bench.audit(rule, z, x, y, &pyramid));
                totals[0] += audits[1].covered;
                totals[1] += audits[0].cumulative;
                totals[2] += audits[1].cumulative;
                totals[3] += audits[2].cumulative;
                totals[4] += audits[3].cumulative;
                totals[5] += audits[1].cumulative_cells;
                totals[6] += audits[2].cumulative_cells;
                totals[7] += audits[3].cumulative_cells;
            }

            println!(
                "{:<10} {:>7} {:>9} {:>9} {:>9} {:>9} {:>9} {:>7.3} {:>7.3} {:>7.3} {:>9} {:>9}",
                shape_name(clustered),
                format!("{:.0}%", visible * 100.0),
                totals[0],
                totals[1],
                totals[2],
                totals[3],
                totals[4],
                totals[2] as f64 / totals[1] as f64,
                totals[3] as f64 / totals[1] as f64,
                totals[4] as f64 / totals[1] as f64,
                totals[5],
                totals[6],
            );
        }
    }
}

/// Prints the saturation census: how often each rule's chain runs short.
fn saturation(bench: &mut WalkBench, tiles: &[(u8, u32, u32)]) {
    println!(
        "\nsaturation census over {} tiles: chains ending below their target",
        tiles.len(),
    );
    println!(
        "{:<10} {:>7} {:>6} {:>8} {:>8} {:>8} {:>9} {:>9} {:>9} {:>9} {:>8}",
        "mask",
        "visible",
        "live",
        "dry unm",
        "dry cov",
        "dry vis",
        "dry cell",
        "spent unm",
        "spent cov",
        "spent cell",
        "zero cov",
    );

    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();

            let mut live = 0_usize;
            let mut counts = [0_usize; 8];
            for &(z, x, y) in tiles {
                let audits = RULES.map(|rule| bench.audit(rule, z, x, y, &pyramid));
                if audits[1].covered == 0 {
                    continue;
                }
                live += 1;
                counts[0] += usize::from(audits[0].dry);
                counts[1] += usize::from(audits[1].dry);
                counts[2] += usize::from(audits[2].dry);
                counts[3] += usize::from(audits[3].dry);
                counts[4] += usize::from(audits[0].spent);
                counts[5] += usize::from(audits[1].spent);
                counts[6] += usize::from(audits[3].spent);
                counts[7] += usize::from(audits[1].inherited > audits[1].covered);
            }

            println!(
                "{:<10} {:>7} {:>6} {:>8} {:>8} {:>8} {:>9} {:>9} {:>9} {:>9} {:>8}",
                shape_name(clustered),
                format!("{:.0}%", visible * 100.0),
                live,
                counts[0],
                counts[1],
                counts[2],
                counts[3],
                counts[4],
                counts[5],
                counts[6],
                counts[7],
            );
        }
    }
}

/// Prints the pyramid's per-depth occupancy at one corpus scale.
fn pyramid_profile(bench: &mut WalkBench) {
    println!(
        "\npyramid occupancy per depth: {} points, {} levels",
        bench.points(),
        usize::from(bench.max_zoom()) + 1,
    );
    print!("{:<10} {:>7} {:>9}", "mask", "visible", "vis rows");
    let depths: Vec<Depth> = bench.pyramid().depths().into_iter().collect();
    for depth in &depths {
        print!(" {:>7}", format!("d{}", depth.get()));
    }
    println!(" {:>10}", "bytes");

    for clustered in SHAPES {
        for visible in [1.0, 0.25, 0.05] {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            print!(
                "{:<10} {:>7} {:>9}",
                shape_name(clustered),
                format!("{:.0}%", visible * 100.0),
                bench.visible_rows(),
            );
            for &depth in &depths {
                print!(" {:>7}", pyramid.occupied(depth));
            }
            println!(" {:>10}", pyramid.footprint());
        }
    }
}

/// Prints pyramid construction cost and footprint across corpus scales and mask shapes.
fn pyramid_cost(scales: &[usize]) {
    println!("\npyramid construction, median of {REPETITIONS}");
    println!(
        "{:>10} {:<10} {:>7} {:>10} {:>12} {:>12} {:>10} {:>10} {:>10} {:>10} {:>12}",
        "points",
        "mask",
        "visible",
        "vis rows",
        "build us",
        "cells",
        "bytes",
        "b/vis row",
        "cells top",
        "cells mid",
        "cascade us",
    );

    for &scale in scales {
        let mut bench = WalkBench::build(scale, SEED);
        for clustered in SHAPES {
            for visible in [1.0, 0.25] {
                remask(&mut bench, clustered, visible);
                let pyramid = bench.pyramid();
                let cells: usize = pyramid
                    .depths()
                    .into_iter()
                    .map(|depth| pyramid.occupied(depth))
                    .sum();
                let build_micros = median_micros(|| {
                    black_box(bench.pyramid());
                });
                let cascade_micros = median_micros(|| {
                    black_box(bench.visible_cascade(VisibleRankOrder::Base));
                });
                let shallowest =
                    Depth::new(bench.span()).expect("the span lies within the key width");
                let middle = Depth::new(bench.span() + bench.max_zoom() / 2)
                    .expect("cut depths lie within the key width");

                println!(
                    "{:>10} {:<10} {:>7} {:>10} {:>12.1} {:>12} {:>10} {:>10.2} {:>10} {:>10} \
                     {:>12.1}",
                    scale,
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    bench.visible_rows(),
                    build_micros,
                    cells,
                    pyramid.footprint(),
                    pyramid.footprint() as f64 / bench.visible_rows() as f64,
                    pyramid.occupied(shallowest),
                    pyramid.occupied(middle),
                    cascade_micros,
                );
            }
        }
    }
}

/// Prints target query cost over a built pyramid.
fn query_cost(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    /// Queries per timed batch.
    const BATCH: usize = 10_000;

    println!(
        "\ntarget query cost over a built pyramid, median of {REPETITIONS} batches of {BATCH}"
    );
    println!(
        "{:<10} {:>7} {:>3} {:>10} {:>12} {:>12}",
        "mask", "visible", "z", "covered", "query ns", "chain ns",
    );

    for clustered in SHAPES {
        for visible in [1.0, 0.25] {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();

            for &(z, x, y) in path {
                if !z.is_multiple_of(6) {
                    continue;
                }
                let cell = cell_of(z, x, y);
                let cut =
                    Depth::new(z + bench.span()).expect("cut depths lie within the key width");
                let batch_micros = median_micros(|| {
                    for _ in 0..BATCH {
                        black_box(pyramid.count(black_box(cell), black_box(cut)));
                    }
                });

                println!(
                    "{:<10} {:>7} {:>3} {:>10} {:>12.1} {:>12.1}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    z,
                    pyramid.count(cell, cut),
                    batch_micros * 1000.0 / BATCH as f64,
                    batch_micros * 1000.0 / BATCH as f64 * f64::from(z + 1),
                );
            }
        }
    }
}

/// Prints the delivery-order comparison: coverage against the chained variant.
fn delivery_order(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!(
        "\ndelivery order, coverage against unmasked: {} points",
        bench.points()
    );
    println!(
        "{:<10} {:>7} {:>3} {:>8} {:>8} {:>8} {:>8}",
        "mask", "visible", "z", "unm len", "cov len", "prefix", "extra",
    );

    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();

            for &(z, x, y) in path {
                if !z.is_multiple_of(3) {
                    continue;
                }
                let unmasked = bench.delivery(FillRule::Unmasked, z, x, y, &pyramid);
                let coverage = bench.delivery(FillRule::Coverage, z, x, y, &pyramid);
                let shared = unmasked
                    .iter()
                    .zip(&coverage)
                    .take_while(|(left, right)| left == right)
                    .count();

                println!(
                    "{:<10} {:>7} {:>3} {:>8} {:>8} {:>8} {:>8}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    z,
                    unmasked.len(),
                    coverage.len(),
                    shared,
                    coverage.len() - shared,
                );
            }
        }
    }
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

    let tiles = audit_tiles(&bench, &path);
    cross_check(&mut bench, &tiles, FillRule::Coverage);
    cross_check(&mut bench, &tiles, FillRule::CoverageCells);
    density(&mut bench, &path);
    density_summary(&mut bench, &tiles);
    saturation(&mut bench, &tiles);
    delivery_order(&mut bench, &path);
    selection_cost(&mut bench, &path);
    query_cost(&mut bench, &path);
    pyramid_profile(&mut bench);
    pyramid_cost(&[points() / 4, points(), points() * 4]);
    sweep(&mut bench, &path);

    // The decision points: both variants at the root and at the deepest zoom, under the
    // adversarial mask.
    bench.mask_clustered(0.01, SEED);
    let pyramid = bench.pyramid();
    let mut group = criterion.benchmark_group("backfill_walk");
    group.sample_size(10);
    group.bench_function("independent/root", |bencher| {
        bencher.iter(|| black_box(bench.independent(0, 0, 0)));
    });
    group.bench_function("chained/root", |bencher| {
        bencher.iter(|| black_box(bench.chained(0, 0, 0)));
    });
    group.bench_function("coverage/root", |bencher| {
        bencher.iter(|| black_box(bench.deliver(FillRule::Coverage, 0, 0, 0, &pyramid)));
    });
    group.bench_function("coverage_cells/root", |bencher| {
        bencher.iter(|| black_box(bench.deliver(FillRule::CoverageCells, 0, 0, 0, &pyramid)));
    });
    group.bench_function("independent/deepest", |bencher| {
        bencher.iter(|| black_box(bench.independent(deep_z, deep_x, deep_y)));
    });
    group.bench_function("chained/deepest", |bencher| {
        bencher.iter(|| black_box(bench.chained(deep_z, deep_x, deep_y)));
    });
    group.bench_function("coverage/deepest", |bencher| {
        bencher.iter(|| {
            black_box(bench.deliver(FillRule::Coverage, deep_z, deep_x, deep_y, &pyramid))
        });
    });
    group.bench_function("coverage_cells/deepest", |bencher| {
        bencher.iter(|| {
            black_box(bench.deliver(FillRule::CoverageCells, deep_z, deep_x, deep_y, &pyramid))
        });
    });
    group.finish();
    drop(pyramid);
}

criterion_group!(walk, benches);
criterion_main!(walk);
