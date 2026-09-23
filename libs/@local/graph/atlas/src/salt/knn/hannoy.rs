//! LMDB-backed HNSW search on the crate's cosine-distance scale.
//!
//! [`HannoyIndex`] provides [`NearestNeighboursIndex`] through one [hannoy] index in one [heed]
//! LMDB environment. An advisory lock excludes other handles using the same lock file for the
//! environment. Item keys must fit hannoy's `u32` key space.
//!
//! Results are rescaled onto the crate's `[0, 2]` cosine scale and ordered by ascending `(distance,
//! id)`. Rescaling preserves the backend's values, with their own floating-point rounding.

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
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{AlignedVecN, NonNegative},
    progress::Progress,
    random::Compat,
};

/// A detached observer that reports the backend's build-phase names.
struct BuildPhases<D>(D);

// steppe requires a 'static reporter, and the builder owns it. The detached observer avoids
// borrowing the run's observer for that lifetime.
impl<D> steppe::Progress for BuildPhases<D>
where
    D: Progress + Send + Sync + 'static,
{
    fn update(&self, sub_progress: impl steppe::Step) {
        // the immediate callback sees a zero counter, which can advance if the step is
        // retained. Report only the phase name rather than that initial position.
        self.0.knn_build_phase(&sub_progress.name());
    }
}

// HNSW connectivity, hannoy build-time const generics: M links per node on the upper layers, M0 on
// the ground layer. M = 16 with M0 = 2 · M follows the Malkov-Yashunin paper's defaults (a
// reasonable M range is 5-48 where higher values pay off only for extreme recall or
// dimensionality). The recall spot check is the per-corpus arbiter.
/// HNSW connectivity on the upper layers: links per node.
#[expect(
    clippy::min_ident_chars,
    reason = "M is the canonical HNSW connectivity name"
)]
const M: usize = 16;
/// HNSW connectivity on the ground layer, `2 · M`.
const M0: usize = 32;

/// The index number within the LMDB environment.
// One environment carries one index.
const INDEX: u16 = 0;

/// The default memory-map bound, 1 TiB.
const DEFAULT_MAP_SIZE: usize = 1 << 40;

// the 985,932-row recall@50 backend sweep used exact-reference streams derived from the fit seeds.
// Raising construction breadth from 128 to 256 improved sampled aggregate recall from about 0.893
// to 0.902 against the 0.89 floor, at 245s build time instead of 155s. Same-seed rebuilds varied by
// about ±0.007, which the admission margin must accommodate. Raising search breadth from 64 to 256
// improved recall by 0.002-0.005 at 2.2 times the query cost. Retaining search breadth 128 favors
// construction quality over that recurring query cost. Use `report::backend` (`report knn-backend`)
// to reassess these settings on another corpus.
/// The default build-time frontier breadth.
const DEFAULT_EF_CONSTRUCTION: usize = 256;
/// The default search-time frontier breadth.
const DEFAULT_EF_SEARCH: usize = 128;

/// Pinned hannoy storage, build, and query settings.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct HannoyIndexOptions {
    /// Upper bound of the LMDB memory map, in bytes.
    ///
    /// By default, reserves up to 1 TiB of virtual address space for database mapping. Physical memory use depends on accessed pages. Database growth beyond it fails with an [`MDB_MAP_FULL`](heed::MdbError::MapFull) environment error. Choose a larger bound when the index needs more mapped space.
    pub map_size: usize = DEFAULT_MAP_SIZE,
    /// Breadth of the candidate frontier while linking one item into the graph.
    ///
    /// Larger values buy link quality with one-time build cost, and link quality bounds the recall
    /// any search breadth can reach afterwards. By default, uses 256 candidates.
    pub ef_construction: usize = DEFAULT_EF_CONSTRUCTION,
    /// Breadth of the candidate frontier while searching.
    ///
    /// A search never runs below the requested neighbour count. Larger values buy recall with
    /// per-query cost. By default, uses 128 candidates, raised to at least the requested neighbour count.
    pub ef_search: usize = DEFAULT_EF_SEARCH,
}

const impl Default for HannoyIndexOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// A failure of the [`HannoyIndex`] backend.
///
/// The message names the failing surface - index, environment, lock file, or key space - and the
/// concrete fault chains beneath through [`Error::source`].
// The private field keeps hannoy's and heed's types out of the public
// interface: both are private dependencies.
#[derive(Debug)]
pub(crate) struct HannoyIndexError<N>(IndexFault<N>);

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
    /// Creating the lock file failed.
    Io(io::Error),
    /// Another handle holds the environment's lock file.
    Locked(TryLockError),
    /// A node row does not fit hannoy's `u32` item-key space.
    RowOutOfRange(TryFromIntError),
    /// The searched row was never inserted.
    RowNotIndexed(N),
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
    /// Opens an existing environment directory at `base` and claims its advisory lock.
    ///
    /// The directory must reside on a local filesystem with intact LMDB locking. Advisory exclusion
    /// covers only handles that use the same lock file.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the lock file fails, another handle holds the lock, or the
    /// environment or index database cannot be opened or initialized.
    pub(crate) fn new(
        base: impl AsRef<Utf8Path>,
        options: HannoyIndexOptions,
    ) -> Result<Self, HannoyIndexError<!>> {
        Self::open(base.as_ref(), options).map_err(HannoyIndexError)
    }

    /// Opens the environment and index database under an advisory lock.
    ///
    /// # Errors
    ///
    /// Returns [`IndexFault`] when lock acquisition, environment opening or database initialization
    /// fails.
    fn open(base: &Utf8Path, options: HannoyIndexOptions) -> Result<Self, IndexFault<!>> {
        let lockfile = base.with_extension("lock");

        let lock = File::create(&lockfile)?;
        lock.try_lock()?;

        // SAFETY: heed relies on LMDB locking and on the database files remaining free of non-LMDB
        // mutation on a local filesystem. No unsafe LMDB flags are enabled here, and `_lock`
        // retains advisory exclusion against cooperating opens until after the environment drops.
        // The lock does not establish the local-filesystem or external-mutation assumptions.
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
    ///
    /// # Errors
    ///
    /// Returns [`IndexFault`] when a row key does not fit `u32`, an item cannot be inserted, or the
    /// transaction fails.
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
    ///
    /// # Errors
    ///
    /// Returns [`IndexFault`] when graph construction or the transaction fails.
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
    ///
    /// # Errors
    ///
    /// Returns [`IndexFault`] when opening a read transaction or index reader fails, or the query
    /// fails.
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
    ///
    /// # Errors
    ///
    /// Returns [`IndexFault`] when opening a read transaction or index reader fails, the key does
    /// not fit `u32`, the row is absent, or the query fails.
    fn nns_by_item<N>(&self, id: N, limit: usize) -> Result<Vec<(u32, f32)>, IndexFault<N>>
    where
        N: Id,
    {
        let rtxn = self.env.read_txn()?;
        let reader = Reader::open(&rtxn, INDEX, self.db)?;

        // by_item already excludes the queried item. Request exactly `limit` results.
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

    /// Orders search results by distance and id and restores the `[0, 2]` cosine scale.
    fn finish_search<N>(mut results: Vec<(u32, f32)>) -> impl IntoIterator<Item = Neighbour<N>>
    where
        N: Id,
    {
        // hannoy leaves distance ties unspecified. Order equal distances by id to satisfy the
        // search contract.
        results.sort_unstable_by(|(lhs_id, lhs_distance), (rhs_id, rhs_distance)| {
            lhs_distance
                .total_cmp(rhs_distance)
                .then_with(|| lhs_id.cmp(rhs_id))
        });

        results.into_iter().map(|(id, distance)| Neighbour {
            id: N::from_u32(id),
            // Multiplication by two is exact for finite f32 values in [0, 1]. hannoy returns (1 −
            // cos) / 2 on that range for the admitted vectors. Therefore doubling restores the [0,
            // 2] scale without additional rounding.
            distance: NonNegative::new_unchecked(distance * 2.0),
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
