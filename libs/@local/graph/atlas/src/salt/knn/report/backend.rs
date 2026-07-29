//! The search-backend parameter sweep over a published generation.
//!
//! One hannoy index is built per (fit seed, `ef_construction`) grid cell and scored at every
//! `ef_search` value against the exact reference of every distinct seed's sample. `ef_search` is a
//! query-time setting, so one build serves its whole search row by reopening the persisted
//! environment, and the environment is removed as soon as its row is read, bounding peak disk to
//! one index.
//!
//! The production check reads the grid's diagonal - a build scored against its own seed's sample;
//! off-diagonal readings separate build quality from sample hardness, and the sweep's decision
//! surface is the worst recall a setting produced anywhere in the grid.

use alloc::borrow::Cow;
use core::{
    error::Error,
    fmt::{self, Display},
    time::Duration,
};
use std::{io, time::Instant};

use camino::Utf8Path;
use hashql_core::id::IdSlice;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{REFERENCE_ROWS, Seconds, SetupError, open_representations, representation_rows};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::generation::{GenerationId, GenerationRoot},
    identity::NodeRowId,
    math::AlignedVecN,
    progress::NoProgress,
    salt::{
        fit::{Stage, stage_rng},
        knn::{
            Embedding, NearestNeighboursIndex as _,
            error::KnnError,
            hannoy::{HannoyIndex, HannoyIndexError, HannoyIndexOptions},
            recall::{ExactReference, SpotCheckOptions},
        },
    },
};

/// Fit seeds the sweep replays by default: three distinct seeds, one of them twice, so the grid
/// carries both build nondeterminism and seed spread.
pub(crate) const DEFAULT_SEEDS: &[u64] = &[0, 0, 1, 2];
/// `ef_construction` values swept by default: the deployed setting and the one below it.
pub(crate) const DEFAULT_CONSTRUCTIONS: &[usize] = &[128, 256];
/// `ef_search` values swept by default: the deployed setting, one below, and two above.
pub(crate) const DEFAULT_SEARCHES: &[usize] = &[64, 128, 192, 256];

/// The sweep grid.
#[derive(Debug, Clone)]
pub(crate) struct Options {
    /// Fit seeds whose build and sample streams are replayed.
    ///
    /// A repeated seed rebuilds the same configuration again, measuring build nondeterminism.
    pub seeds: Cow<'static, [u64]> = Cow::Borrowed(DEFAULT_SEEDS),
    /// `ef_construction` values; one index build per (seed, value).
    pub constructions: Cow<'static, [usize]> = Cow::Borrowed(DEFAULT_CONSTRUCTIONS),
    /// `ef_search` values, swept per built index.
    pub searches: Cow<'static, [usize]> = Cow::Borrowed(DEFAULT_SEARCHES),
}

const impl Default for Options {
    fn default() -> Self {
        Self { .. }
    }
}

/// One `ef_search` reading of one built index against one sample.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Point {
    /// The fit seed whose `recall-check` stream drew the sample.
    pub sample_seed: u64,
    /// The query-time frontier breadth the reading was taken at.
    pub ef_search: usize,
    /// Aggregate recall@50 against the exact reference.
    pub recall: f64,
    /// Wall clock of the scoring pass (sampled queries, parallel).
    pub wall: Duration,
}

/// One index build and its search-breadth readings.
#[derive(Debug, Clone)]
pub(crate) struct Build {
    /// The fit seed whose `knn-link` stream drove the build.
    pub seed: u64,
    /// The build-time frontier breadth.
    pub ef_construction: usize,
    /// Wall clock of insert plus link.
    pub wall: Duration,
    /// One reading per `ef_search` value, in grid order.
    pub points: Vec<Point>,
}

/// The exact reference's cost for one distinct seed.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ReferenceCost {
    /// The fit seed whose `recall-check` stream drew the sample.
    pub seed: u64,
    /// Wall clock of the brute-force rankings (parallel).
    pub wall: Duration,
}

/// One finished sweep: the corpus identity and every reading.
#[derive(Debug, Clone)]
pub(crate) struct Sweep {
    /// The measured generation's identity.
    pub generation: GenerationId,
    /// The corpus row count.
    pub rows: usize,
    /// Sampled query rows per reference.
    pub sampled_rows: usize,
    /// Exact neighbours compared per query: the `k` of recall@k.
    pub neighbours: usize,
    /// Brute-force reference costs, one per distinct seed.
    pub references: Vec<ReferenceCost>,
    /// One entry per (seed, `ef_construction`) build, in grid order.
    pub builds: Vec<Build>,
    /// Wall clock of the whole sweep.
    pub wall: Duration,
}

impl Sweep {
    /// The swept `ef_construction` values, in grid order.
    fn constructions(&self) -> impl IntoIterator<Item = usize> {
        let mut values: Vec<usize> = Vec::new();
        for build in &self.builds {
            if !values.contains(&build.ef_construction) {
                values.push(build.ef_construction);
            }
        }
        values
    }

    /// The swept `ef_search` values, in grid order.
    fn searches(&self) -> impl IntoIterator<Item = usize> {
        let mut values: Vec<usize> = Vec::new();
        for point in self.builds.iter().flat_map(|build| &build.points) {
            if !values.contains(&point.ef_search) {
                values.push(point.ef_search);
            }
        }
        values
    }

    /// The worst recall one setting produced across every build and sample that measured it.
    ///
    /// The sweep's decision surface: a setting is admitted on what it guarantees, not on its best
    /// grid cell.
    fn minimum_recall(&self, ef_construction: usize, ef_search: usize) -> f64 {
        self.builds
            .iter()
            .filter(|build| build.ef_construction == ef_construction)
            .flat_map(|build| &build.points)
            .filter(|point| point.ef_search == ef_search)
            .map(|point| point.recall)
            .fold(f64::INFINITY, f64::min)
    }
}

impl Display for Sweep {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(
            fmt,
            "generation  {}  rows {}  recall@{} over {} sampled queries",
            self.generation, self.rows, self.neighbours, self.sampled_rows,
        )?;
        for cost in &self.references {
            writeln!(
                fmt,
                "reference   seed {}  {} brute force",
                cost.seed,
                Seconds::new(cost.wall),
            )?;
        }

        writeln!(fmt)?;
        writeln!(
            fmt,
            "build seed  efc   build wall   readings (ef@sample: recall)"
        )?;
        for build in &self.builds {
            write!(
                fmt,
                "{:<11} {:<5} {:>11}   ",
                build.seed,
                build.ef_construction,
                Seconds::new(build.wall),
            )?;
            for point in &build.points {
                write!(
                    fmt,
                    "{}@{}: {:.4}   ",
                    point.ef_search, point.sample_seed, point.recall,
                )?;
            }
            writeln!(fmt)?;
        }

        writeln!(fmt)?;
        writeln!(fmt, "minimum recall across builds and samples")?;
        writeln!(fmt, "efc   ef     recall")?;
        for ef_construction in self.constructions() {
            for ef_search in self.searches() {
                writeln!(
                    fmt,
                    "{:<5} {:<6} {:.4}",
                    ef_construction,
                    ef_search,
                    self.minimum_recall(ef_construction, ef_search),
                )?;
            }
        }

        writeln!(fmt)?;
        write!(fmt, "wall        {}", Seconds::new(self.wall))
    }
}

/// One sweep's failure, by step.
#[derive(Debug)]
pub(crate) enum SweepError {
    /// The published representations could not be read.
    Setup(SetupError),
    /// The scratch directory for an index could not be created or removed.
    Scratch(io::Error),
    /// The exact reference could not be computed.
    Reference(KnnError<NodeRowId, !>),
    /// The index could not be opened, filled, or linked.
    Index(HannoyIndexError<NodeRowId>),
    /// A scored query failed against the built index.
    Query(KnnError<NodeRowId, HannoyIndexError<NodeRowId>>),
}

impl Display for SweepError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Setup(error) => Display::fmt(error, fmt),
            Self::Scratch(_) => fmt.write_str("the index scratch directory could not be prepared"),
            Self::Reference(_) => fmt.write_str("the exact reference could not be computed"),
            Self::Index(_) => fmt.write_str("the swept index could not be built"),
            Self::Query(_) => fmt.write_str("the built index could not answer a sampled query"),
        }
    }
}

impl Error for SweepError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Setup(error) => error.source(),
            Self::Scratch(error) => Some(error),
            Self::Reference(error) => Some(error),
            Self::Index(error) => Some(error),
            Self::Query(error) => Some(error),
        }
    }
}

/// Inserts every row and links the index; returns the wall clock.
///
/// # Errors
///
/// Returns the backend's error when the environment cannot open, a row cannot insert, or the link
/// pass fails.
fn build_index(
    directory: &Utf8Path,
    embeddings: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    ef_construction: usize,
    rng: Xoshiro256PlusPlus,
) -> Result<Duration, HannoyIndexError<NodeRowId>> {
    let started = Instant::now();

    let mut index = HannoyIndex::new(
        directory,
        HannoyIndexOptions {
            ef_construction,
            ..
        },
    )
    .map_err(HannoyIndexError::widen)?;
    index.insert_many(
        embeddings
            .iter_enumerated()
            .map(|(row, components)| Embedding {
                id: row,
                components,
            }),
    )?;
    index.build(rng, &NoProgress)?;

    Ok(started.elapsed())
}

/// Scores the built index at every (sample, `ef_search`) pair.
///
/// Reopens the persisted environment per search breadth.
///
/// # Errors
///
/// Returns a [`SweepError`] when the environment cannot reopen or a sampled query fails.
fn score_grid(
    directory: &Utf8Path,
    references: &[(u64, ExactReference<NodeRowId>)],
    ef_construction: usize,
    options: &Options,
) -> Result<Vec<Point>, SweepError> {
    let mut points = Vec::new();
    for &ef_search in &*options.searches {
        let index = HannoyIndex::new(
            directory,
            HannoyIndexOptions {
                ef_construction,
                ef_search,
                ..
            },
        )
        .map_err(|error| SweepError::Index(error.widen()))?;

        for (sample_seed, reference) in references {
            let started = Instant::now();
            let reading = reference.score(&index).map_err(SweepError::Query)?;
            let query_wall = started.elapsed();
            tracing::info!(
                ef_construction,
                ef_search,
                sample_seed,
                recall = reading.recall(),
                wall_s = query_wall.as_secs_f64(),
                "grid point read"
            );

            points.push(Point {
                sample_seed: *sample_seed,
                ef_search,
                recall: reading.recall(),
                wall: query_wall,
            });
        }
    }

    Ok(points)
}

/// Sweeps the backend grid over the active generation's representations.
///
/// # Errors
///
/// Returns a [`SweepError`] when the representations cannot be read, an index cannot be built, or
/// a sampled query fails.
pub(crate) fn sweep(root: &GenerationRoot, options: &Options) -> Result<Sweep, SweepError> {
    let started = Instant::now();

    let (id, file) = open_representations(root).map_err(SweepError::Setup)?;
    let embeddings = representation_rows(&file).map_err(SweepError::Setup)?;

    let check = SpotCheckOptions::default();
    let scratch = root.scratch().map_err(SweepError::Scratch)?;

    // Every distinct seed's sample, in first-appearance order: each
    // build scores against all of them, so build quality and sample
    // hardness read separately.
    let mut references: Vec<(u64, ExactReference<NodeRowId>)> = Vec::new();
    let mut reference_costs = Vec::new();
    for &seed in &*options.seeds {
        if references.iter().any(|&(known, _)| known == seed) {
            continue;
        }
        let measured = Instant::now();
        let reference = ExactReference::new::<!>(
            embeddings,
            check.neighbours,
            REFERENCE_ROWS,
            stage_rng(seed, Stage::RecallCheck),
        )
        .map_err(SweepError::Reference)?;
        let wall = measured.elapsed();
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
                .map_err(SweepError::Scratch)?;

            let build_wall = build_index(
                &directory,
                embeddings,
                ef_construction,
                stage_rng(seed, Stage::KnnLink),
            )
            .map_err(SweepError::Index)?;
            tracing::info!(
                seed,
                ef_construction,
                wall_s = build_wall.as_secs_f64(),
                "index built"
            );

            let points = score_grid(&directory, &references, ef_construction, options)?;

            // Bounds peak disk to one environment; the scratch drop
            // would also remove it at the end of the sweep.
            std::fs::remove_dir_all(&directory).map_err(SweepError::Scratch)?;

            builds.push(Build {
                seed,
                ef_construction,
                wall: build_wall,
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

    Ok(Sweep {
        generation: id,
        rows: embeddings.len(),
        sampled_rows,
        neighbours,
        references: reference_costs,
        builds,
        wall: started.elapsed(),
    })
}
