//! LMDB-backed HNSW behind the nearest-neighbours seam.
//!
//! [`HannoyIndex`] adapts one [hannoy] index inside one [heed] LMDB environment to
//! [`NearestNeighboursIndex`]. The environment lives in a directory guarded by an advisory file
//! lock, so one process owns the index at a time. Item keys are node rows narrowed to hannoy's
//! `u32` key space; a generation whose row count exceeds `u32::MAX` does not fit this backend.
//!
//! Backend distances are rescaled onto the crate's `[0, 2]` cosine scale before they cross the
//! seam, and results are ordered by ascending `(distance, id)`.

use core::{error::Error, fmt, num::TryFromIntError};
use std::{
    fs::{File, TryLockError},
    io,
};

use camino::Utf8Path;
use hannoy::{Database, Reader, Writer, distances::Cosine};
use hashql_core::id::Id;
use heed::{Env, EnvOpenOptions};
use rand::{Rng, SeedableRng};

use super::{Embedding, NearestNeighboursIndex, Neighbour};
use crate::{dataset::PROJECTOR_DIMENSIONS, math::AlignedVecN, progress::Progress, random::Compat};

/// Reports the backend's own build phases to the run's observer.
///
/// hannoy names its build steps through [`steppe::Progress`], whose implementors are `'static`, so
/// the builder owns its reporter for the length of the build and the bridge cannot borrow the
/// run's observer. It carries the observer's detached half instead. Only the step's name crosses
/// the seam: hannoy hands its counted sub-step once, before its counter has moved, so the position
/// it carries is always zero and reporting it would describe the phase's progress falsely.
struct BuildPhases<D>(D);

impl<D> steppe::Progress for BuildPhases<D>
where
    D: Progress + Send + Sync + 'static,
{
    fn update(&self, sub_progress: impl steppe::Step) {
        self.0.knn_build_phase(&sub_progress.name());
    }
}

// HNSW connectivity, hannoy build-time const generics: M links per
// node on the upper layers, M0 on the ground layer. M = 16 with
// M0 = 2 · M follows the Malkov-Yashunin paper's defaults (reasonable
// M range 5-48; higher values pay off only for extreme recall or
// dimensionality); the recall spot check is the per-corpus arbiter.
#[expect(
    clippy::min_ident_chars,
    reason = "M is the canonical HNSW connectivity name"
)]
const M: usize = 16;
const M0: usize = 32;

// One environment carries one index.
const INDEX: u16 = 0;

const DEFAULT_MAP_SIZE: usize = 1 << 40;

// Sized by a full-scale sweep (985,932 rows, recall@50, exact references replaying the fit's
// streams): construction 128 -> 256 buys ~+0.009 sampled aggregate recall (~0.893 -> ~0.902 against
// the 0.89 floor) for ~+90s build (155 -> 245s), and same-seed rebuilds spread ±0.007 (hannoy links
// in parallel; the seed pins the level stream, not the link order), so the margin must clear that
// spread. Search breadth measured inert: 64 -> 256 bought +0.002-0.005 on every build at 2.2x query
// cost, so 128 stays - it is 2.5x the deepest query in this crate (the 50-neighbour recall audit)
// and above hannoy's default of 100. Sweep instrument: `report::backend` (`report knn-backend`);
// raise construction before search on a failed recall check.
const DEFAULT_EF_CONSTRUCTION: usize = 256;
const DEFAULT_EF_SEARCH: usize = 128;

/// Pinned hannoy storage, build, and query settings.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct HannoyIndexOptions {
    /// Upper bound of the LMDB memory map, in bytes.
    ///
    /// The map is a virtual-address reservation, not an allocation: pages materialize as the index
    /// writes them, so the bound costs nothing until it is reached. A write beyond it fails with an
    /// [`MDB_MAP_FULL`](heed::MdbError::MapFull) environment error, and the remedy is a larger
    /// bound. The 1 TiB default covers roughly 4 KiB per item at [`PROJECTOR_DIMENSIONS`], two
    /// orders of magnitude beyond a million-row generation.
    pub map_size: usize = DEFAULT_MAP_SIZE,
    /// Breadth of the candidate frontier while linking one item into the graph.
    ///
    /// Larger values buy link quality with one-time build cost, and link quality bounds the recall
    /// any search breadth can reach afterwards.
    pub ef_construction: usize = DEFAULT_EF_CONSTRUCTION,
    /// Breadth of the candidate frontier while searching.
    ///
    /// A search never runs below the requested neighbour count. Larger values buy recall with
    /// per-query cost, and the recall spot check is the arbiter of whether a setting suffices.
    pub ef_search: usize = DEFAULT_EF_SEARCH,
}

const impl Default for HannoyIndexOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// The [`HannoyIndex`] backend failed.
///
/// The message names the failing surface - index, environment, lock file, or key space - and the
/// concrete fault chains beneath through [`Error::source`].
// The private field keeps hannoy's and heed's types out of the public
// interface: both are private dependencies.
#[derive(Debug)]
pub struct HannoyIndexError<N>(IndexFault<N>);

impl<N> HannoyIndexError<N> {
    /// Maps the row the error names into another row domain.
    pub(crate) fn map_rows<M>(self, row: impl FnOnce(N) -> M) -> HannoyIndexError<M> {
        HannoyIndexError(self.0.map_rows(row))
    }
}

impl HannoyIndexError<!> {
    /// Widens the never-typed error into any row domain: no variant names a row.
    pub(crate) fn widen<N>(self) -> HannoyIndexError<N> {
        HannoyIndexError(self.0.widen())
    }
}

impl<N> fmt::Display for HannoyIndexError<N>
where
    N: fmt::Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<N> Error for HannoyIndexError<N>
where
    N: fmt::Debug + fmt::Display,
{
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        self.0.source()
    }
}

/// The backend's concrete faults.
#[derive(Debug)]
enum IndexFault<N> {
    /// The index rejected an operation.
    Hannoy(hannoy::Error),
    /// The LMDB environment rejected an operation.
    Heed(heed::Error),
    /// The lock file could not be created.
    Io(io::Error),
    /// Another handle holds the environment's lock file.
    Locked(TryLockError),
    /// A node row does not fit hannoy's `u32` item-key space.
    RowOutOfRange(TryFromIntError),
    /// The searched row was never inserted.
    RowNotIndexed(N),
}

impl<N> fmt::Display for IndexFault<N>
where
    N: fmt::Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Hannoy(error) => write!(fmt, "the hannoy index failed: {error}"),
            Self::Heed(error) => write!(fmt, "the LMDB environment failed: {error}"),
            Self::Io(error) => write!(fmt, "the lock file could not be created: {error}"),
            Self::Locked(error) => write!(fmt, "the environment is locked elsewhere: {error}"),
            Self::RowOutOfRange(error) => {
                write!(fmt, "the node row exceeds the u32 item-key space: {error}")
            }
            Self::RowNotIndexed(id) => write!(fmt, "node row {id} is not indexed"),
        }
    }
}

impl<N> Error for IndexFault<N>
where
    N: fmt::Debug + fmt::Display,
{
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Hannoy(error) => Some(error),
            Self::Heed(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::Locked(error) => Some(error),
            Self::RowOutOfRange(error) => Some(error),
            Self::RowNotIndexed(_) => None,
        }
    }
}

impl<N> IndexFault<N> {
    /// Maps the row the fault names into another row domain.
    fn map_rows<M>(self, row: impl FnOnce(N) -> M) -> IndexFault<M> {
        match self {
            Self::Hannoy(error) => IndexFault::Hannoy(error),
            Self::Heed(error) => IndexFault::Heed(error),
            Self::Io(error) => IndexFault::Io(error),
            Self::Locked(error) => IndexFault::Locked(error),
            Self::RowOutOfRange(error) => IndexFault::RowOutOfRange(error),
            Self::RowNotIndexed(unindexed) => IndexFault::RowNotIndexed(row(unindexed)),
        }
    }
}

impl IndexFault<!> {
    /// Widens the never-typed fault into any row domain: no variant names a row.
    fn widen<N>(self) -> IndexFault<N> {
        self.map_rows(|row| row)
    }
}

impl<N> From<hannoy::Error> for IndexFault<N> {
    fn from(error: hannoy::Error) -> Self {
        Self::Hannoy(error)
    }
}

impl<N> From<heed::Error> for IndexFault<N> {
    fn from(error: heed::Error) -> Self {
        Self::Heed(error)
    }
}

impl<N> From<io::Error> for IndexFault<N> {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl<N> From<TryLockError> for IndexFault<N> {
    fn from(error: TryLockError) -> Self {
        Self::Locked(error)
    }
}

/// One hannoy HNSW index over one locked LMDB environment.
pub(crate) struct HannoyIndex {
    env: Env,
    db: Database<Cosine>,
    writer: Writer<Cosine>,
    options: HannoyIndexOptions,
    _lock: File,
}

impl HannoyIndex {
    /// Opens the environment directory at `base` and claims its lock.
    ///
    /// # Errors
    ///
    /// Returns an error when the lock file cannot be created or is held elsewhere, or the
    /// environment cannot open.
    pub(crate) fn new(
        base: impl AsRef<Utf8Path>,
        options: HannoyIndexOptions,
    ) -> Result<Self, HannoyIndexError<!>> {
        Self::open(base.as_ref(), options).map_err(HannoyIndexError)
    }

    /// Opens the environment and claims the lock, in the backend's fault vocabulary.
    fn open(base: &Utf8Path, options: HannoyIndexOptions) -> Result<Self, IndexFault<!>> {
        let lockfile = base.with_extension("lock");

        let lock = File::create(&lockfile)?;
        lock.try_lock()?;

        // SAFETY: While we cannot guarantee that we're the only one that accesses it, any opening
        // of the database through our controlled access surface goes through a mandatory file lock.
        let env = unsafe {
            EnvOpenOptions::new()
                .map_size(options.map_size)
                .open(base)?
        };

        let mut wtxn = env.write_txn()?;
        let db = env.create_database(&mut wtxn, None)?;
        let writer = Writer::new(db, INDEX, PROJECTOR_DIMENSIONS);
        wtxn.commit()?;

        Ok(Self {
            env,
            db,
            writer,
            options,
            _lock: lock,
        })
    }

    /// Inserts every embedding under its row key inside one write transaction.
    fn insert<'embedding, N>(
        &self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding, N>>,
    ) -> Result<(), IndexFault<N>>
    where
        N: Id,
    {
        let mut wtxn = self.env.write_txn()?;

        for embedding in embeddings {
            self.writer.add_item(
                &mut wtxn,
                u32::try_from(embedding.id.as_u64()).map_err(IndexFault::RowOutOfRange)?,
                embedding.components.as_array(),
            )?;
        }

        wtxn.commit()?;
        Ok(())
    }

    /// Links the inserted items into the HNSW graph inside one write transaction.
    fn link<P>(&self, rng: impl Rng + SeedableRng, progress: &P) -> Result<(), IndexFault<!>>
    where
        P: Progress,
    {
        let mut wtxn = self.env.write_txn()?;

        let mut rng = Compat::new(rng);
        let mut builder = self
            .writer
            .builder(&mut rng)
            .progress(BuildPhases(progress.detach()));

        builder
            .ef_construction(self.options.ef_construction)
            .build::<M, M0>(&mut wtxn)?;

        wtxn.commit()?;
        Ok(())
    }

    /// Searches the configured breadth around a query vector.
    fn nns_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<Vec<(u32, f32)>, IndexFault<!>> {
        let rtxn = self.env.read_txn()?;
        let reader = Reader::open(&rtxn, INDEX, self.db)?;

        Ok(reader
            .nns(limit)
            .ef_search(self.options.ef_search)
            .by_vector(&rtxn, query.as_array())?
            .into_nns())
    }

    /// Searches the configured breadth around an indexed item.
    fn nns_by_item<N>(&self, id: N, limit: usize) -> Result<Vec<(u32, f32)>, IndexFault<N>>
    where
        N: Id,
    {
        let rtxn = self.env.read_txn()?;
        let reader = Reader::open(&rtxn, INDEX, self.db)?;

        // hannoy's by_item excludes the queried item from its results,
        // so `limit` maps through unchanged.
        reader
            .nns(limit)
            .ef_search(self.options.ef_search)
            .by_item(
                &rtxn,
                u32::try_from(id.as_u64()).map_err(IndexFault::RowOutOfRange)?,
            )?
            .map(hannoy::Searched::into_nns)
            .ok_or(IndexFault::RowNotIndexed(id))
    }

    /// Maps one search result onto the seam's contract.
    fn finish_search<N>(mut results: Vec<(u32, f32)>) -> impl IntoIterator<Item = Neighbour<N>>
    where
        N: Id,
    {
        // hannoy returns ascending distances with unspecified ties; the
        // id tiebreak pins the seam's deterministic order.
        results.sort_unstable_by(|(lhs_id, lhs_distance), (rhs_id, rhs_distance)| {
            lhs_distance
                .total_cmp(rhs_distance)
                .then_with(|| lhs_id.cmp(rhs_id))
        });

        results.into_iter().map(|(id, distance)| Neighbour {
            id: N::from_u32(id),
            // hannoy's cosine distance is (1 - cos) / 2 ∈ [0, 1];
            // doubling restores the crate's [0, 2] scale exactly,
            // because scaling by a power of two is lossless.
            distance: distance * 2.0,
        })
    }
}

impl fmt::Debug for HannoyIndex {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("HannoyIndex")
            .field("options", &self.options)
            .finish_non_exhaustive()
    }
}

impl<N> NearestNeighboursIndex<N> for HannoyIndex
where
    N: Id,
{
    type Error = HannoyIndexError<N>;

    fn insert_many<'embedding>(
        &mut self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding, N>>,
    ) -> Result<(), Self::Error> {
        self.insert(embeddings).map_err(HannoyIndexError)
    }

    fn build<P>(&mut self, rng: impl Rng + SeedableRng, progress: &P) -> Result<(), Self::Error>
    where
        P: Progress,
    {
        self.link(rng, progress)
            .map_err(|fault| HannoyIndexError(fault.widen()))
    }

    fn search_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<N>>, Self::Error> {
        let results = self
            .nns_by_vector(query, limit)
            .map_err(|fault| HannoyIndexError(fault.widen()))?;

        Ok(Self::finish_search(results))
    }

    fn search_by_id(
        &self,
        id: N,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<N>>, Self::Error> {
        let results = self.nns_by_item(id, limit).map_err(HannoyIndexError)?;

        Ok(Self::finish_search(results))
    }
}
