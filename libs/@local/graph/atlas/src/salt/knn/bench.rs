//! Measurement seam for the search-backend parameter sweep.
//!
//! [`sweep`] reads the active generation's representation matrix and measures the hannoy backend
//! across a grid of `ef_construction` and `ef_search` values, replaying the production fit's exact
//! random streams per fit seed (`Stage::KnnLink` for the build, `Stage::RecallCheck` for the
//! sample), so a grid point reproduces what a live fit at that seed and setting would have
//! measured. Repeating a seed in the grid rebuilds the same configuration twice, separating build
//! nondeterminism from seed spread.
//!
//! The exact reference is computed once per distinct seed and scores every grid point; `ef_search`
//! is a query-time setting, so one build serves its whole search row by reopening the persisted
//! environment. Nothing here is API for consumers of the crate.
//!
//! Failures panic with the failing step's error: a measurement run has no recovery path, and the
//! error is the diagnosis.

use alloc::borrow::Cow;
use core::{num::NonZero, time::Duration};
use std::time::Instant;

use camino::{Utf8Path, Utf8PathBuf};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    Embedding, NearestNeighboursIndex as _,
    hannoy::{HannoyIndex, HannoyIndexOptions},
    recall::{ExactReference, SpotCheckOptions},
};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    file::{array::ArrayFile, generation::GenerationRoot},
    math::AlignedVecN,
    salt::fit::{Stage, stage_rng},
};

const DEFAULT_SEEDS: &[u64] = &[0, 0, 1, 2];
const DEFAULT_CONSTRUCTIONS: &[usize] = &[128, 256];
const DEFAULT_SEARCHES: &[usize] = &[64, 128, 192, 256];

// Fixed reference size: the sweep compares settings against each
// other, so its samples are sized once (SE ~0.007 at the measured
// per-row deviation, resolving the construction effect) rather than
// per-reading like the production check's two-stage procedure.
const REFERENCE_ROWS: NonZero<usize> = NonZero::new(2_048).expect("the reference size is nonzero");

/// The sweep grid.
#[derive(Debug, Clone)]
pub struct SweepOptions {
    /// Fit seeds whose build and sample streams are replayed. A repeated seed rebuilds the same configuration again, measuring build nondeterminism.
    pub seeds: Cow<'static, [u64]> = Cow::Borrowed(DEFAULT_SEEDS),
    /// `ef_construction` values; one index build per (seed, value).
    pub constructions: Cow<'static, [usize]> = Cow::Borrowed(DEFAULT_CONSTRUCTIONS),
    /// `ef_search` values, swept per built index.
    pub searches: Cow<'static, [usize]> = Cow::Borrowed(DEFAULT_SEARCHES),
}

const impl Default for SweepOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// One `ef_search` reading of one built index against one sample.
///
/// The production check reads the diagonal - a build scored against its own seed's sample;
/// off-diagonal readings separate build quality from sample hardness.
#[derive(Debug, Copy, Clone)]
pub struct SweepPoint {
    /// The fit seed whose `recall-check` stream drew the sample.
    pub sample_seed: u64,
    /// The query-time frontier breadth the reading was taken at.
    pub ef_search: usize,
    /// Aggregate recall@50 against the exact reference.
    pub recall: f64,
    /// Wall clock of the scoring pass (sampled queries, parallel).
    pub query_wall: Duration,
}

/// One index build and its search-breadth readings.
#[derive(Debug, Clone)]
pub struct SweepBuild {
    /// The fit seed whose `knn-link` stream drove the build.
    pub seed: u64,
    /// The build-time frontier breadth.
    pub ef_construction: usize,
    /// Wall clock of insert plus link.
    pub build_wall: Duration,
    /// One reading per `ef_search` value, in grid order.
    pub points: Vec<SweepPoint>,
}

/// The exact reference's cost for one distinct seed.
#[derive(Debug, Copy, Clone)]
pub struct ReferenceCost {
    /// The fit seed whose `recall-check` stream drew the sample.
    pub seed: u64,
    /// Wall clock of the brute-force rankings (parallel).
    pub wall: Duration,
}

/// One finished sweep: the corpus identity and every reading.
#[derive(Debug, Clone)]
pub struct BackendSweep {
    /// The assessed generation's identity, in directory-name form.
    pub generation: String,
    /// The corpus row count.
    pub rows: usize,
    /// Sampled query rows per reference.
    pub sampled_rows: usize,
    /// Exact neighbours compared per query: the `k` of recall@k.
    pub neighbours: usize,
    /// Brute-force reference costs, one per distinct seed.
    pub references: Vec<ReferenceCost>,
    /// One entry per (seed, `ef_construction`) build, in grid order.
    pub builds: Vec<SweepBuild>,
}

/// Sweeps the backend grid over the active generation's representations.
///
/// # Panics
///
/// Panics when the root, pointer, generation, or representation matrix cannot be opened, or when a
/// build or query fails; a measurement target reports its failures by failing.
pub fn sweep(root: &str, options: &SweepOptions) -> BackendSweep {
    let root =
        GenerationRoot::new(Utf8PathBuf::from(root)).expect("the generation root should open");
    let id = root
        .current()
        .expect("the current pointer should read")
        .expect("a sweep requires an activated generation");
    let generation = root.open(id).expect("the active generation should open");

    let file =
        ArrayFile::open(generation.path_of(&generation.repository().files.representations.name))
            .expect("the representation artifact should open");
    let embeddings = file
        .vectors::<PROJECTOR_DIMENSIONS>()
        .expect("the representation artifact holds f32 rows of the projector width");

    let check = SpotCheckOptions::default();
    let scratch = root.scratch().expect("the scratch directory should create");

    // Every distinct seed's sample, in first-appearance order: each
    // build scores against all of them, so build quality and sample
    // hardness read separately.
    let mut references: Vec<(u64, ExactReference)> = Vec::new();
    let mut reference_costs = Vec::new();
    for &seed in &*options.seeds {
        if references.iter().any(|&(known, _)| known == seed) {
            continue;
        }
        let started = Instant::now();
        let reference = ExactReference::new::<!>(
            embeddings,
            check.neighbours,
            REFERENCE_ROWS,
            stage_rng(seed, Stage::RecallCheck),
        )
        .expect("the corpus holds at least two rows");
        let wall = started.elapsed();
        tracing::info!(
            seed,
            wall_s = wall.as_secs_f64(),
            "exact reference computed"
        );
        reference_costs.push(ReferenceCost { seed, wall });
        references.push((seed, reference));
    }

    let mut builds = Vec::new();
    for (ordinal, &seed) in options.seeds.iter().enumerate() {
        for &ef_construction in &*options.constructions {
            let directory = scratch
                .directory(&format!("knn-sweep-{ordinal}-{ef_construction}"))
                .expect("the index directory should create");

            let build_wall = build_index(
                &directory,
                embeddings,
                ef_construction,
                stage_rng(seed, Stage::KnnLink),
            );
            tracing::info!(
                seed,
                ef_construction,
                wall_s = build_wall.as_secs_f64(),
                "index built"
            );

            let points = score_grid(&directory, &references, ef_construction, options);

            // Bounds peak disk to one environment; the scratch drop
            // would also remove it at the end of the sweep.
            std::fs::remove_dir_all(&directory).expect("the index directory should remove");

            builds.push(SweepBuild {
                seed,
                ef_construction,
                build_wall,
                points,
            });
        }
    }
    drop(scratch);

    let sampled_rows = references
        .first()
        .map_or(0, |(_, reference)| reference.sampled_rows());
    let neighbours = references
        .first()
        .map_or(0, |(_, reference)| reference.neighbours_per_row());

    BackendSweep {
        generation: id.to_string(),
        rows: embeddings.len(),
        sampled_rows,
        neighbours,
        references: reference_costs,
        builds,
    }
}

/// Inserts every row and links the index; returns the wall clock.
fn build_index(
    directory: &Utf8Path,
    embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    ef_construction: usize,
    rng: Xoshiro256PlusPlus,
) -> Duration {
    let started = Instant::now();

    let mut index = HannoyIndex::new(
        directory,
        HannoyIndexOptions {
            ef_construction,
            ..
        },
    )
    .expect("the index environment should open");
    index
        .insert_many(
            embeddings
                .iter()
                .enumerate()
                .map(|(row, components)| Embedding {
                    id: NodeRowId::new(row as u64),
                    components,
                }),
        )
        .expect("every row should insert");
    index.build(rng).expect("the index should build");

    started.elapsed()
}

/// Scores the built index at every (sample, `ef_search`) pair by reopening the persisted
/// environment per search breadth.
fn score_grid(
    directory: &Utf8Path,
    references: &[(u64, ExactReference)],
    ef_construction: usize,
    options: &SweepOptions,
) -> Vec<SweepPoint> {
    options
        .searches
        .iter()
        .flat_map(|&ef_search| {
            let index = HannoyIndex::new(
                directory,
                HannoyIndexOptions {
                    ef_construction,
                    ef_search,
                    ..
                },
            )
            .expect("the built environment should reopen");

            references.iter().map(move |(sample_seed, reference)| {
                let started = Instant::now();
                let reading = reference
                    .score(&index)
                    .expect("every sampled query should answer");
                let query_wall = started.elapsed();
                tracing::info!(
                    ef_construction,
                    ef_search,
                    sample_seed,
                    recall = reading.recall(),
                    wall_s = query_wall.as_secs_f64(),
                    "grid point read"
                );

                SweepPoint {
                    sample_seed: *sample_seed,
                    ef_search,
                    recall: reading.recall(),
                    query_wall,
                }
            })
        })
        .collect()
}
