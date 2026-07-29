//! The semantic k-nearest-neighbour graph.
//!
//! The deliverable is [`table::Knn`]: a directed cosine k-nearest-neighbour table over the
//! projector representations, stored as a compressed sparse row matrix whose row `i` holds the `k`
//! nearest non-self neighbours of node row `i` with their cosine distances. Every row stores
//! exactly `k` entries, no row references itself or repeats a neighbour, every distance is finite
//! in `[0, 2]`, and entries within a row are ordered by neighbour row. The default `k` is
//! [`DEFAULT_NEIGHBOURS`]; the bound applies to semantic sampling and does not limit relation
//! edges.
//!
//! [`construction::KnnConstruction`] separates the table's semantics from how neighbour lists
//! are produced. Two constructors exist: [`construction::IndexConstruction`] wraps a
//! [`NearestNeighboursIndex`] search backend - [`hannoy::HannoyIndex`] is the LMDB-backed HNSW
//! production backend - and [`descent::NnDescent`] derives the lists directly by local joins,
//! with no search structure. The landmark assignment keeps querying a backend by vector; the
//! table build needs only the lists.
//!
//! A construction is accepted by exact comparison: [`recall::spot_check_lists`] intersects
//! sampled rows of the produced lists with brute-force [`AlignedVecN`] cosine rankings and judges
//! aggregate recall against a configured minimum ([`recall::SpotCheckOptions`]).
//!
//! The validated table publishes as one sparse matrix file ([`crate::file::sprs`]) holding its
//! matrix verbatim; [`artifact::KnnArchive`] reopens it over a whole-file mapping, so stages after
//! the build read the table from the page cache without holding it on the heap.
//!
//! # Reproducibility boundary
//!
//! The HNSW graph is transient search infrastructure, not a portable byte-level contract. The
//! durable generation artifact is the validated [`table::Knn`] table together with its recall spot
//! check.

use core::num::NonZero;

use hashql_core::id::Id;
use rand::{Rng, SeedableRng};

use crate::{dataset::PROJECTOR_DIMENSIONS, math::AlignedVecN, progress::Progress};

pub(crate) mod artifact;
pub(crate) mod construction;
pub(crate) mod descent;
pub(crate) mod error;
pub(crate) mod hannoy;
pub(crate) mod recall;
pub(crate) mod report;
pub(crate) mod table;

#[cfg(test)]
mod tests;

/// Stored neighbours per row of the persisted table.
pub(crate) const DEFAULT_NEIGHBOURS: NonZero<usize> =
    NonZero::new(30).expect("the default neighbour count is nonzero");

/// One node row's projector representation, keyed for insertion.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Embedding<'embedding, N> {
    /// The node row the vector belongs to.
    pub id: N,
    /// The l2-normalized projector representation.
    pub components: &'embedding AlignedVecN<PROJECTOR_DIMENSIONS>,
}

/// One search result: a neighbouring node row and its cosine distance.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Neighbour<N> {
    /// The matched node row.
    pub id: N,
    /// Cosine distance to the query, finite in `[0, 2]`.
    pub distance: f32,
}

/// A replaceable approximate cosine search backend.
///
/// A backend serves one generation's node rows: every row is inserted exactly once,
/// [`build`](Self::build) links the search structure, and searches answer only after the build
/// completes. Searches return neighbours in ascending `(distance, id)` order with distances on the
/// crate's `[0, 2]` cosine scale; a search may return fewer than `limit` neighbours when the index
/// holds fewer candidates.
pub(crate) trait NearestNeighboursIndex<N>
where
    N: Id,
{
    type Error;

    /// Ingests projector representations keyed by node row.
    ///
    /// # Errors
    ///
    /// Returns a backend error when storage or key encoding fails.
    fn insert_many<'embedding>(
        &mut self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding, N>>,
    ) -> Result<(), Self::Error>;

    /// Links the search structure over every inserted row.
    ///
    /// `rng` drives the backend's randomized construction: sampling streams derive from the
    /// seed, but linking applies updates in parallel and unordered, so same-seed builds can
    /// differ. The recall spot check downstream is the arbiter of a construction, never a replay.
    ///
    /// The link is the construction's long phase and only the backend knows its parts, so a
    /// backend reports them as they begin through
    /// [`knn_build_phase`](Progress::knn_build_phase). `progress` arrives owned because a backend
    /// hands it to machinery that outlives the call's borrows.
    ///
    /// # Errors
    ///
    /// Returns a backend error when construction fails.
    fn build<P>(&mut self, rng: impl Rng + SeedableRng, progress: P) -> Result<P, Self::Error>
    where
        P: Progress + Send + Sync + 'static;

    /// Returns up to `limit` nearest neighbours of `query`.
    ///
    /// The query is positional: a row whose stored vector equals the query appears in the results.
    ///
    /// # Errors
    ///
    /// Returns a backend error when the search fails.
    fn search_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<N>>, Self::Error>;

    /// Returns up to `limit` nearest neighbours of the stored row `id`, excluding the row itself.
    ///
    /// # Errors
    ///
    /// Returns a backend error when `id` is not in the index or the search fails.
    fn search_by_id(
        &self,
        id: N,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour<N>>, Self::Error>;
}
