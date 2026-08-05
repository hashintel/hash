//! Wall-time benchmarks for the hard-negative miner's 2D spatial index.
//!
//! Mining queries every projected point's k nearest neighbours in the bounded 2D frame at both
//! relation-lens extremes, on a configured cadence. One tick is two index builds plus two full
//! query sweeps. Each build starts from scratch because every point moves between ticks. The
//! suite pits `kiddo` against `grid`:
//!
//! - `kiddo`: `ImmutableKdTree`, the miner's index. A balanced kd-tree adapts its partition depth
//!   to local density, so its query cost is immune to the cluster skew attraction exists to produce
//!   - the property the timings here certify.
//! - `grid`: a uniform bucket grid over the known frame, written here (counting-sort build,
//!   ring-expansion exact kNN). The natural alternative when the caller knows the frame ahead of
//!   time, and the control that prices its one assumption. A query scans whole cells, so one global
//!   cell size makes the sweep's cost grow with the sum of squared cell occupancies, quadratic in
//!   exactly the density skew a projected map carries.
//!
//! The fixtures are synthetic point sets in the `[0, 10]^2` frame: `clustered` (Gaussian mixture
//! over a uniform background - the shape a projected map takes), `uniform` (the grid's best case),
//! and `pathological` (an eighth of all points in one near-coincident blob - the bucket-skew stress
//! a coincident-geometry pile-up would produce). The suite measures both engines per fixture on:
//!
//! - `build`: one index construction, single-threaded.
//! - `sweep`: one full per-point kNN pass at k = 24, single-threaded. Sweeps parallelize
//!   embarrassingly and identically for both engines, so the single-threaded number is the
//!   comparative one.
//! - `tick`: two builds plus two sweeps over the two lens extremes' point sets on the clustered
//!   shape, which is the unit the training-loop cadence actually spends.
//!
//! One more group, `judge`, compares the two access layouts available for vetting mined pairs
//! (pointwise protection probes against per-row partner merges) over a live-shape relation corpus
//! and one synthesized sweep's candidates, at a hit-poor and a hit-rich partner rate. The index
//! layout and the vetting layout are one decision. The vet runs once per mined sweep, right where
//! the index hands its neighbours over.
//!
//! Before the timed groups, one report prints each engine's recall against brute-force ground truth
//! on sampled queries and the grid's occupancy skew, the number that explains its
//! pathological-fixture behaviour. Both engines are exact by design, though ties at the k-boundary
//! can shave a fraction off the reported recall.
//!
//! Timings default to 250K points so a full sweep stays in minutes. Set `MINER_BENCH_POINTS` (e.g.
//! to `1000000`) for headline numbers at the expected map scale. Eligible-set subtraction (512-d
//! neighbours, protected pairs, self) is frame-independent and happens downstream of the index, so
//! every engine returns raw neighbours here, self included.
#![expect(
    clippy::print_stderr,
    clippy::significant_drop_tightening,
    reason = "the recall audit is a calibration report beside the timings, and Criterion owns \
              group drops"
)]
#![expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::float_arithmetic,
    clippy::indexing_slicing,
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "fixture synthesis and grid geometry cast, divide, and index between counts and \
              coordinates in domains the fixture construction bounds; the crate-level \
              expectations in lib.rs do not extend to bench targets"
)]
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical nearest-neighbour count and x/y the canonical cell coordinates"
)]

extern crate alloc;

use alloc::collections::BinaryHeap;
use core::{hint::black_box, num::NonZero, time::Duration};

use codspeed_criterion_compat::{Criterion, Throughput, criterion_group, criterion_main};
use hash_graph_atlas::bench::relation::{Profile, production_corpus};
use kiddo::{SquaredEuclidean, immutable::float::kdtree::ImmutableKdTree};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

/// The frame's side length.
///
/// Projected maps lie in `[0, FRAME]^2`.
const FRAME: f32 = 10.0;

/// Neighbours per query, the middle of the miner's k range.
const K: usize = 24;

/// One quarter of the expected map scale.
const DEFAULT_POINTS: usize = 250_000;

/// Ground-truth queries per fixture for the recall report.
const RECALL_SAMPLE: usize = 512;

const SEED: u64 = 0x2D5A_17ED;
/// The second lens extreme's point set for the tick unit.
const SEED_EXTREME: u64 = SEED ^ 0xFFFF_FFFF;

fn points_count() -> usize {
    std::env::var("MINER_BENCH_POINTS").map_or(DEFAULT_POINTS, |value| {
        value
            .parse()
            .expect("MINER_BENCH_POINTS should be a point count")
    })
}

/// How a fixture distributes points over the frame.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Shape {
    /// A Gaussian mixture over a uniform background: 256 clusters with log-uniform spreads hold 80%
    /// of points. The shape a projected map takes, and the primary fixture.
    Clustered,
    /// Uniform over the frame: the grid's best case, kept as the control that shows how much the
    /// mixture costs each engine.
    Uniform,
    /// One near-coincident blob holds an eighth of all points: the bucket-skew stress a
    /// coincident-geometry pile-up produces.
    Pathological,
}

impl Shape {
    const fn label(self) -> &'static str {
        match self {
            Self::Clustered => "clustered",
            Self::Uniform => "uniform",
            Self::Pathological => "pathological",
        }
    }
}

/// Synthesizes `count` points under `shape`, deterministically in the arguments.
fn synthesize(shape: Shape, count: usize, seed: u64) -> Vec<[f32; 2]> {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    let uniform_point =
        |rng: &mut Xoshiro256PlusPlus| [rng.random::<f32>() * FRAME, rng.random::<f32>() * FRAME];
    // One Box-Muller draw yields exactly the two components a 2D
    // Gaussian offset needs.
    let gaussian_offset = |rng: &mut Xoshiro256PlusPlus, sigma: f32| {
        let radius = sigma * (-2.0 * (1.0 - rng.random::<f32>()).ln()).sqrt();
        let angle = core::f32::consts::TAU * rng.random::<f32>();
        [radius * angle.cos(), radius * angle.sin()]
    };

    let clusters: Vec<([f32; 2], f32)> = core::iter::repeat_with(|| {
        let center = [rng.random::<f32>() * FRAME, rng.random::<f32>() * FRAME];
        // Log-uniform spread over 0.02..0.5: tight piles and loose
        // clouds both appear, as they do on a projected map.
        let sigma = 0.02 * 25.0_f32.powf(rng.random::<f32>());
        (center, sigma)
    })
    .take(256)
    .collect();

    (0..count)
        .map(|position| match shape {
            Shape::Clustered => {
                if rng.random::<f32>() < 0.2 {
                    return uniform_point(&mut rng);
                }
                let (center, sigma) = clusters[rng.random_range(0..clusters.len())];
                let offset = gaussian_offset(&mut rng, sigma);
                [
                    (center[0] + offset[0]).clamp(0.0, FRAME),
                    (center[1] + offset[1]).clamp(0.0, FRAME),
                ]
            }
            Shape::Uniform => uniform_point(&mut rng),
            Shape::Pathological => {
                if position.is_multiple_of(8) {
                    let offset = gaussian_offset(&mut rng, 0.01);
                    return [
                        (5.0 + offset[0]).clamp(0.0, FRAME),
                        (5.0 + offset[1]).clamp(0.0, FRAME),
                    ];
                }
                uniform_point(&mut rng)
            }
        })
        .collect()
}

/// One kNN candidate; the heap orders by distance, worst on top.
#[derive(Debug, Copy, Clone, PartialEq)]
struct Candidate {
    distance: f32,
    id: u32,
}

impl Eq for Candidate {}

impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Candidate {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.distance
            .total_cmp(&other.distance)
            .then_with(|| self.id.cmp(&other.id))
    }
}

/// A uniform bucket grid over the frame, the in-bench candidate.
///
/// The build sizes cells so the average cell holds about k points. Build is one counting sort; a
/// query expands Chebyshev rings around its cell, keeping the k best in a bounded heap, and stops
/// once no unvisited ring can beat the current worst, so results are exact.
struct Grid {
    cell: f32,
    dim: usize,
    starts: Vec<u32>,
    ids: Vec<u32>,
    coords: Vec<[f32; 2]>,
}

impl Grid {
    /// Builds the grid over `points`, sizing cells for about `occupancy` points each.
    fn build(points: &[[f32; 2]], occupancy: usize) -> Self {
        let cells = points.len().div_ceil(occupancy).max(1);
        let dim = ((cells as f32).sqrt().ceil() as usize).max(1);
        let cell = FRAME / dim as f32;
        let cell_of = |point: &[f32; 2]| {
            let x = ((point[0] / cell) as usize).min(dim - 1);
            let y = ((point[1] / cell) as usize).min(dim - 1);
            y * dim + x
        };

        let mut starts = vec![0_u32; dim * dim + 1];
        for point in points {
            starts[cell_of(point) + 1] += 1;
        }
        for index in 1..starts.len() {
            starts[index] += starts[index - 1];
        }

        let mut cursor: Vec<u32> = starts[..dim * dim].to_vec();
        let mut ids = vec![0_u32; points.len()];
        let mut coords = vec![[0.0_f32; 2]; points.len()];
        for (id, point) in points.iter().enumerate() {
            let slot = cursor[cell_of(point)] as usize;
            cursor[cell_of(point)] += 1;
            ids[slot] = id as u32;
            coords[slot] = *point;
        }

        Self {
            cell,
            dim,
            starts,
            ids,
            coords,
        }
    }

    /// Returns the most populated cell's point count.
    fn peak_occupancy(&self) -> u32 {
        self.starts
            .windows(2)
            .map(|window| window[1] - window[0])
            .max()
            .unwrap_or(0)
    }

    /// Collects the k nearest points to `query` into `heap`, worst on top; exact, self included.
    fn nearest(&self, query: [f32; 2], k: usize, heap: &mut BinaryHeap<Candidate>) {
        heap.clear();
        let center_x = ((query[0] / self.cell) as usize).min(self.dim - 1);
        let center_y = ((query[1] / self.cell) as usize).min(self.dim - 1);
        let reach = center_x
            .max(self.dim - 1 - center_x)
            .max(center_y)
            .max(self.dim - 1 - center_y);

        for ring in 0..=reach {
            // Every cell of ring r sits at least (r - 1) cells away, so
            // a full heap whose worst lies inside that bound is final.
            if heap.len() == k && ring >= 2 {
                let bound = (ring - 1) as f32 * self.cell;
                let worst = heap.peek().expect("the heap is full").distance;
                if worst <= bound * bound {
                    break;
                }
            }
            self.ring(center_x, center_y, ring, |cell| {
                for slot in self.starts[cell] as usize..self.starts[cell + 1] as usize {
                    let point = self.coords[slot];
                    let along = point[0] - query[0];
                    let across = point[1] - query[1];
                    let distance = along.mul_add(along, across * across);
                    let candidate = Candidate {
                        distance,
                        id: self.ids[slot],
                    };
                    if heap.len() < k {
                        heap.push(candidate);
                        continue;
                    }
                    let mut worst = heap.peek_mut().expect("the heap is full");
                    if candidate < *worst {
                        *worst = candidate;
                    }
                }
            });
        }
    }

    /// Visits the in-bounds cells at Chebyshev distance `ring` from `(center_x, center_y)`.
    fn ring(&self, center_x: usize, center_y: usize, ring: usize, mut visit: impl FnMut(usize)) {
        if ring == 0 {
            visit(center_y * self.dim + center_x);
            return;
        }

        let low_x = center_x.saturating_sub(ring);
        let high_x = (center_x + ring).min(self.dim - 1);
        if center_y >= ring {
            let y = center_y - ring;
            for x in low_x..=high_x {
                visit(y * self.dim + x);
            }
        }
        if center_y + ring < self.dim {
            let y = center_y + ring;
            for x in low_x..=high_x {
                visit(y * self.dim + x);
            }
        }

        let low_y = center_y.saturating_sub(ring - 1);
        let high_y = (center_y + ring - 1).min(self.dim - 1);
        if low_y > high_y {
            return;
        }
        if center_x >= ring {
            let x = center_x - ring;
            for y in low_y..=high_y {
                visit(y * self.dim + x);
            }
        }
        if center_x + ring < self.dim {
            let x = center_x + ring;
            for y in low_y..=high_y {
                visit(y * self.dim + x);
            }
        }
    }
}

type KdTree = ImmutableKdTree<f32, u32, 2, 32>;

fn build_kiddo(points: &[[f32; 2]]) -> KdTree {
    KdTree::new_from_slice(points)
}

/// Sums neighbour ids over a full per-point sweep, so the pass has an observable result.
fn sweep_grid(grid: &Grid, points: &[[f32; 2]], k: usize) -> u64 {
    let mut heap = BinaryHeap::with_capacity(k);
    let mut sum = 0_u64;
    for &point in points {
        grid.nearest(point, k, &mut heap);
        sum += heap
            .iter()
            .map(|candidate| u64::from(candidate.id))
            .sum::<u64>();
    }
    sum
}

fn sweep_kiddo(tree: &KdTree, points: &[[f32; 2]], k: usize) -> u64 {
    let limit = NonZero::new(k).expect("the neighbour count is positive");
    points
        .iter()
        .map(|point| {
            tree.nearest_n::<SquaredEuclidean>(point, limit)
                .iter()
                .map(|neighbour| u64::from(neighbour.item))
                .sum::<u64>()
        })
        .sum()
}

/// Runs one cadence tick: builds and sweeps both lens extremes' point sets.
fn tick<E>(
    extremes: &[Vec<[f32; 2]>; 2],
    build: impl Fn(&[[f32; 2]]) -> E,
    sweep: impl Fn(&E, &[[f32; 2]]) -> u64,
) -> u64 {
    extremes
        .iter()
        .map(|points| sweep(&build(points), points))
        .sum()
}

/// Exact k nearest ids per sampled query, by brute force.
fn ground_truth(points: &[[f32; 2]], samples: &[usize], k: usize) -> Vec<Vec<u32>> {
    let mut distances: Vec<(f32, u32)> = Vec::with_capacity(points.len());
    samples
        .iter()
        .map(|&sample| {
            let query = points[sample];
            distances.clear();
            distances.extend(points.iter().enumerate().map(|(id, point)| {
                let along = point[0] - query[0];
                let across = point[1] - query[1];
                (along.mul_add(along, across * across), id as u32)
            }));
            distances.select_nth_unstable_by(k - 1, |one, other| {
                one.0.total_cmp(&other.0).then_with(|| one.1.cmp(&other.1))
            });
            let mut ids: Vec<u32> = distances[..k].iter().map(|&(_, id)| id).collect();
            ids.sort_unstable();
            ids
        })
        .collect()
}

/// The fraction of true neighbours an engine's results recover.
fn recall(truth: &[Vec<u32>], results: &[Vec<u32>], k: usize) -> f64 {
    let hits: usize = truth
        .iter()
        .zip(results)
        .map(|(expected, found)| {
            found
                .iter()
                .filter(|id| expected.binary_search(id).is_ok())
                .count()
        })
        .sum();
    hits as f64 / (truth.len() * k) as f64
}

/// Prints each engine's recall and the grid's occupancy skew.
fn report_recall(count: usize) {
    eprintln!("miner index recall audit: {count} points, k = {K}, {RECALL_SAMPLE} sampled queries");

    for shape in [Shape::Clustered, Shape::Uniform, Shape::Pathological] {
        let points = synthesize(shape, count, SEED);
        let samples: Vec<usize> = (0..RECALL_SAMPLE)
            .map(|index| index * points.len() / RECALL_SAMPLE)
            .collect();
        let truth = ground_truth(&points, &samples, K);

        let grid = Grid::build(&points, K);
        let mut heap = BinaryHeap::with_capacity(K);
        let grid_results: Vec<Vec<u32>> = samples
            .iter()
            .map(|&sample| {
                grid.nearest(points[sample], K, &mut heap);
                let mut ids: Vec<u32> = heap.iter().map(|candidate| candidate.id).collect();
                ids.sort_unstable();
                ids
            })
            .collect();

        let tree = build_kiddo(&points);
        let limit = NonZero::new(K).expect("the neighbour count is positive");
        let kiddo_results: Vec<Vec<u32>> = samples
            .iter()
            .map(|&sample| {
                let mut ids: Vec<u32> = tree
                    .nearest_n::<SquaredEuclidean>(&points[sample], limit)
                    .iter()
                    .map(|neighbour| neighbour.item)
                    .collect();
                ids.sort_unstable();
                ids
            })
            .collect();

        eprintln!(
            "  {:>12}: grid {:.4}, kiddo {:.4}; grid {}^2 cells, peak occupancy {} (mean {:.1})",
            shape.label(),
            recall(&truth, &grid_results, K),
            recall(&truth, &kiddo_results, K),
            grid.dim,
            grid.peak_occupancy(),
            points.len() as f64 / (grid.dim * grid.dim) as f64,
        );
    }
}

/// One index construction per engine and fixture, single-threaded.
fn bench_build(criterion: &mut Criterion) {
    let count = points_count();
    let mut group = criterion.benchmark_group("miner_index/build");
    group.sample_size(10);
    group.throughput(Throughput::Elements(count as u64));

    for shape in [Shape::Clustered, Shape::Uniform, Shape::Pathological] {
        let points = synthesize(shape, count, SEED);
        group.bench_function(format!("grid/{}", shape.label()), |bencher| {
            bencher.iter(|| black_box(Grid::build(black_box(&points), K).peak_occupancy()));
        });
        group.bench_function(format!("kiddo/{}", shape.label()), |bencher| {
            bencher.iter(|| black_box(build_kiddo(black_box(&points)).size()));
        });
    }

    group.finish();
}

/// One full per-point kNN sweep per engine and fixture.
fn bench_sweep(criterion: &mut Criterion) {
    let count = points_count();
    let mut group = criterion.benchmark_group("miner_index/sweep");
    group.sample_size(10);
    group.throughput(Throughput::Elements(count as u64));

    for shape in [Shape::Clustered, Shape::Uniform, Shape::Pathological] {
        let points = synthesize(shape, count, SEED);

        let grid = Grid::build(&points, K);
        group.bench_function(format!("grid/{}", shape.label()), |bencher| {
            bencher.iter(|| black_box(sweep_grid(&grid, black_box(&points), K)));
        });

        let tree = build_kiddo(&points);
        group.bench_function(format!("kiddo/{}", shape.label()), |bencher| {
            bencher.iter(|| black_box(sweep_kiddo(&tree, black_box(&points), K)));
        });
    }

    group.finish();
}

/// Times the cadence-tick unit of two builds plus two sweeps on the clustered shape.
fn bench_tick(criterion: &mut Criterion) {
    let count = points_count();
    let extremes = [
        synthesize(Shape::Clustered, count, SEED),
        synthesize(Shape::Clustered, count, SEED_EXTREME),
    ];

    let mut group = criterion.benchmark_group("miner_index/tick");
    group.sample_size(10);
    group.throughput(Throughput::Elements(2 * count as u64));

    group.bench_function("grid", |bencher| {
        bencher.iter(|| {
            black_box(tick(
                &extremes,
                |points| Grid::build(points, K),
                |grid, points| sweep_grid(grid, points, K),
            ));
        });
    });
    group.bench_function("kiddo", |bencher| {
        bencher.iter(|| {
            black_box(tick(&extremes, build_kiddo, |tree, points| {
                sweep_kiddo(tree, points, K)
            }));
        });
    });

    group.finish();
}

/// One eighth of the measured live link volume; the resulting row domain times the candidate width
/// lands the sweep in the millions of probe pairs.
const JUDGE_LINKS: usize = 275_000;

/// Times the access layouts a mined sweep's protection vetting can take, per hit rate.
fn bench_judge(criterion: &mut Criterion) {
    let corpus = production_corpus(Profile::Live, JUDGE_LINKS, SEED);
    let per_row = NonZero::new(K).expect("the candidate width is positive");

    let mut group = criterion.benchmark_group("miner_index/judge");
    group.sample_size(10);

    // Mining candidates are close 2D points: attraction pulls linked pairs together, so the
    // realistic sweep is partner-rich; the uniform sweep bounds the layouts' spread from the
    // other side.
    for (label, fraction) in [("uniform", 0.0), ("linked", 0.5)] {
        let probes = corpus.judge_probes::<Xoshiro256PlusPlus>(per_row, fraction, SEED);
        group.throughput(Throughput::Elements(probes.pairs() as u64));

        group.bench_function(format!("pointwise/{label}"), |bencher| {
            bencher.iter(|| black_box(corpus.judge_pointwise(black_box(&probes))));
        });
        group.bench_function(format!("by_row/{label}"), |bencher| {
            bencher.iter(|| black_box(corpus.judge_by_row(black_box(&probes))));
        });
    }

    group.finish();
}

fn config() -> Criterion {
    Criterion::default()
        .warm_up_time(Duration::from_millis(500))
        .measurement_time(Duration::from_secs(10))
}

fn benches_with_report(criterion: &mut Criterion) {
    report_recall(points_count());
    bench_build(criterion);
    bench_sweep(criterion);
    bench_tick(criterion);
    bench_judge(criterion);
}

criterion_group!(
    name = benches;
    config = config();
    targets = benches_with_report
);
criterion_main!(benches);
