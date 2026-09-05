//! The search-backend parameter sweep over a published generation.
//!
//! The sweep builds one hannoy index per (fit seed, `ef_construction`) grid cell and scores it at
//! every `ef_search` value against the exact reference of every distinct seed's sample. `ef_search`
//! is a query-time setting, so one build serves its whole search row by reopening the persisted
//! environment. The sweep removes the environment as soon as it finishes that row, which keeps peak
//! disk at one index.
//!
//! The production check reads the grid's diagonal, a build scored against its own seed's sample.
//! Off-diagonal readings separate build quality from sample hardness, and the sweep's decision
//! surface is the worst recall a setting produced anywhere in the grid.

use alloc::borrow::Cow;
use core::{
    error::Error,
    fmt::{self, Display},
    time::Duration,
};
use std::{io, time::Instant};

use camino::Utf8PathBuf;
use hashql_core::id::IdSlice;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{REFERENCE_ROWS, Representations, Seconds, SetupError};
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

/// Fit seeds the sweep replays by default.
///
/// The list holds three distinct seeds and repeats one of them, so the grid carries both build
/// nondeterminism and seed spread.
pub(crate) const DEFAULT_SEEDS: &[u64] = &[0, 0, 1, 2];
/// `ef_construction` values swept by default: the deployed setting and the one below it.
pub(crate) const DEFAULT_CONSTRUCTIONS: &[usize] = &[128, 256];
/// `ef_search` values swept by default.
///
/// The list covers the deployed setting, one value below it, and two above.
pub(crate) const DEFAULT_SEARCHES: &[usize] = &[64, 128, 192, 256];

// The grids are pinned sweep designs rather than derivations, so comparability against recorded
// full-scale sweeps survives a deployment change. This holds the doc claims above to the deployed
// values: a moved default fails compilation here instead of silently leaving the swept grid
// without the deployed setting.
const _: () = {
    const fn contains(values: &[usize], value: usize) -> bool {
        let mut index = 0;
        while index < values.len() {
            if values[index] == value {
                return true;
            }
            index += 1;
        }
        false
    }

    let deployed = HannoyIndexOptions::default();
    assert!(contains(DEFAULT_CONSTRUCTIONS, deployed.ef_construction));
    assert!(contains(DEFAULT_SEARCHES, deployed.ef_search));
};

/// The sweep grid.
#[derive(Debug, Clone)]
pub(crate) struct Options {
    /// Fit seeds whose build and sample streams the sweep replays.
    ///
    /// A repeated seed rebuilds the same configuration again, measuring build nondeterminism.
    pub seeds: Cow<'static, [u64]> = Cow::Borrowed(DEFAULT_SEEDS),
    /// `ef_construction` values, with one index build per (seed, value).
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
    /// The query-time frontier breadth of this reading.
    pub ef_search: usize,
    /// Aggregate recall@50 against the exact reference.
    pub recall: f64,
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

/// One finished sweep of the backend grid, with its corpus identity and every reading.
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
    /// This reading is the sweep's decision surface, because a setting earns admission on what it
    /// guarantees rather than on its best grid cell.
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
    /// Reading the published representations failed.
    Setup(SetupError),
    /// Creating or removing an index's scratch directory failed.
    Scratch(io::Error),
    /// Computing the exact reference failed.
    Reference(KnnError<NodeRowId, !>),
    /// Opening, filling, or linking the index failed.
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

/// An index persisted into its scratch directory, bound to the breadth it was built at.
///
/// Scoring reopens the environment with this breadth, so the reopened options describe the index
/// that exists on disk. [`Self::remove`] consumes the value together with the directory it names.
struct BuiltIndex {
    /// The scratch directory holding the persisted environment.
    directory: Utf8PathBuf,
    /// The breadth the index was built at.
    ef_construction: usize,
    /// The build's wall clock.
    wall: Duration,
}

impl BuiltIndex {
    /// Removes the persisted environment, consuming the value that names it.
    ///
    /// # Errors
    ///
    /// Returns the underlying I/O error when removing the directory fails.
    fn remove(self) -> io::Result<()> {
        std::fs::remove_dir_all(&self.directory)
    }
}

/// Inserts every row and links the index, returning it bound to its directory and breadth.
///
/// # Errors
///
/// Returns the backend's error when the environment cannot open, a row cannot insert, or the link
/// pass fails.
fn build_index(
    directory: Utf8PathBuf,
    embeddings: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    ef_construction: usize,
    rng: Xoshiro256PlusPlus,
) -> Result<BuiltIndex, HannoyIndexError<NodeRowId>> {
    let started = Instant::now();

    let mut index = HannoyIndex::new(
        &directory,
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

    Ok(BuiltIndex {
        directory,
        ef_construction,
        wall: started.elapsed(),
    })
}

/// Scores the built index at every (sample, `ef_search`) pair.
///
/// Reopens the persisted environment per search breadth, at the build breadth the index carries.
///
/// # Errors
///
/// Returns a [`SweepError`] when the environment cannot reopen or a sampled query fails.
fn score_grid(
    built: &BuiltIndex,
    references: &[(u64, ExactReference<NodeRowId>)],
    searches: &[usize],
) -> Result<Vec<Point>, SweepError> {
    let mut points = Vec::new();
    for &ef_search in searches {
        let index = HannoyIndex::new(
            &built.directory,
            HannoyIndexOptions {
                ef_construction: built.ef_construction,
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
                ef_construction = built.ef_construction,
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
            });
        }
    }

    Ok(points)
}

/// Sweeps the backend grid over the active generation's representations.
///
/// # Errors
///
/// Returns a [`SweepError`] when reading the representations fails, when an index build fails, or
/// when a sampled query fails.
pub(crate) fn sweep(root: &GenerationRoot, options: &Options) -> Result<Sweep, SweepError> {
    let started = Instant::now();

    let representations = Representations::open(root).map_err(SweepError::Setup)?;
    let embeddings = representations.rows().map_err(SweepError::Setup)?;

    let check = SpotCheckOptions::default();
    let scratch = root.scratch().map_err(SweepError::Scratch)?;

    // Every distinct seed's sample, in first-appearance order. Each build scores against all of
    // them, so the readings separate build quality from sample hardness.
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

            let built = build_index(
                directory,
                embeddings,
                ef_construction,
                stage_rng(seed, Stage::KnnLink),
            )
            .map_err(SweepError::Index)?;
            tracing::info!(
                seed,
                ef_construction,
                wall_s = built.wall.as_secs_f64(),
                "index built"
            );

            let points = score_grid(&built, &references, &options.searches)?;

            let wall = built.wall;
            // Bounds peak disk to one environment. The scratch drop would also remove the
            // directory at the end of the sweep.
            built.remove().map_err(SweepError::Scratch)?;

            builds.push(Build {
                seed,
                ef_construction,
                wall,
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
        generation: representations.generation,
        rows: embeddings.len(),
        sampled_rows,
        neighbours,
        references: reference_costs,
        builds,
        wall: started.elapsed(),
    })
}
