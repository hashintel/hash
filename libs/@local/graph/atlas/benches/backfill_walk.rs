//! Wall-time benchmarks for the restricted-view backfill walk variants.
//!
//! The independent walk and the chained walk share one response shape and differ in cost structure
//! alone. The independent walk visits one extent, while the chained walk re-derives every ancestor
//! delivery first. The decision between them is per-tile selection time as the zoom deepens, and
//! this target produces exactly that curve.
//!
//! Before the timed groups, one report prints the full sweep of both variants across mask shape
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
use std::{collections::HashSet, time::Instant};

use codspeed_criterion_compat::{Criterion, criterion_group, criterion_main};
use hash_graph_atlas::{
    bench::lod::{
        ChainAudit, DotBudget, FillRule, GenerationLayout, RefineOrder, Refinement,
        VisibleRankOrder, VisibleView, WalkBench,
    },
    morton::{Depth, MortonCell, MortonKey},
};

/// The corpus scale a default sweep runs at.
const DEFAULT_POINTS: usize = 300_000;

/// The fixture seed.
///
/// Equal seeds reproduce the corpus, the masks, and the path.
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
fn rule_name(rule: FillRule) -> String {
    match rule {
        FillRule::Unmasked => "today".to_owned(),
        FillRule::Coverage => "coverage".to_owned(),
        FillRule::Visible => "floor".to_owned(),
        FillRule::CoverageCells => "cells".to_owned(),
        FillRule::CoverageRank => "rank".to_owned(),
        FillRule::Refined(refinement) => format!(
            "r4-{}-{}",
            match refinement.budget {
                DotBudget::Constant(budget) => budget.to_string(),
                DotBudget::Scheduled => "sched".to_owned(),
            },
            order_name(refinement.order),
        ),
    }
}

/// Names one refinement order.
const fn order_name(order: RefineOrder) -> &'static str {
    match order {
        RefineOrder::Whole => "whole",
        RefineOrder::Morton => "morton",
        RefineOrder::Population => "pop",
    }
}

/// The dot budget the refinement tables run under: the cells one tile's cut grid holds.
const BUDGET: usize = 4096;

/// The public uniform-grid candidate's refinement below every tile cut.
const UNIFORM_DEPTH: u8 = 1;

/// One refinement rule under a constant budget.
const fn refined(budget: usize, order: RefineOrder) -> FillRule {
    FillRule::Refined(Refinement {
        budget: DotBudget::Constant(budget),
        order,
    })
}

/// One refinement rule budgeted by the tile's own unmasked schedule.
const fn scheduled(order: RefineOrder) -> FillRule {
    FillRule::Refined(Refinement {
        budget: DotBudget::Scheduled,
        order,
    })
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
/// alike. The path's cells and their children carry it into the deepest zooms.
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
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);
            let cascade = bench.visible_cascade(VisibleRankOrder::Base);
            let reversed = bench.visible_cascade(VisibleRankOrder::Reversed);

            let mut check = CrossCheck::default();
            let mut ranks_agree = true;
            for &(z, x, y) in path {
                let audit = bench.audit(rule, z, x, y, view);
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
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);

            for &(z, x, y) in path {
                if !z.is_multiple_of(3) {
                    continue;
                }
                let audits = RULES.map(|rule| bench.audit(rule, z, x, y, view));
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
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);

            for &(z, x, y) in path {
                if !z.is_multiple_of(3) {
                    continue;
                }
                let chained = bench.chained(z, x, y);
                let coverage = bench.deliver(FillRule::Coverage, z, x, y, view);
                let cells = bench.deliver(FillRule::CoverageCells, z, x, y, view);

                let chained_micros = median_micros(|| {
                    black_box(bench.chained(black_box(z), black_box(x), black_box(y)));
                });
                let unmasked_micros = median_micros(|| {
                    black_box(bench.deliver(
                        FillRule::Unmasked,
                        black_box(z),
                        black_box(x),
                        black_box(y),
                        view,
                    ));
                });
                let coverage_micros = median_micros(|| {
                    black_box(bench.deliver(
                        FillRule::Coverage,
                        black_box(z),
                        black_box(x),
                        black_box(y),
                        view,
                    ));
                });
                let cells_micros = median_micros(|| {
                    black_box(bench.deliver(
                        FillRule::CoverageCells,
                        black_box(z),
                        black_box(x),
                        black_box(y),
                        view,
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
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);

            let mut totals = [0_usize; 8];
            for &(z, x, y) in path {
                let audits = RULES.map(|rule| bench.audit(rule, z, x, y, view));
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
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);

            let mut live = 0_usize;
            let mut counts = [0_usize; 8];
            for &(z, x, y) in tiles {
                let audits = RULES.map(|rule| bench.audit(rule, z, x, y, view));
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

/// The rules the headline tables rank, today's first.
fn headline_rules() -> Vec<FillRule> {
    vec![
        FillRule::Unmasked,
        FillRule::Visible,
        FillRule::Coverage,
        FillRule::CoverageCells,
        FillRule::CoverageRank,
        refined(BUDGET / 4, RefineOrder::Population),
        refined(BUDGET, RefineOrder::Whole),
        refined(BUDGET, RefineOrder::Morton),
        refined(BUDGET, RefineOrder::Population),
        scheduled(RefineOrder::Population),
    ]
}

/// The budgets the ladder and the granularity tables sweep, around the cut grid's own cell count.
const BUDGETS: [usize; 4] = [BUDGET / 4, 2368, BUDGET, BUDGET * 4];

/// One rule's tallies over one sweep cell's tiles.
#[derive(Debug, Default, Copy, Clone)]
struct Tally {
    /// Tiles whose cut reaches a visible point.
    live: usize,
    /// Cut cells holding a visible point.
    covered: usize,
    /// Cut cells the cumulative delivery occupies.
    shown: usize,
    /// Cut cells holding a visible point that no delivered point occupies.
    empty: usize,
    /// The largest such count at one tile.
    worst: usize,
    /// Tiles leaving at least one such cell.
    gaps: usize,
    /// Points the chain delivers inside the tile cells.
    dots: usize,
    /// Points the tiles deliver themselves.
    delivered: usize,
    /// Tiles whose own delivery passes the budget.
    over: usize,
    /// Refinement levels summed over the tiles.
    refined: usize,
    /// Cells a partial refinement took one level further.
    deepened: usize,
}

impl Tally {
    /// Folds one tile's audit.
    fn observe(&mut self, audit: &ChainAudit) {
        if audit.covered == 0 {
            return;
        }

        let empty = audit.covered - audit.cumulative_cells;
        self.live += 1;
        self.covered += audit.covered;
        self.shown += audit.cumulative_cells;
        self.empty += empty;
        self.worst = self.worst.max(empty);
        self.gaps += usize::from(empty > 0);
        self.dots += audit.cumulative;
        self.delivered += audit.delivered;
        self.over += usize::from(audit.delivered > BUDGET);
        self.refined += usize::from(audit.refined);
        self.deepened += audit.deepened;
    }
}

/// Tallies every rule over every sweep cell.
fn tallies(
    bench: &mut WalkBench,
    tiles: &[(u8, u32, u32)],
    rules: &[FillRule],
) -> Vec<(bool, f64, Vec<Tally>)> {
    let mut rows = Vec::new();
    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);

            let mut row = Vec::with_capacity(rules.len());
            for &rule in rules {
                let mut tally = Tally::default();
                for &(z, x, y) in tiles {
                    tally.observe(&bench.audit(rule, z, x, y, view));
                }
                row.push(tally);
            }
            rows.push((clustered, visible, row));
        }
    }

    rows
}

/// Prints the headline: cut cells holding visible content that no delivered point shows.
fn falsely_empty(rules: &[FillRule], rows: &[(bool, f64, Vec<Tally>)], tiles: usize) {
    println!("\ncells falsely empty at the cut depth, over {tiles} tiles per row");
    println!(
        "{:<10} {:>7} {:<14} {:>5} {:>9} {:>9} {:>9} {:>8} {:>7} {:>7}",
        "mask",
        "visible",
        "rule",
        "live",
        "covered",
        "shown",
        "empty",
        "empty/cov",
        "worst",
        "tiles",
    );

    for &(clustered, visible, ref row) in rows {
        for (rule, tally) in rules.iter().zip(row) {
            println!(
                "{:<10} {:>7} {:<14} {:>5} {:>9} {:>9} {:>9} {:>8.4} {:>7} {:>7}",
                shape_name(clustered),
                format!("{:.0}%", visible * 100.0),
                rule_name(*rule),
                tally.live,
                tally.covered,
                tally.shown,
                tally.empty,
                tally.empty as f64 / tally.covered.max(1) as f64,
                tally.worst,
                tally.gaps,
            );
        }
    }
}

/// Prints the dot count each rule delivers, against today's.
fn dot_count(rules: &[FillRule], rows: &[(bool, f64, Vec<Tally>)], tiles: usize) {
    println!("\ndot count over {tiles} tiles per row, cumulative inside each tile cell");
    println!(
        "{:<10} {:>7} {:<14} {:>10} {:>9} {:>9} {:>10} {:>8} {:>7}",
        "mask",
        "visible",
        "rule",
        "dots",
        "of today",
        "of cover",
        "dots/cell",
        "own dots",
        "over K",
    );

    for &(clustered, visible, ref row) in rows {
        let today = row.first().map_or(1.0, |tally| tally.dots.max(1) as f64);
        for (rule, tally) in rules.iter().zip(row) {
            println!(
                "{:<10} {:>7} {:<14} {:>10} {:>9.3} {:>9.3} {:>10.3} {:>8} {:>7}",
                shape_name(clustered),
                format!("{:.0}%", visible * 100.0),
                rule_name(*rule),
                tally.dots,
                tally.dots as f64 / today,
                tally.dots as f64 / tally.covered.max(1) as f64,
                tally.dots as f64 / tally.shown.max(1) as f64,
                tally.delivered,
                tally.over,
            );
        }
    }
}

/// Prints the noninterference census: delivered rows over two corpora sharing one visible view.
///
/// Corpus B is the masked fixture. Corpus A contains the same visible rows and nothing else. A rule
/// whose delivery is a function of the visible view alone delivers equal rows over both.
fn noninterference(bench: &mut WalkBench, tiles: &[(u8, u32, u32)], rules: &[FillRule]) {
    println!(
        "\nnoninterference: delivered row identities, masked corpus against visible-only corpus, \
         {} tiles per row",
        tiles.len(),
    );
    println!(
        "{:<10} {:>7} {:<14} {:>7} {:>7} {:>8} {:>8} {:>10}",
        "mask", "visible", "rule", "tiles", "differ", "first z", "rows a", "rows b",
    );

    for clustered in SHAPES {
        for visible in [0.75, 0.5, 0.05] {
            remask(bench, clustered, visible);
            let alone = bench.visible_only();
            let (pyramid, column) = (bench.pyramid(), bench.column());
            let (alone_pyramid, alone_column) = (alone.pyramid(), alone.column());
            let view = VisibleView::new(&pyramid, &column);
            let alone_view = VisibleView::new(&alone_pyramid, &alone_column);
            assert_eq!(
                column.len(),
                alone_column.len(),
                "the two corpora hold different visible views",
            );

            for &rule in rules {
                let mut differ = 0_usize;
                let mut first = None;
                let mut widths = (0_usize, 0_usize);
                for &(z, x, y) in tiles {
                    let left = bench.rows(bench.delivery(rule, z, x, y, view));
                    let right = alone.rows(alone.delivery(rule, z, x, y, alone_view));
                    if left == right {
                        continue;
                    }
                    differ += 1;
                    if first.is_none() {
                        first = Some(z);
                        widths = (left.len(), right.len());
                    }
                }

                println!(
                    "{:<10} {:>7} {:<14} {:>7} {:>7} {:>8} {:>8} {:>10}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    rule_name(rule),
                    tiles.len(),
                    differ,
                    zoom(first),
                    widths.0,
                    widths.1,
                );
            }
        }
    }
}

/// Prints delivered count against the budget for whole-level refinement and the partial orders.
fn granularity(bench: &mut WalkBench, tiles: &[(u8, u32, u32)]) {
    println!(
        "\nrefinement granularity: delivered count against the budget, over {} tiles per row",
        tiles.len(),
    );
    println!(
        "{:<10} {:>7} {:>7} {:<8} {:>5} {:>6} {:>10} {:>9} {:>9} {:>7} {:>9} {:>7}",
        "mask",
        "visible",
        "budget",
        "order",
        "live",
        "open",
        "delivered",
        "del/K",
        "under K/4",
        "mean k",
        "deepened",
        "over K",
    );

    for clustered in SHAPES {
        for visible in [1.0, 0.75, 0.5, 0.05] {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);

            for budget in BUDGETS {
                for order in [
                    RefineOrder::Whole,
                    RefineOrder::Morton,
                    RefineOrder::Population,
                ] {
                    let rule = refined(budget, order);
                    let mut tally = Tally::default();
                    let mut ratio = 0.0_f64;
                    let mut starved = 0_usize;
                    let mut open = 0_usize;
                    let mut over = 0_usize;
                    for &(z, x, y) in tiles {
                        let audit = bench.audit(rule, z, x, y, view);
                        if audit.covered == 0 {
                            continue;
                        }
                        tally.observe(&audit);
                        over += usize::from(audit.delivered > budget);
                        // The sweep counts a tile delivering every visible point it holds as
                        // resolved, not starved: no budget buys it another dot.
                        if audit.cumulative >= column.population(cell_of(z, x, y)) {
                            continue;
                        }
                        open += 1;
                        ratio += audit.delivered as f64 / budget as f64;
                        starved += usize::from(audit.delivered * 4 < budget);
                    }

                    println!(
                        "{:<10} {:>7} {:>7} {:<8} {:>5} {:>6} {:>10} {:>9.3} {:>9.3} {:>7.2} \
                         {:>9} {:>7}",
                        shape_name(clustered),
                        format!("{:.0}%", visible * 100.0),
                        budget,
                        order_name(order),
                        tally.live,
                        open,
                        tally.delivered,
                        ratio / open.max(1) as f64,
                        starved as f64 / open.max(1) as f64,
                        tally.refined as f64 / tally.live.max(1) as f64,
                        tally.deepened,
                        over,
                    );
                }
            }
        }
    }
}

/// Prints the ladder: what refinement does to a progressive descent.
fn ladder(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!("\nthe ladder: per-zoom delivery down the densest descent path");
    println!(
        "{:<10} {:>7} {:>7} {:>3} {:>8} {:>8} {:>8} {:>8} {:>3} {:>9} {:>9} {:>8}",
        "mask",
        "visible",
        "budget",
        "z",
        "today",
        "covered",
        "rank",
        "r4 del",
        "k",
        "deepened",
        "r4 cum",
        "today cum",
    );

    for clustered in SHAPES {
        for visible in [1.0, 0.5, 0.05] {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);

            for budget in BUDGETS {
                let rule = refined(budget, RefineOrder::Population);
                for &(z, x, y) in path {
                    if !z.is_multiple_of(3) {
                        continue;
                    }
                    let today = bench.audit(FillRule::Unmasked, z, x, y, view);
                    let rank = bench.audit(FillRule::CoverageRank, z, x, y, view);
                    let audit = bench.audit(rule, z, x, y, view);

                    println!(
                        "{:<10} {:>7} {:>7} {:>3} {:>8} {:>8} {:>8} {:>8} {:>3} {:>9} {:>9} {:>8}",
                        shape_name(clustered),
                        format!("{:.0}%", visible * 100.0),
                        budget,
                        z,
                        today.delivered,
                        audit.covered,
                        rank.delivered,
                        audit.delivered,
                        audit.refined,
                        audit.deepened,
                        audit.cumulative,
                        today.cumulative,
                    );
                }
            }
        }
    }
}

/// The rules the served tables compare across both engines.
///
/// The coarse rank rule, the recommended constant budget, the cut grid's own budget, and the
/// scheduled budget that fails noninterference.
fn served_rules() -> Vec<FillRule> {
    vec![
        FillRule::CoverageRank,
        refined(BUDGET / 4, RefineOrder::Population),
        refined(BUDGET, RefineOrder::Population),
        scheduled(RefineOrder::Population),
    ]
}

/// Prints the delivery-identity census: the served engine against the scanning engine.
///
/// The scanning form is the oracle. Every later served number is void unless `differ` is zero in
/// every row: a form delivering a different sequence is a different rule.
fn served_identity(bench: &mut WalkBench, tiles: &[(u8, u32, u32)], rules: &[FillRule]) {
    println!(
        "\ndelivery identity: served engine against the scanning oracle, {} tiles per row",
        tiles.len(),
    );
    println!(
        "{:<10} {:>7} {:<14} {:>7} {:>7} {:>8} {:>9} {:>9} {:>9}",
        "mask",
        "visible",
        "rule",
        "tiles",
        "differ",
        "first z",
        "scan dots",
        "srv dots",
        "cum diff",
    );

    for clustered in SHAPES {
        for visible in [1.0, 0.5, 0.05] {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);
            let generation = bench.generation(GenerationLayout::Inline);

            for &rule in rules {
                let mut differ = 0_usize;
                let mut cumulative_differ = 0_usize;
                let mut first = None;
                let mut dots = (0_usize, 0_usize);
                for &(z, x, y) in tiles {
                    let scanned = bench.delivery(rule, z, x, y, view);
                    let served = bench.served_delivery(rule, z, x, y, &generation);
                    dots.0 += scanned.len();
                    dots.1 += served.len();
                    if scanned != served {
                        differ += 1;
                        if first.is_none() {
                            first = Some(z);
                        }
                    }
                    if bench.cumulative_delivery(rule, z, x, y, view)
                        != bench.served_cumulative_delivery(rule, z, x, y, &generation)
                    {
                        cumulative_differ += 1;
                    }
                }

                println!(
                    "{:<10} {:>7} {:<14} {:>7} {:>7} {:>8} {:>9} {:>9} {:>9}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    rule_name(rule),
                    tiles.len(),
                    differ,
                    zoom(first),
                    dots.0,
                    dots.1,
                    cumulative_differ,
                );
            }
        }
    }
}

/// Prints the noninterference census over the served engine.
///
/// The generation derives from the visible entries alone and cascades over them alone, so a served
/// delivery must agree row for row across the two corpora exactly as the scanning form does. A row
/// with a nonzero `differ` under a hidden-independent rule means the artifact reintroduced a
/// dependence on the hidden rows.
fn served_noninterference(bench: &mut WalkBench, tiles: &[(u8, u32, u32)], rules: &[FillRule]) {
    println!(
        "\nnoninterference, served engine: masked corpus against visible-only corpus, {} tiles \
         per row",
        tiles.len(),
    );
    println!(
        "{:<10} {:>7} {:<14} {:>7} {:>7} {:>8} {:>8} {:>10}",
        "mask", "visible", "rule", "tiles", "differ", "first z", "rows a", "rows b",
    );

    for clustered in SHAPES {
        for visible in [0.75, 0.5, 0.05] {
            remask(bench, clustered, visible);
            let alone = bench.visible_only();
            let generation = bench.generation(GenerationLayout::Inline);
            let alone_generation = alone.generation(GenerationLayout::Inline);
            assert_eq!(
                generation.len(),
                alone_generation.len(),
                "the two corpora hold different visible views",
            );

            for &rule in rules {
                let mut differ = 0_usize;
                let mut first = None;
                let mut widths = (0_usize, 0_usize);
                for &(z, x, y) in tiles {
                    let left = bench.rows(bench.served_delivery(rule, z, x, y, &generation));
                    let right = alone.rows(alone.served_delivery(rule, z, x, y, &alone_generation));
                    if left == right {
                        continue;
                    }
                    differ += 1;
                    if first.is_none() {
                        first = Some(z);
                        widths = (left.len(), right.len());
                    }
                }

                println!(
                    "{:<10} {:>7} {:<14} {:>7} {:>7} {:>8} {:>8} {:>10}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    rule_name(rule),
                    tiles.len(),
                    differ,
                    zoom(first),
                    widths.0,
                    widths.1,
                );
            }
        }
    }
}

/// Prints the served engine's cells-falsely-empty tally against the independent ground truth.
///
/// `empty` counts cut cells holding a visible point that the served cumulative delivery does not
/// occupy, and `truth gaps` counts tiles where the served delivery's own cell set differs from
/// [`WalkBench::occupied_cells`], which reads the corpus and the mask alone.
fn served_density(bench: &mut WalkBench, tiles: &[(u8, u32, u32)], rules: &[FillRule]) {
    println!(
        "\nserved delivery against the independent cell ground truth, {} tiles per row",
        tiles.len(),
    );
    println!(
        "{:<10} {:>7} {:<14} {:>5} {:>9} {:>9} {:>7} {:>10} {:>9}",
        "mask", "visible", "rule", "live", "covered", "shown", "empty", "truth gaps", "srv dots",
    );

    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let generation = bench.generation(GenerationLayout::Inline);
            let (codes, _, _) = bench.columns();

            for &rule in rules {
                let mut tally = Tally::default();
                let mut gaps = 0_usize;
                for &(z, x, y) in tiles {
                    let audit = bench.served_audit(rule, z, x, y, &generation);
                    tally.observe(&audit);
                    if audit.covered == 0 {
                        continue;
                    }

                    let cut = Depth::new(z + bench.span()).expect("a valid cut");
                    let shown: HashSet<u64> = bench
                        .served_cumulative_delivery(rule, z, x, y, &generation)
                        .iter()
                        .map(|&position| {
                            let key = codes
                                .get(position as usize)
                                .copied()
                                .expect("a delivered position indexes the corpus column");

                            MortonKey::from_bits(key).prefix(cut)
                        })
                        .collect();
                    gaps += usize::from(shown != bench.occupied_cells(z, x, y, cut));
                }

                println!(
                    "{:<10} {:>7} {:<14} {:>5} {:>9} {:>9} {:>7} {:>10} {:>9}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    rule_name(rule),
                    tally.live,
                    tally.covered,
                    tally.shown,
                    tally.empty,
                    gaps,
                    tally.dots,
                );
            }
        }
    }
}

/// Prints the ladder over both engines at the recommended budget.
///
/// `k` and `deepened` describe the grid each engine resolved; equal columns mean the served form
/// resolved the same grid tile for tile, and the unmasked rows carry today's own ladder.
fn served_ladder(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!("\nthe ladder over both engines, budget {}", BUDGET / 4);
    println!(
        "{:<10} {:>7} {:>3} {:>8} {:>8} {:>8} {:>8} {:>3} {:>3} {:>9} {:>9} {:>9} {:>9}",
        "mask",
        "visible",
        "z",
        "today",
        "covered",
        "r4 del",
        "srv del",
        "k",
        "k s",
        "deepened",
        "deep s",
        "srv cum",
        "today cum",
    );

    let rule = refined(BUDGET / 4, RefineOrder::Population);
    for clustered in SHAPES {
        for visible in [1.0, 0.5, 0.05] {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);
            let generation = bench.generation(GenerationLayout::Inline);

            for &(z, x, y) in path {
                if !z.is_multiple_of(3) {
                    continue;
                }
                let today = bench.audit(FillRule::Unmasked, z, x, y, view);
                let audit = bench.audit(rule, z, x, y, view);
                let served = bench.served_audit(rule, z, x, y, &generation);

                println!(
                    "{:<10} {:>7} {:>3} {:>8} {:>8} {:>8} {:>8} {:>3} {:>3} {:>9} {:>9} {:>9} \
                     {:>9}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    z,
                    today.delivered,
                    served.covered,
                    audit.delivered,
                    served.delivered,
                    audit.refined,
                    served.refined,
                    audit.deepened,
                    served.deepened,
                    served.cumulative,
                    today.cumulative,
                );
            }
        }
    }
}

/// Prints per-tile selection cost over both engines, as ratios to today's chained walk.
fn served_cost(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!(
        "\nper-tile selection cost over both engines, median of {REPETITIONS}: {} points",
        bench.points(),
    );
    println!(
        "{:<10} {:>7} {:>3} {:>9} {:>9} {:>9} {:>9} {:>8} {:>8} {:>8} {:>11} {:>9}",
        "mask",
        "visible",
        "z",
        "today us",
        "r4 us",
        "srv us",
        "shared us",
        "r4/today",
        "srv/today",
        "r4/srv",
        "r4 scan",
        "srv read",
    );

    let rule = refined(BUDGET / 4, RefineOrder::Population);
    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);
            let inline = bench.generation(GenerationLayout::Inline);
            let shared = bench.generation(GenerationLayout::Shared);

            for &(z, x, y) in path {
                if !z.is_multiple_of(6) {
                    continue;
                }
                let scan = bench.deliver(rule, z, x, y, view);
                let served = bench.served_deliver(rule, z, x, y, &inline);
                let today_micros = median_micros(|| {
                    black_box(bench.chained(black_box(z), black_box(x), black_box(y)));
                });
                let scan_micros = median_micros(|| {
                    black_box(bench.deliver(rule, black_box(z), black_box(x), black_box(y), view));
                });
                let served_micros = median_micros(|| {
                    black_box(bench.served_deliver(
                        rule,
                        black_box(z),
                        black_box(x),
                        black_box(y),
                        &inline,
                    ));
                });
                let shared_micros = median_micros(|| {
                    black_box(bench.served_deliver(
                        rule,
                        black_box(z),
                        black_box(x),
                        black_box(y),
                        &shared,
                    ));
                });

                println!(
                    "{:<10} {:>7} {:>3} {:>9.1} {:>9.1} {:>9.1} {:>9.1} {:>8.1} {:>8.1} {:>8.1} \
                     {:>11} {:>9}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    z,
                    today_micros,
                    scan_micros,
                    served_micros,
                    shared_micros,
                    scan_micros / today_micros,
                    served_micros / today_micros,
                    scan_micros / served_micros,
                    scan.scanned,
                    served.scanned,
                );
            }
        }
    }
}

/// Prints where a served delivery's own cost goes.
///
/// `coarse` delivers at the cut depth alone, `whole` adds the refinement search, `morton` adds the
/// partial refinement without a population order, and `pop` adds the population index searches.
/// `read` times one bare prefix read of the tile's own cut grid, without the chain.
fn served_breakdown(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!(
        "\nserved cost by component, median of {REPETITIONS}: {} points",
        bench.points(),
    );
    println!(
        "{:<10} {:>7} {:>3} {:>9} {:>9} {:>9} {:>9} {:>9} {:>8} {:>9}",
        "mask",
        "visible",
        "z",
        "today us",
        "coarse us",
        "whole us",
        "morton us",
        "pop us",
        "read us",
        "cells",
    );

    for clustered in SHAPES {
        for visible in [1.0, 0.5, 0.05] {
            remask(bench, clustered, visible);
            let generation = bench.generation(GenerationLayout::Inline);

            for &(z, x, y) in path {
                if !z.is_multiple_of(6) {
                    continue;
                }
                let cut = Depth::new(z + bench.span()).expect("a valid cut");
                let cells = bench
                    .served_representatives(z, x, y, cut, &generation)
                    .len();

                println!(
                    "{:<10} {:>7} {:>3} {:>9.1} {:>9.1} {:>9.1} {:>9.1} {:>9.1} {:>8.1} {:>9}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    z,
                    median_micros(|| {
                        black_box(bench.chained(black_box(z), black_box(x), black_box(y)));
                    }),
                    median_micros(|| {
                        black_box(bench.served_deliver(
                            FillRule::CoverageRank,
                            z,
                            x,
                            y,
                            &generation,
                        ));
                    }),
                    median_micros(|| {
                        black_box(bench.served_deliver(
                            refined(BUDGET / 4, RefineOrder::Whole),
                            z,
                            x,
                            y,
                            &generation,
                        ));
                    }),
                    median_micros(|| {
                        black_box(bench.served_deliver(
                            refined(BUDGET / 4, RefineOrder::Morton),
                            z,
                            x,
                            y,
                            &generation,
                        ));
                    }),
                    median_micros(|| {
                        black_box(bench.served_deliver(
                            refined(BUDGET / 4, RefineOrder::Population),
                            z,
                            x,
                            y,
                            &generation,
                        ));
                    }),
                    median_micros(|| {
                        black_box(bench.served_representatives(z, x, y, cut, &generation));
                    }),
                    cells,
                );
            }
        }
    }
}

/// One masked-cascade construction measured against the existing separated build.
#[derive(Debug, Copy, Clone)]
enum ScopeConstruction {
    /// Merge the visible restrictions of the existing bucket runs.
    Merged,
    /// Scan a shared corpus-wide key order.
    Filtered,
    /// Transpose the mask through both directions of a shared key order.
    Indexed,
    /// Radix-order visible shared key ordinals.
    Radix,
}

/// Interleaved build medians and paired ratios for one scope.
struct ScopeBuildTimes {
    separated: f64,
    merged: f64,
    filtered: f64,
    indexed: f64,
    radix: f64,
    merged_ratio: f64,
    filtered_ratio: f64,
    indexed_ratio: f64,
    radix_ratio: f64,
}

/// Measures one call in microseconds.
fn measure_once(mut run: impl FnMut()) -> f64 {
    let start = Instant::now();
    run();
    start.elapsed().as_secs_f64() * 1e6
}

/// Measures one construction once.
fn scope_construction_micros(bench: &WalkBench, construction: ScopeConstruction) -> f64 {
    measure_once(|| match construction {
        ScopeConstruction::Merged => {
            black_box(bench.merged_generation(GenerationLayout::Shared));
        }
        ScopeConstruction::Filtered => {
            black_box(bench.filtered_generation(GenerationLayout::Shared));
        }
        ScopeConstruction::Indexed => {
            black_box(bench.indexed_generation(GenerationLayout::Shared));
        }
        ScopeConstruction::Radix => {
            black_box(bench.radix_generation(GenerationLayout::Shared));
        }
    })
}

/// Returns the median of a nonempty fixed-size sample.
///
/// # Panics
///
/// This panics when `N` is zero.
fn sample_median<const N: usize>(mut samples: [f64; N]) -> f64 {
    assert!(N > 0, "a median needs at least one sample");
    samples.sort_by(f64::total_cmp);
    *samples
        .get(N / 2)
        .expect("the nonempty sample holds its middle")
}

/// Records one sample at its repetition index.
///
/// # Panics
///
/// This panics when `index` is `N` or beyond.
fn record_sample<const N: usize>(samples: &mut [f64; N], index: usize, value: f64) {
    *samples
        .get_mut(index)
        .expect("the repetition lies inside the sample") = value;
}

/// Measures every construction adjacent to its own separated-build baseline.
fn interleaved_scope_builds(bench: &WalkBench) -> ScopeBuildTimes {
    const CONSTRUCTIONS: [ScopeConstruction; 4] = [
        ScopeConstruction::Merged,
        ScopeConstruction::Filtered,
        ScopeConstruction::Indexed,
        ScopeConstruction::Radix,
    ];

    let mut separated = [0.0_f64; REPETITIONS * CONSTRUCTIONS.len()];
    let mut separated_at = 0_usize;
    let mut merged = [0.0_f64; REPETITIONS];
    let mut filtered = [0.0_f64; REPETITIONS];
    let mut indexed = [0.0_f64; REPETITIONS];
    let mut radix = [0.0_f64; REPETITIONS];
    let mut merged_ratio = [0.0_f64; REPETITIONS];
    let mut filtered_ratio = [0.0_f64; REPETITIONS];
    let mut indexed_ratio = [0.0_f64; REPETITIONS];
    let mut radix_ratio = [0.0_f64; REPETITIONS];

    for repetition in 0..REPETITIONS {
        for offset in 0..CONSTRUCTIONS.len() {
            let construction = *CONSTRUCTIONS
                .get((repetition + offset) % CONSTRUCTIONS.len())
                .expect("the reduced index lies inside the construction table");
            let baseline_first = (repetition + offset).is_multiple_of(2);
            let baseline = || {
                measure_once(|| {
                    black_box(bench.separated_generation(GenerationLayout::Shared));
                })
            };
            let candidate = || scope_construction_micros(bench, construction);
            let (baseline, candidate) = if baseline_first {
                (baseline(), candidate())
            } else {
                let candidate = candidate();
                (baseline(), candidate)
            };
            record_sample(&mut separated, separated_at, baseline);
            separated_at += 1;

            match construction {
                ScopeConstruction::Merged => {
                    record_sample(&mut merged, repetition, candidate);
                    record_sample(&mut merged_ratio, repetition, candidate / baseline);
                }
                ScopeConstruction::Filtered => {
                    record_sample(&mut filtered, repetition, candidate);
                    record_sample(&mut filtered_ratio, repetition, candidate / baseline);
                }
                ScopeConstruction::Indexed => {
                    record_sample(&mut indexed, repetition, candidate);
                    record_sample(&mut indexed_ratio, repetition, candidate / baseline);
                }
                ScopeConstruction::Radix => {
                    record_sample(&mut radix, repetition, candidate);
                    record_sample(&mut radix_ratio, repetition, candidate / baseline);
                }
            }
        }
    }

    ScopeBuildTimes {
        separated: sample_median(separated),
        merged: sample_median(merged),
        filtered: sample_median(filtered),
        indexed: sample_median(indexed),
        radix: sample_median(radix),
        merged_ratio: sample_median(merged_ratio),
        filtered_ratio: sample_median(filtered_ratio),
        indexed_ratio: sample_median(indexed_ratio),
        radix_ratio: sample_median(radix_ratio),
    }
}

/// Prints per-scope cascade build cost for the five exact constructions.
fn scope_cascade_cost(scales: &[usize]) {
    println!("\nper-scope masked cascade build, median of {REPETITIONS}");
    println!(
        "{:>10} {:<10} {:>7} {:>9} {:>10} {:>9} {:>12} {:>12} {:>12} {:>12} {:>12} {:>10} {:>10} \
         {:>10} {:>10}",
        "points",
        "mask",
        "visible",
        "vis rows",
        "promoted",
        "prom/vis",
        "separated",
        "merged",
        "filtered",
        "indexed",
        "radix",
        "merge/base",
        "filter/base",
        "index/base",
        "radix/base",
    );

    for &scale in scales {
        let mut bench = WalkBench::build(scale, SEED);
        let full = bench.indexed_generation(GenerationLayout::Shared);
        for clustered in SHAPES {
            for visible in FRACTIONS {
                remask(&mut bench, clustered, visible);

                let separated = bench.separated_generation(GenerationLayout::Shared);
                let merged = bench.merged_generation(GenerationLayout::Shared);
                let filtered = bench.filtered_generation(GenerationLayout::Shared);
                let indexed = bench.indexed_generation(GenerationLayout::Shared);
                let radix = bench.radix_generation(GenerationLayout::Shared);
                assert_eq!(merged, separated, "the merged artifact differs");
                assert_eq!(filtered, separated, "the filtered artifact differs");
                assert_eq!(indexed, separated, "the indexed artifact differs");
                assert_eq!(radix, separated, "the radix artifact differs");
                let (promoted, deeper) = bench.bucket_movements(&full, &indexed);
                assert_eq!(deeper, 0, "a masked bucket moved deeper");

                let times = interleaved_scope_builds(&bench);

                println!(
                    "{:>10} {:<10} {:>7} {:>9} {:>10} {:>9.3} {:>12.1} {:>12.1} {:>12.1} {:>12.1} \
                     {:>12.1} {:>10.3} {:>10.3} {:>10.3} {:>10.3}",
                    scale,
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    bench.visible_rows(),
                    promoted,
                    promoted as f64 / bench.visible_rows() as f64,
                    times.separated,
                    times.merged,
                    times.filtered,
                    times.indexed,
                    times.radix,
                    times.merged_ratio,
                    times.filtered_ratio,
                    times.indexed_ratio,
                    times.radix_ratio,
                );
            }
        }
    }
}

/// Prints the space, build, and serve trade across every artifact form.
///
/// `b/row` is bytes per visible row. The scanning form serves out of the Morton column; the served
/// form serves out of a generation, whose shared layout drops the key column and reads keys through
/// the corpus base column instead. The position column alone is the leanest form that answers
/// populations, and the re-cascade is the artifact the equivalence proof names.
fn served_trade(scales: &[usize]) {
    println!("\nspace, build, and serve per artifact form, median of {REPETITIONS}");
    println!(
        "{:>10} {:<10} {:>7} {:>9} {:<12} {:>10} {:>11} {:>7} {:>9} {:>9}",
        "points",
        "mask",
        "visible",
        "vis rows",
        "form",
        "build us",
        "bytes",
        "b/row",
        "root us",
        "deep us",
    );

    for &scale in scales {
        let mut bench = WalkBench::build(scale, SEED);
        let path = bench.descent();
        let deep = *path.last().expect("the descent path holds the root");

        for clustered in SHAPES {
            for visible in [1.0, 0.25] {
                remask(&mut bench, clustered, visible);
                trade_forms(&bench, deep, scale, (clustered, visible));
            }
        }
    }
}

/// Measures every artifact form over one corpus scale and mask cell.
fn trade_forms(bench: &WalkBench, deep: (u8, u32, u32), scale: usize, mask: (bool, f64)) {
    let (deep_z, deep_x, deep_y) = deep;
    let rule = refined(BUDGET / 4, RefineOrder::Population);
    let rows = bench.visible_rows().max(1);
    let pyramid = bench.pyramid();
    let column = bench.column();
    let view = VisibleView::new(&pyramid, &column);
    let inline = bench.generation(GenerationLayout::Inline);
    let shared = bench.generation(GenerationLayout::Shared);
    let positions = bench.position_column();
    let cascade = bench.visible_cascade(VisibleRankOrder::Base);
    let separated = bench.separated_generation(GenerationLayout::Shared);

    let forms: [(&str, f64, usize, f64, f64); 7] = [
        (
            "pyramid",
            median_micros(|| {
                black_box(bench.pyramid());
            }),
            pyramid.footprint(),
            f64::NAN,
            f64::NAN,
        ),
        (
            "column",
            median_micros(|| {
                black_box(bench.column());
            }),
            column.footprint(),
            median_micros(|| {
                black_box(bench.deliver(rule, 0, 0, 0, view));
            }),
            median_micros(|| {
                black_box(bench.deliver(rule, deep_z, deep_x, deep_y, view));
            }),
        ),
        (
            "generation",
            median_micros(|| {
                black_box(bench.generation(GenerationLayout::Inline));
            }),
            inline.footprint(),
            median_micros(|| {
                black_box(bench.served_deliver(rule, 0, 0, 0, &inline));
            }),
            median_micros(|| {
                black_box(bench.served_deliver(rule, deep_z, deep_x, deep_y, &inline));
            }),
        ),
        (
            "gen shared",
            median_micros(|| {
                black_box(bench.generation(GenerationLayout::Shared));
            }),
            shared.footprint(),
            median_micros(|| {
                black_box(bench.served_deliver(rule, 0, 0, 0, &shared));
            }),
            median_micros(|| {
                black_box(bench.served_deliver(rule, deep_z, deep_x, deep_y, &shared));
            }),
        ),
        (
            "positions",
            median_micros(|| {
                black_box(bench.position_column());
            }),
            positions.len() * size_of::<u32>(),
            f64::NAN,
            f64::NAN,
        ),
        (
            "re-cascade",
            median_micros(|| {
                black_box(bench.visible_cascade(VisibleRankOrder::Base));
            }),
            cascade.points() * (size_of::<u64>() + 1),
            f64::NAN,
            f64::NAN,
        ),
        (
            "separated",
            median_micros(|| {
                black_box(bench.separated_generation(GenerationLayout::Shared));
            }),
            shared.footprint(),
            median_micros(|| {
                black_box(bench.served_deliver(rule, 0, 0, 0, &separated));
            }),
            median_micros(|| {
                black_box(bench.served_deliver(rule, deep_z, deep_x, deep_y, &separated));
            }),
        ),
    ];

    for form in forms {
        trade_line(scale, mask, rows, form);
    }
}

/// Prints one artifact form's space, build, and serve line.
fn trade_line(scale: usize, mask: (bool, f64), rows: usize, form: (&str, f64, usize, f64, f64)) {
    let (clustered, visible) = mask;
    let (name, build, bytes, root, deepest) = form;

    println!(
        "{:>10} {:<10} {:>7} {:>9} {:<12} {:>10.1} {:>11} {:>7.1} {:>9.1} {:>9.1}",
        scale,
        shape_name(clustered),
        format!("{:.0}%", visible * 100.0),
        rows,
        name,
        build,
        bytes,
        bytes as f64 / rows as f64,
        root,
        deepest,
    );
}

/// Prints the per-scope artifact cost: pyramid, column, and no artifact at all.
fn artifact_cost(scales: &[usize]) {
    println!("\nper-scope artifacts, median of {REPETITIONS}");
    println!(
        "{:>10} {:<10} {:>7} {:>9} {:>10} {:>11} {:>10} {:>11} {:>10} {:>11} {:>11} {:>11}",
        "points",
        "mask",
        "visible",
        "vis rows",
        "pyr us",
        "pyr bytes",
        "col us",
        "col bytes",
        "mask bytes",
        "root gath",
        "deep gath",
        "chain gath",
    );

    for &scale in scales {
        let mut bench = WalkBench::build(scale, SEED);
        let path = bench.descent();
        let &(deep_z, deep_x, deep_y) = path.last().expect("the descent path holds the root");

        for clustered in SHAPES {
            for visible in [1.0, 0.25] {
                remask(&mut bench, clustered, visible);
                let pyramid = bench.pyramid();
                let column = bench.column();

                let pyramid_micros = median_micros(|| {
                    black_box(bench.pyramid());
                });
                let column_micros = median_micros(|| {
                    black_box(bench.column());
                });
                let root_micros = median_micros(|| {
                    black_box(bench.gather(0, 0, 0));
                });
                let deep_micros = median_micros(|| {
                    black_box(bench.gather(deep_z, deep_x, deep_y));
                });
                let chain_micros = median_micros(|| {
                    for &(z, x, y) in &path {
                        black_box(bench.gather(z, x, y));
                    }
                });

                println!(
                    "{:>10} {:<10} {:>7} {:>9} {:>10.1} {:>11} {:>10.1} {:>11} {:>10} {:>11.1} \
                     {:>11.1} {:>11.1}",
                    scale,
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    bench.visible_rows(),
                    pyramid_micros,
                    pyramid.footprint(),
                    column_micros,
                    column.footprint(),
                    bench.points().div_ceil(8),
                    root_micros,
                    deep_micros,
                    chain_micros,
                );
            }
        }
    }
}

/// Prints per-tile selection cost for the rank-representative rules.
fn refine_cost(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!(
        "\nrank-rule selection cost, median of {REPETITIONS}: {} points",
        bench.points(),
    );
    println!(
        "{:<10} {:>7} {:>3} {:>9} {:>9} {:>9} {:>9} {:>11} {:>11}",
        "mask", "visible", "z", "today us", "cells us", "rank us", "r4 us", "rank scan", "r4 scan",
    );

    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);
            let rule = refined(BUDGET, RefineOrder::Population);

            for &(z, x, y) in path {
                if !z.is_multiple_of(6) {
                    continue;
                }
                let rank = bench.deliver(FillRule::CoverageRank, z, x, y, view);
                let r4 = bench.deliver(rule, z, x, y, view);

                println!(
                    "{:<10} {:>7} {:>3} {:>9.1} {:>9.1} {:>9.1} {:>9.1} {:>11} {:>11}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    z,
                    median_micros(|| {
                        black_box(bench.chained(black_box(z), black_box(x), black_box(y)));
                    }),
                    median_micros(|| {
                        black_box(bench.deliver(FillRule::CoverageCells, z, x, y, view));
                    }),
                    median_micros(|| {
                        black_box(bench.deliver(FillRule::CoverageRank, z, x, y, view));
                    }),
                    median_micros(|| {
                        black_box(bench.deliver(rule, z, x, y, view));
                    }),
                    rank.scanned,
                    r4.scanned,
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
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);

            for &(z, x, y) in path {
                if !z.is_multiple_of(3) {
                    continue;
                }
                let unmasked = bench.delivery(FillRule::Unmasked, z, x, y, view);
                let coverage = bench.delivery(FillRule::Coverage, z, x, y, view);
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

/// Prints the sweep of both variants across mask shape, visible fraction, and zoom.
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

/// One rule in the proportional-density comparison.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum DensityRule {
    /// The current hidden-budget fill.
    Today,
    /// Visible scheduled rows in the corpus generation.
    Floor,
    /// One representative per occupied cut cell.
    Coarse,
    /// Population-ordered per-tile budget refinement.
    Budgeted,
    /// One representative per occupied cell one public level below the cut.
    Uniform,
}

/// Names one proportional-density rule.
const fn density_rule_name(rule: DensityRule) -> &'static str {
    match rule {
        DensityRule::Today => "today",
        DensityRule::Floor => "r1-floor",
        DensityRule::Coarse => "r2-coarse",
        DensityRule::Budgeted => "r4-budget",
        DensityRule::Uniform => "uniform+1",
    }
}

/// Delivers the whole rendered world at one zoom under one rule.
fn world_delivery(
    bench: &WalkBench,
    rule: DensityRule,
    z: u8,
    view: VisibleView<'_>,
    generation: &hash_graph_atlas::bench::lod::ServedGeneration,
) -> Vec<u32> {
    let side = 1_u32 << z;
    let mut delivered = Vec::new();
    for x in 0..side {
        for y in 0..side {
            let mut tile = match rule {
                DensityRule::Today => bench.cumulative_delivery(FillRule::Unmasked, z, x, y, view),
                DensityRule::Floor => bench.cumulative_delivery(FillRule::Visible, z, x, y, view),
                DensityRule::Coarse => {
                    bench.served_cumulative_delivery(FillRule::CoverageRank, z, x, y, generation)
                }
                DensityRule::Budgeted => bench.served_cumulative_delivery(
                    refined(BUDGET / 4, RefineOrder::Population),
                    z,
                    x,
                    y,
                    generation,
                ),
                DensityRule::Uniform => {
                    bench.uniform_cumulative_delivery(UNIFORM_DEPTH, z, x, y, generation)
                }
            };
            delivered.append(&mut tile);
        }
    }

    let unique: HashSet<u32> = delivered.iter().copied().collect();
    assert_eq!(
        unique.len(),
        delivered.len(),
        "disjoint tiles repeated a delivered position",
    );
    delivered
}

/// Counts delivered positions in equal-area windows.
fn delivered_window_counts(codes: &[u64], positions: &[u32], depth: Depth) -> Vec<usize> {
    let mut counts = vec![0_usize; 1_usize << (2 * u32::from(depth.get()))];
    for &position in positions {
        let code = *codes
            .get(position as usize)
            .expect("delivered positions lie in the code column");
        let window = MortonKey::from_bits(code).prefix(depth);
        *counts
            .get_mut(usize::try_from(window).expect("the audit grid fits usize"))
            .expect("the prefix lies in the audit grid") += 1;
    }
    counts
}

/// Counts occupied cells of one truth grid in equal-area windows.
fn occupied_window_counts(
    bench: &WalkBench,
    occupied_depth: Depth,
    window_depth: Depth,
) -> Vec<usize> {
    assert!(window_depth <= occupied_depth);
    let mut counts = vec![0_usize; 1_usize << (2 * u32::from(window_depth.get()))];
    let shift = 2 * u32::from(occupied_depth.get() - window_depth.get());
    for cell in bench.occupied_cells(0, 0, 0, occupied_depth) {
        let window = cell >> shift;
        *counts
            .get_mut(usize::try_from(window).expect("the audit grid fits usize"))
            .expect("the prefix lies in the audit grid") += 1;
    }
    counts
}

/// Returns one window's Morton index.
fn window_index(depth: Depth, x: u32, y: u32) -> usize {
    let shift = 32 - u32::from(depth.get());
    usize::try_from(MortonKey::new(x << shift, y << shift).prefix(depth))
        .expect("the audit grid fits usize")
}

/// One rule's scale-free fit to one public occupancy grid.
#[derive(Debug, Copy, Clone)]
struct DensityFit {
    /// The public grid's refinement below the cut.
    additional_depth: u8,
    /// Total variation between shown and occupied spatial shares.
    total_variation: f64,
    /// The largest sampling-ratio contrast across a rendered tile boundary.
    seam_maximum: f64,
    /// The 95th percentile sampling-ratio contrast across rendered tile boundaries.
    seam_p95: f64,
    /// The smallest shown-to-occupied ratio over nonempty windows.
    sampling_minimum: f64,
    /// The largest shown-to-occupied ratio over nonempty windows.
    sampling_maximum: f64,
}

/// Fits one shown distribution to one public occupancy grid.
fn density_fit(
    shown: &[usize],
    occupied: &[usize],
    render_zoom: u8,
    window_depth: Depth,
    additional_depth: u8,
) -> DensityFit {
    assert_eq!(shown.len(), occupied.len());
    let shown_total = shown.iter().sum::<usize>();
    let occupied_total = occupied.iter().sum::<usize>();
    assert!(shown_total > 0 && occupied_total > 0);

    let denominator = 2.0 * shown_total as f64 * occupied_total as f64;
    let total_variation = shown
        .iter()
        .zip(occupied)
        .map(|(&dots, &cells)| {
            let shown_share = dots as u128 * occupied_total as u128;
            let occupied_share = cells as u128 * shown_total as u128;
            shown_share.abs_diff(occupied_share) as f64
        })
        .sum::<f64>()
        / denominator;

    let mut sampling_minimum = f64::INFINITY;
    let mut sampling_maximum = 0.0_f64;
    for (&dots, &cells) in shown.iter().zip(occupied) {
        if cells == 0 {
            continue;
        }
        let sampling = dots as f64 / cells as f64;
        sampling_minimum = sampling_minimum.min(sampling);
        sampling_maximum = sampling_maximum.max(sampling);
    }

    let side = 1_u32 << window_depth.get();
    let windows_per_tile_side = 1_u32 << (window_depth.get() - render_zoom);
    let mut seams = Vec::new();
    let mut observe = |left: usize, right: usize| {
        let left_cells = *occupied
            .get(left)
            .expect("the left window lies in the grid");
        let right_cells = *occupied
            .get(right)
            .expect("the right window lies in the grid");
        if left_cells == 0 || right_cells == 0 {
            return;
        }
        let left_dots = *shown.get(left).expect("the left window lies in the grid");
        let right_dots = *shown.get(right).expect("the right window lies in the grid");
        let left_cross = left_dots as f64 * right_cells as f64;
        let right_cross = right_dots as f64 * left_cells as f64;
        let sum = left_cross + right_cross;
        seams.push(if sum == 0.0 {
            0.0
        } else {
            (left_cross - right_cross).abs() / sum
        });
    };
    for x in 0..side {
        for y in 0..side {
            let current = window_index(window_depth, x, y);
            if x + 1 < side && (x + 1).is_multiple_of(windows_per_tile_side) {
                observe(current, window_index(window_depth, x + 1, y));
            }
            if y + 1 < side && (y + 1).is_multiple_of(windows_per_tile_side) {
                observe(current, window_index(window_depth, x, y + 1));
            }
        }
    }
    seams.sort_by(f64::total_cmp);
    let seam_maximum = seams.last().copied().unwrap_or(0.0);
    let seam_p95 = seams
        .get(seams.len().saturating_sub(1) * 95 / 100)
        .copied()
        .unwrap_or(0.0);

    DensityFit {
        additional_depth,
        total_variation,
        seam_maximum,
        seam_p95,
        sampling_minimum,
        sampling_maximum,
    }
}

/// Finds the public occupancy grid whose spatial distribution best fits the shown dots.
fn best_density_fit(
    bench: &WalkBench,
    shown: &[usize],
    render_zoom: u8,
    window_depth: Depth,
) -> DensityFit {
    let mut best = None;
    for additional_depth in 0..=6_u8 {
        let occupied_depth = bench.uniform_grid_depth(render_zoom, additional_depth);
        let occupied = occupied_window_counts(bench, occupied_depth, window_depth);
        let fit = density_fit(
            shown,
            &occupied,
            render_zoom,
            window_depth,
            additional_depth,
        );
        if best
            .as_ref()
            .is_none_or(|best: &DensityFit| fit.total_variation < best.total_variation)
        {
            best = Some(fit);
        }
    }

    best.expect("the public-grid search checks seven depths")
}

/// Counts adjacent R4 tiles whose whole-grid depth differs and tiles with a mixed grid.
fn budget_grid_seams(
    bench: &WalkBench,
    z: u8,
    generation: &hash_graph_atlas::bench::lod::ServedGeneration,
) -> (usize, usize, usize) {
    let rule = refined(BUDGET / 4, RefineOrder::Population);
    let side = 1_u32 << z;
    let mut grids = Vec::with_capacity(usize::try_from(side * side).expect("the grid fits usize"));
    let mut mixed = 0_usize;
    for x in 0..side {
        for y in 0..side {
            let audit = bench.served_audit(rule, z, x, y, generation);
            grids.push(audit.refined);
            mixed += usize::from(audit.deepened > 0);
        }
    }

    let at =
        |x: u32, y: u32| usize::try_from(x * side + y).expect("the shallow audit grid fits usize");
    let mut different = 0_usize;
    let mut edges = 0_usize;
    for x in 0..side {
        for y in 0..side {
            if x + 1 < side {
                let current = grids.get(at(x, y)).expect("the tile lies in the grid");
                let right = grids
                    .get(at(x + 1, y))
                    .expect("the right tile lies in the grid");
                different += usize::from(current != right);
                edges += 1;
            }
            if y + 1 < side {
                let current = grids.get(at(x, y)).expect("the tile lies in the grid");
                let below = grids
                    .get(at(x, y + 1))
                    .expect("the lower tile lies in the grid");
                different += usize::from(current != below);
                edges += 1;
            }
        }
    }

    (different, edges, mixed)
}

/// Prints the best public-grid fit and boundary seam contrast for every rule.
#[expect(
    clippy::too_many_lines,
    reason = "the report keeps one mask-rule row's fit, acceptance assertions, and output adjacent"
)]
fn proportional_density(bench: &mut WalkBench) {
    const RULES: [DensityRule; 5] = [
        DensityRule::Today,
        DensityRule::Floor,
        DensityRule::Coarse,
        DensityRule::Budgeted,
        DensityRule::Uniform,
    ];

    println!("\nproportional density: best public grid over 4x4 windows per rendered tile");
    println!(
        "{:<10} {:>7} {:<11} {:>9} {:>5} {:>3} {:>9} {:>9} {:>9} {:>9} {:>9} {:>10}",
        "mask",
        "visible",
        "rule",
        "dots z3",
        "tv z",
        "k",
        "max TV",
        "seam p95",
        "seam max",
        "sample lo",
        "sample hi",
        "k edges",
    );

    let (codes, _, _) = bench.columns();
    let mut today_separates = false;
    let mut budget_separates = false;
    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);
            let generation = bench.indexed_generation(GenerationLayout::Shared);

            for rule in RULES {
                let mut worst_fit = DensityFit {
                    additional_depth: 0,
                    total_variation: -1.0,
                    seam_maximum: 0.0,
                    seam_p95: 0.0,
                    sampling_minimum: 0.0,
                    sampling_maximum: 0.0,
                };
                let mut worst_zoom = 0_u8;
                let mut worst_seam_p95 = 0.0_f64;
                let mut worst_seam_maximum = 0.0_f64;
                let mut dots_at_three = 0_usize;
                let mut different_edges = 0_usize;
                let mut grid_edges = 0_usize;

                for z in 0..=3_u8 {
                    let delivered = world_delivery(bench, rule, z, view, &generation);
                    if z == 3 {
                        dots_at_three = delivered.len();
                    }
                    let window_depth = Depth::new(z + 2).expect("the audit windows fit the key");
                    let shown = delivered_window_counts(&codes, &delivered, window_depth);
                    let fit = best_density_fit(bench, &shown, z, window_depth);

                    if rule == DensityRule::Coarse {
                        let occupied = occupied_window_counts(
                            bench,
                            bench.uniform_grid_depth(z, 0),
                            window_depth,
                        );
                        assert!(
                            density_fit(&shown, &occupied, z, window_depth, 0).total_variation
                                <= f64::EPSILON,
                            "the coarse public grid failed its own density metric",
                        );
                    }
                    if rule == DensityRule::Uniform {
                        let occupied = occupied_window_counts(
                            bench,
                            bench.uniform_grid_depth(z, UNIFORM_DEPTH),
                            window_depth,
                        );
                        assert!(
                            density_fit(&shown, &occupied, z, window_depth, UNIFORM_DEPTH,)
                                .total_variation
                                <= f64::EPSILON,
                            "the uniform public grid failed its own density metric",
                        );
                    }

                    if fit.total_variation > worst_fit.total_variation {
                        worst_fit = fit;
                        worst_zoom = z;
                    }
                    worst_seam_p95 = worst_seam_p95.max(fit.seam_p95);
                    worst_seam_maximum = worst_seam_maximum.max(fit.seam_maximum);
                    if rule == DensityRule::Budgeted {
                        let (different, edges, _) = budget_grid_seams(bench, z, &generation);
                        different_edges += different;
                        grid_edges += edges;
                    }
                }

                today_separates |=
                    rule == DensityRule::Today && worst_fit.total_variation > f64::EPSILON;
                budget_separates |=
                    rule == DensityRule::Budgeted && worst_fit.total_variation > f64::EPSILON;
                println!(
                    "{:<10} {:>7} {:<11} {:>9} {:>5} {:>3} {:>9.4} {:>9.4} {:>9.4} {:>9.3} \
                     {:>9.3} {:>4}/{:<5}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    density_rule_name(rule),
                    dots_at_three,
                    worst_zoom,
                    worst_fit.additional_depth,
                    worst_fit.total_variation,
                    worst_seam_p95,
                    worst_seam_maximum,
                    worst_fit.sampling_minimum,
                    worst_fit.sampling_maximum,
                    different_edges,
                    grid_edges,
                );
            }
        }
    }
    assert!(
        today_separates,
        "the proportional-density metric no longer catches today's rule",
    );
    assert!(
        budget_separates,
        "the proportional-density metric does not catch per-tile budget refinement",
    );
}

/// Prints dot counts and the public uniform grid's geometric response bound.
#[expect(
    clippy::too_many_lines,
    reason = "the report co-measures five laws and three public-depth controls in one sweep"
)]
fn uniform_density_counts(bench: &mut WalkBench, tiles: &[(u8, u32, u32)]) {
    println!("\nuniform public-grid dot count over {} tiles", tiles.len());
    println!(
        "{:<10} {:>7} {:>10} {:>10} {:>10} {:>10} {:>10} {:>10} {:>10} {:>10} {:>10} {:>9} {:>9} \
         {:>9}",
        "mask",
        "visible",
        "today",
        "r2",
        "r4",
        "uniform0",
        "uniform1",
        "from z6",
        "from z9",
        "from z12",
        "staircase",
        "u6 max",
        "u1 max",
        "term gap",
    );

    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let pyramid = bench.pyramid();
            let column = bench.column();
            let view = VisibleView::new(&pyramid, &column);
            let generation = bench.indexed_generation(GenerationLayout::Shared);
            let mut today = 0_usize;
            let mut coarse = 0_usize;
            let mut budgeted = 0_usize;
            let mut uniform_zero = 0_usize;
            let mut uniform_one = 0_usize;
            let mut from_six = 0_usize;
            let mut from_nine = 0_usize;
            let mut from_twelve = 0_usize;
            let mut staircase = 0_usize;
            let mut from_six_maximum = 0_usize;
            let mut uniform_one_maximum = 0_usize;
            let mut terminal_population = 0_usize;
            let mut terminal_delivered = 0_usize;

            for &(z, x, y) in tiles {
                today += bench
                    .cumulative_delivery(FillRule::Unmasked, z, x, y, view)
                    .len();
                coarse += bench
                    .served_cumulative_delivery(FillRule::CoverageRank, z, x, y, &generation)
                    .len();
                budgeted += bench
                    .served_cumulative_delivery(
                        refined(BUDGET / 4, RefineOrder::Population),
                        z,
                        x,
                        y,
                        &generation,
                    )
                    .len();
                uniform_zero += bench
                    .uniform_step_cumulative_delivery(u8::MAX, z, x, y, &generation)
                    .len();
                uniform_one += bench
                    .uniform_cumulative_delivery(UNIFORM_DEPTH, z, x, y, &generation)
                    .len();
                from_six += bench
                    .uniform_step_cumulative_delivery(6, z, x, y, &generation)
                    .len();
                from_six_maximum = from_six_maximum
                    .max(bench.uniform_step_delivery(6, z, x, y, &generation).len());
                from_nine += bench
                    .uniform_cumulative_delivery(u8::from(z >= 9), z, x, y, &generation)
                    .len();
                from_twelve += bench
                    .uniform_cumulative_delivery(u8::from(z >= 12), z, x, y, &generation)
                    .len();
                staircase += bench
                    .uniform_cumulative_delivery(z / bench.span(), z, x, y, &generation)
                    .len();
                uniform_one_maximum = uniform_one_maximum.max(
                    bench
                        .uniform_delivery(UNIFORM_DEPTH, z, x, y, &generation)
                        .len(),
                );
                if z == bench.max_zoom() {
                    terminal_population += bench.gather(z, x, y).len();
                    terminal_delivered += bench
                        .uniform_step_cumulative_delivery(6, z, x, y, &generation)
                        .len();
                }
            }
            assert_eq!(coarse, uniform_zero, "the two coarse forms differ in count");
            assert_eq!(
                terminal_population, terminal_delivered,
                "the terminal public grid omitted visible rows",
            );

            println!(
                "{:<10} {:>7} {:>10} {:>10} {:>10} {:>10} {:>10} {:>10} {:>10} {:>10} {:>10} \
                 {:>9} {:>9} {:>9}",
                shape_name(clustered),
                format!("{:.0}%", visible * 100.0),
                today,
                coarse,
                budgeted,
                uniform_zero,
                uniform_one,
                from_six,
                from_nine,
                from_twelve,
                staircase,
                from_six_maximum,
                uniform_one_maximum,
                terminal_population - terminal_delivered,
            );
        }
    }
}

/// Prints the all-visible deep-tail and delivery-order delta.
fn hybrid_delta(bench: &mut WalkBench, tiles: &[(u8, u32, u32)]) {
    bench.mask_uniform(1.0, SEED);
    let pyramid = bench.pyramid();
    let column = bench.column();
    let view = VisibleView::new(&pyramid, &column);
    let generation = bench.indexed_generation(GenerationLayout::Shared);
    let budgeted = refined(BUDGET / 4, RefineOrder::Population);

    println!("\nall-visible dispatch delta against today's delivery");
    println!(
        "{:<10} {:>10} {:>10} {:>10} {:>8}",
        "rule", "sequence", "set", "count", "first z",
    );
    for name in ["r4", "uniform0", "from-z6"] {
        let mut sequence = 0_usize;
        let mut set = 0_usize;
        let mut count = 0_usize;
        let mut first = None;
        for &(z, x, y) in tiles {
            let today = bench.delivery(FillRule::Unmasked, z, x, y, view);
            let candidate = match name {
                "r4" => bench.served_delivery(budgeted, z, x, y, &generation),
                "uniform0" => bench.uniform_step_delivery(u8::MAX, z, x, y, &generation),
                "from-z6" => bench.uniform_step_delivery(6, z, x, y, &generation),
                _ => unreachable!("the candidate table is exhaustive"),
            };
            sequence += usize::from(today != candidate);
            count += usize::from(today.len() != candidate.len());
            let mut today_set = today;
            let mut candidate_set = candidate;
            today_set.sort_unstable();
            candidate_set.sort_unstable();
            if today_set != candidate_set {
                set += 1;
                first = first.or(Some(z));
            }
        }

        println!(
            "{:<10} {:>10} {:>10} {:>10} {:>8}",
            name,
            sequence,
            set,
            count,
            first.map_or_else(|| "-".to_owned(), |z| z.to_string()),
        );
    }
}

/// Interleaved baseline and candidate medians for one timing pair.
#[derive(Debug, Copy, Clone)]
struct PairTimes {
    /// Baseline median in microseconds.
    baseline: f64,
    /// Candidate median in microseconds.
    candidate: f64,
    /// Median of adjacent candidate-to-baseline ratios.
    ratio: f64,
}

/// Measures a candidate adjacent to a fresh baseline with alternating arm order.
fn paired_micros(mut baseline: impl FnMut(), mut candidate: impl FnMut()) -> PairTimes {
    const CALLS_PER_SAMPLE: usize = 100;

    let mut baselines = [0.0_f64; REPETITIONS];
    let mut candidates = [0.0_f64; REPETITIONS];
    let mut ratios = [0.0_f64; REPETITIONS];
    for repetition in 0..REPETITIONS {
        let mut measure_baseline = || {
            measure_once(|| {
                for _ in 0..CALLS_PER_SAMPLE {
                    baseline();
                }
            }) / CALLS_PER_SAMPLE as f64
        };
        let mut measure_candidate = || {
            measure_once(|| {
                for _ in 0..CALLS_PER_SAMPLE {
                    candidate();
                }
            }) / CALLS_PER_SAMPLE as f64
        };
        let (baseline, candidate) = if repetition.is_multiple_of(2) {
            (measure_baseline(), measure_candidate())
        } else {
            let candidate = measure_candidate();
            (measure_baseline(), candidate)
        };
        record_sample(&mut baselines, repetition, baseline);
        record_sample(&mut candidates, repetition, candidate);
        record_sample(&mut ratios, repetition, candidate / baseline);
    }

    PairTimes {
        baseline: sample_median(baselines),
        candidate: sample_median(candidates),
        ratio: sample_median(ratios),
    }
}

/// Prints interleaved per-tile cost for R4 and the public uniform grids.
fn closure_selection_cost(bench: &mut WalkBench, path: &[(u8, u32, u32)]) {
    println!("\nclosure selection cost, paired median of {REPETITIONS}");
    println!(
        "{:<10} {:>7} {:>3} {:>10} {:>10} {:>9} {:>10} {:>9} {:>10} {:>9} {:>10} {:>9}",
        "mask",
        "visible",
        "z",
        "today r4",
        "r4 us",
        "r4/base",
        "uniform0",
        "u0/base",
        "from-z6",
        "u6/base",
        "uniform1",
        "u1/base",
    );

    for clustered in SHAPES {
        for visible in FRACTIONS {
            remask(bench, clustered, visible);
            let generation = bench.indexed_generation(GenerationLayout::Shared);
            for &(z, x, y) in path {
                if !z.is_multiple_of(6) {
                    continue;
                }
                let r4 = paired_micros(
                    || {
                        black_box(bench.chained_delivery(z, x, y));
                    },
                    || {
                        black_box(bench.served_delivery(
                            refined(BUDGET / 4, RefineOrder::Population),
                            z,
                            x,
                            y,
                            &generation,
                        ));
                    },
                );
                let uniform_zero = paired_micros(
                    || {
                        black_box(bench.chained_delivery(z, x, y));
                    },
                    || {
                        black_box(bench.uniform_step_delivery(u8::MAX, z, x, y, &generation));
                    },
                );
                let from_six = paired_micros(
                    || {
                        black_box(bench.chained_delivery(z, x, y));
                    },
                    || {
                        black_box(bench.uniform_step_delivery(6, z, x, y, &generation));
                    },
                );
                let uniform_one = paired_micros(
                    || {
                        black_box(bench.chained_delivery(z, x, y));
                    },
                    || {
                        black_box(bench.uniform_delivery(UNIFORM_DEPTH, z, x, y, &generation));
                    },
                );

                println!(
                    "{:<10} {:>7} {:>3} {:>10.1} {:>10.1} {:>9.3} {:>10.1} {:>9.3} {:>10.1} \
                     {:>9.3} {:>10.1} {:>9.3}",
                    shape_name(clustered),
                    format!("{:.0}%", visible * 100.0),
                    z,
                    r4.baseline,
                    r4.candidate,
                    r4.ratio,
                    uniform_zero.candidate,
                    uniform_zero.ratio,
                    from_six.candidate,
                    from_six.ratio,
                    uniform_one.candidate,
                    uniform_one.ratio,
                );
            }
        }
    }
}

/// Prints every density-closure report with interleaved cost last.
fn density_closure_reports(
    bench: &mut WalkBench,
    path: &[(u8, u32, u32)],
    tiles: &[(u8, u32, u32)],
) {
    proportional_density(bench);
    uniform_density_counts(bench, tiles);
    hybrid_delta(bench, tiles);
    if std::env::var_os("ATLAS_DENSITY_CLOSURE_TIMED").is_some() {
        closure_selection_cost(bench, path);
    }
}

/// Prints every calibration report the target carries, served tables first.
fn reports(bench: &mut WalkBench, path: &[(u8, u32, u32)], tiles: &[(u8, u32, u32)]) {
    let rules = headline_rules();

    let served = served_rules();
    served_identity(bench, tiles, &served);
    served_noninterference(bench, tiles, &served);
    served_density(bench, tiles, &served);
    served_ladder(bench, path);
    served_cost(bench, path);
    served_breakdown(bench, path);
    scope_cascade_cost(&[points() / 4, points(), points() * 4]);
    served_trade(&[points() / 4, points(), points() * 4]);

    noninterference(bench, tiles, &rules);
    let rows = tallies(bench, tiles, &rules);
    falsely_empty(&rules, &rows, tiles.len());
    dot_count(&rules, &rows, tiles.len());
    granularity(bench, tiles);
    ladder(bench, path);
    refine_cost(bench, path);
    artifact_cost(&[points() / 4, points(), points() * 4]);

    cross_check(bench, tiles, FillRule::Coverage);
    cross_check(bench, tiles, FillRule::CoverageCells);
    density(bench, path);
    density_summary(bench, tiles);
    saturation(bench, tiles);
    delivery_order(bench, path);
    selection_cost(bench, path);
    query_cost(bench, path);
    pyramid_profile(bench);
    pyramid_cost(&[points() / 4, points(), points() * 4]);
    sweep(bench, path);
}

fn benches(criterion: &mut Criterion) {
    if std::env::var_os("ATLAS_SCOPE_CASCADE_ONLY").is_some() {
        scope_cascade_cost(&[points() / 4, points(), points() * 4]);
        return;
    }

    let mut bench = WalkBench::build(points(), SEED);
    let path = bench.descent();
    let &(deep_z, deep_x, deep_y) = path.last().expect("the descent path holds the root");

    let tiles = audit_tiles(&bench, &path);
    if std::env::var_os("ATLAS_DENSITY_CLOSURE_ONLY").is_some() {
        density_closure_reports(&mut bench, &path, &tiles);
        return;
    }
    reports(&mut bench, &path, &tiles);

    timings(criterion, &mut bench, (deep_z, deep_x, deep_y));
}

/// Times the decision points: the rules at the root and at the deepest zoom under the adversarial
/// mask.
fn timings(criterion: &mut Criterion, bench: &mut WalkBench, deep: (u8, u32, u32)) {
    let (deep_z, deep_x, deep_y) = deep;
    // The decision points are both variants at the root and at the deepest zoom, under the
    // adversarial mask.
    bench.mask_clustered(0.01, SEED);
    let pyramid = bench.pyramid();
    let column = bench.column();
    let view = VisibleView::new(&pyramid, &column);
    let mut group = criterion.benchmark_group("backfill_walk");
    group.sample_size(10);
    group.bench_function("independent/root", |bencher| {
        bencher.iter(|| black_box(bench.independent(0, 0, 0)));
    });
    group.bench_function("chained/root", |bencher| {
        bencher.iter(|| black_box(bench.chained(0, 0, 0)));
    });
    group.bench_function("coverage/root", |bencher| {
        bencher.iter(|| black_box(bench.deliver(FillRule::Coverage, 0, 0, 0, view)));
    });
    group.bench_function("coverage_cells/root", |bencher| {
        bencher.iter(|| black_box(bench.deliver(FillRule::CoverageCells, 0, 0, 0, view)));
    });
    group.bench_function("independent/deepest", |bencher| {
        bencher.iter(|| black_box(bench.independent(deep_z, deep_x, deep_y)));
    });
    group.bench_function("chained/deepest", |bencher| {
        bencher.iter(|| black_box(bench.chained(deep_z, deep_x, deep_y)));
    });
    group.bench_function("coverage/deepest", |bencher| {
        bencher.iter(|| black_box(bench.deliver(FillRule::Coverage, deep_z, deep_x, deep_y, view)));
    });
    group.bench_function("coverage_cells/deepest", |bencher| {
        bencher.iter(|| {
            black_box(bench.deliver(FillRule::CoverageCells, deep_z, deep_x, deep_y, view))
        });
    });
    let refinement = refined(BUDGET, RefineOrder::Population);
    let recommended = refined(BUDGET / 4, RefineOrder::Population);
    let generation = bench.generation(GenerationLayout::Inline);
    let lean = bench.generation(GenerationLayout::Shared);
    group.bench_function("rank/root", |bencher| {
        bencher.iter(|| black_box(bench.deliver(FillRule::CoverageRank, 0, 0, 0, view)));
    });
    group.bench_function("refined/root", |bencher| {
        bencher.iter(|| black_box(bench.deliver(refinement, 0, 0, 0, view)));
    });
    group.bench_function("rank/deepest", |bencher| {
        bencher.iter(|| {
            black_box(bench.deliver(FillRule::CoverageRank, deep_z, deep_x, deep_y, view))
        });
    });
    group.bench_function("refined/deepest", |bencher| {
        bencher.iter(|| black_box(bench.deliver(refinement, deep_z, deep_x, deep_y, view)));
    });
    group.bench_function("scanned_1024/root", |bencher| {
        bencher.iter(|| black_box(bench.deliver(recommended, 0, 0, 0, view)));
    });
    group.bench_function("served_1024/root", |bencher| {
        bencher.iter(|| black_box(bench.served_deliver(recommended, 0, 0, 0, &generation)));
    });
    group.bench_function("served_lean_1024/root", |bencher| {
        bencher.iter(|| black_box(bench.served_deliver(recommended, 0, 0, 0, &lean)));
    });
    group.bench_function("served_coarse/root", |bencher| {
        bencher
            .iter(|| black_box(bench.served_deliver(FillRule::CoverageRank, 0, 0, 0, &generation)));
    });
    group.bench_function("served_4096/root", |bencher| {
        bencher.iter(|| black_box(bench.served_deliver(refinement, 0, 0, 0, &generation)));
    });
    group.bench_function("served_4096/deepest", |bencher| {
        bencher.iter(|| {
            black_box(bench.served_deliver(refinement, deep_z, deep_x, deep_y, &generation))
        });
    });
    group.bench_function("scanned_1024/deepest", |bencher| {
        bencher.iter(|| black_box(bench.deliver(recommended, deep_z, deep_x, deep_y, view)));
    });
    group.bench_function("served_1024/deepest", |bencher| {
        bencher.iter(|| {
            black_box(bench.served_deliver(recommended, deep_z, deep_x, deep_y, &generation))
        });
    });
    group.bench_function("served_lean_1024/deepest", |bencher| {
        bencher
            .iter(|| black_box(bench.served_deliver(recommended, deep_z, deep_x, deep_y, &lean)));
    });
    group.bench_function("served_coarse/deepest", |bencher| {
        bencher.iter(|| {
            black_box(bench.served_deliver(
                FillRule::CoverageRank,
                deep_z,
                deep_x,
                deep_y,
                &generation,
            ))
        });
    });
    group.finish();
    drop(lean);
    drop(generation);
    drop(column);
    drop(pyramid);
}

criterion_group!(walk, benches);
criterion_main!(walk);
