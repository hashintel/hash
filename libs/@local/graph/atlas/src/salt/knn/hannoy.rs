//! LMDB-backed HNSW behind the nearest-neighbours seam.
//!
//! [`HannoyIndex`] adapts one [hannoy] index inside one [heed] LMDB
//! environment to [`NearestNeighboursIndex`]. The environment lives in
//! a directory guarded by an advisory file lock, so one process owns
//! the index at a time. Item keys are node rows narrowed to hannoy's
//! `u32` key space; a generation whose row count exceeds `u32::MAX`
//! does not fit this backend.
//!
//! Backend distances are rescaled onto the crate's `[0, 2]` cosine
//! scale before they cross the seam, and results are ordered by
//! ascending `(distance, id)`.

use core::{error::Error, fmt, num::TryFromIntError};
use std::{
    fs::{File, TryLockError},
    io,
};

use camino::Utf8Path;
use hannoy::{Database, Reader, Writer, distances::Cosine};
use heed::{Env, EnvOpenOptions};
use rand::{Rng, SeedableRng};

use super::{Embedding, NearestNeighboursIndex, Neighbour};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::AlignedVecN,
    random::Compat,
};

// HNSW connectivity, hannoy build-time const generics: M links per
// node on the upper layers, M0 on the ground layer. M = 16 with
// M0 = 2 * M follows the Malkov-Yashunin paper's defaults (reasonable
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

// Both ef defaults are starting points, not certified values: nothing
// certifies a frontier breadth a priori, so the recall spot check
// gates every generation and ef_search is the first knob to raise on
// a failed gate. Construction sits at the low end of the 100-500 band
// HNSW deployments use at million-row scale; search sits at 2.5x the
// deepest query breadth in this crate (the 50-neighbour recall audit)
// and above hannoy's own default of 100. The first fit against a
// full-scale corpus should record the measured recall headroom and
// revise these from evidence.
const DEFAULT_EF_CONSTRUCTION: usize = 128;
const DEFAULT_EF_SEARCH: usize = 128;

/// Pinned hannoy storage, build, and query settings.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) struct HannoyIndexOptions {
    /// Upper bound of the LMDB memory map, in bytes.
    ///
    /// The map is a virtual-address reservation, not an allocation:
    /// pages materialize as the index writes them, so the bound costs
    /// nothing until it is reached. A write beyond it fails with an
    /// [`MDB_MAP_FULL`](heed::MdbError::MapFull) environment error, and
    /// the remedy is a larger bound. The 1 TiB default covers roughly
    /// 4 KiB per item at [`PROJECTOR_DIMENSIONS`], two orders of
    /// magnitude beyond a million-row generation.
    pub map_size: usize = DEFAULT_MAP_SIZE,
    /// Breadth of the candidate frontier while linking one item into
    /// the graph. Larger values buy link quality with one-time build
    /// cost, and link quality bounds the recall any search breadth
    /// can reach afterwards.
    pub ef_construction: usize = DEFAULT_EF_CONSTRUCTION,
    /// Breadth of the candidate frontier while searching; a search
    /// never runs below the requested neighbour count. Larger values
    /// buy recall with per-query cost, and the recall spot check is
    /// the arbiter of whether a setting suffices.
    pub ef_search: usize = DEFAULT_EF_SEARCH,
}

/// The [`HannoyIndex`] backend failed.
#[derive(Debug)]
pub(crate) enum HannoyIndexError {
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
    RowNotIndexed(NodeRowId),
}

impl fmt::Display for HannoyIndexError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Hannoy(error) => write!(fmt, "the hannoy index failed: {error}"),
            Self::Heed(error) => write!(fmt, "the LMDB environment failed: {error}"),
            Self::Io(error) => write!(fmt, "the lock file could not be created: {error}"),
            Self::Locked(error) => write!(fmt, "the environment is locked elsewhere: {error}"),
            Self::RowOutOfRange(error) => {
                write!(fmt, "the node row exceeds the u32 item-key space: {error}")
            }
            Self::RowNotIndexed(id) => write!(fmt, "node row {} is not indexed", id.get()),
        }
    }
}

impl Error for HannoyIndexError {
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

impl From<hannoy::Error> for HannoyIndexError {
    fn from(error: hannoy::Error) -> Self {
        Self::Hannoy(error)
    }
}

impl From<heed::Error> for HannoyIndexError {
    fn from(error: heed::Error) -> Self {
        Self::Heed(error)
    }
}

impl From<io::Error> for HannoyIndexError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<TryLockError> for HannoyIndexError {
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
    /// Returns an error when the lock file cannot be created or is held
    /// elsewhere, or the environment cannot open.
    pub(crate) fn new(
        base: impl AsRef<Utf8Path>,
        options: HannoyIndexOptions,
    ) -> Result<Self, HannoyIndexError> {
        let base = base.as_ref();
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

    /// Maps one search result onto the seam's contract.
    fn finish_search(mut results: Vec<(u32, f32)>) -> impl IntoIterator<Item = Neighbour> {
        // hannoy returns ascending distances with unspecified ties; the
        // id tiebreak pins the seam's deterministic order.
        results.sort_unstable_by(|(lhs_id, lhs_distance), (rhs_id, rhs_distance)| {
            lhs_distance
                .total_cmp(rhs_distance)
                .then_with(|| lhs_id.cmp(rhs_id))
        });

        results.into_iter().map(|(id, distance)| Neighbour {
            id: NodeRowId::new(u64::from(id)),
            // hannoy's cosine distance is (1 - cos) / 2 in [0, 1];
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

impl NearestNeighboursIndex for HannoyIndex {
    type Error = HannoyIndexError;

    fn insert_many<'embedding>(
        &mut self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding>>,
    ) -> Result<(), Self::Error> {
        let mut wtxn = self.env.write_txn()?;

        for embedding in embeddings {
            self.writer.add_item(
                &mut wtxn,
                u32::try_from(embedding.id.get()).map_err(HannoyIndexError::RowOutOfRange)?,
                embedding.components.as_array(),
            )?;
        }

        wtxn.commit()?;
        Ok(())
    }

    fn build(&mut self, rng: impl Rng + SeedableRng) -> Result<(), Self::Error> {
        let mut wtxn = self.env.write_txn()?;

        let mut rng = Compat::new(rng);
        let mut builder = self.writer.builder(&mut rng);
        builder
            .ef_construction(self.options.ef_construction)
            .build::<M, M0>(&mut wtxn)?;

        wtxn.commit()?;
        Ok(())
    }

    fn search_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
        let rtxn = self.env.read_txn()?;
        let reader = Reader::open(&rtxn, INDEX, self.db)?;

        let results = reader
            .nns(limit)
            .ef_search(self.options.ef_search)
            .by_vector(&rtxn, query.as_array())?
            .into_nns();

        Ok(Self::finish_search(results))
    }

    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error> {
        let rtxn = self.env.read_txn()?;
        let reader = Reader::open(&rtxn, INDEX, self.db)?;

        // hannoy's by_item excludes the queried item from its results,
        // so `limit` maps through unchanged.
        let Some(results) = reader
            .nns(limit)
            .ef_search(self.options.ef_search)
            .by_item(
                &rtxn,
                u32::try_from(id.get()).map_err(HannoyIndexError::RowOutOfRange)?,
            )?
        else {
            return Err(HannoyIndexError::RowNotIndexed(id));
        };

        Ok(Self::finish_search(results.into_nns()))
    }
}
