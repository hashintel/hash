//! The semantic k-nearest-neighbour graph.
//!
//! The deliverable is [`table::Knn`]: a directed cosine
//! k-nearest-neighbour table over the projector representations,
//! stored as a compressed
//! sparse row matrix whose row `i` holds the `k` nearest non-self
//! neighbours of node row `i` with their cosine distances. Every row
//! stores exactly `k` entries, no row references itself or repeats a
//! neighbour, every distance is finite in `[0, 2]`, and entries within
//! a row are ordered by neighbour row. The default `k` is
//! [`DEFAULT_NEIGHBOURS`]; the bound applies to semantic sampling and
//! does not limit relation edges.
//!
//! [`NearestNeighboursIndex`] separates the table's semantics from the
//! search backend. [`hannoy::HannoyIndex`] is the LMDB-backed HNSW
//! production backend; a backend serves one generation by ingesting
//! every node row through
//! [`insert_many`](NearestNeighboursIndex::insert_many), linking the
//! graph with [`build`](NearestNeighboursIndex::build), and answering
//! searches from then on.
//!
//! A built backend is accepted by exact comparison:
//! [`recall::spot_check`] intersects sampled approximate queries with
//! brute-force [`AlignedVecN`] cosine rankings and gates aggregate
//! recall at a configured minimum ([`recall::SpotCheckOptions`]).
//!
//! The validated table publishes as one sparse matrix file
//! ([`crate::file::sprs`]) holding its matrix verbatim;
//! [`artifact::MappedKnn`] reopens it over a whole-file mapping, so
//! stages after the build read the table from the page cache without
//! holding it on the heap.
//!
//! # Reproducibility boundary
//!
//! The HNSW graph is transient search infrastructure, not a portable
//! byte-level contract. The durable generation artifact is the
//! validated [`table::Knn`] table together with its recall spot check.

use core::num::NonZero;

use rand::{Rng, SeedableRng};

use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::AlignedVecN,
};

pub(crate) mod artifact;
pub(crate) mod error;
pub(crate) mod hannoy;
pub(crate) mod recall;
pub(crate) mod table;

#[cfg(test)]
mod tests;

/// Stored neighbours per row of the persisted table.
pub(crate) const DEFAULT_NEIGHBOURS: NonZero<usize> =
    NonZero::new(30).expect("the default neighbour count is nonzero");

/// One node row's projector representation, keyed for insertion.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Embedding<'embedding> {
    /// The node row the vector belongs to.
    pub id: NodeRowId,
    /// The l2-normalized projector representation.
    pub components: &'embedding AlignedVecN<PROJECTOR_DIMENSIONS>,
}

/// One search result: a neighbouring node row and its cosine distance.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Neighbour {
    /// The matched node row.
    pub id: NodeRowId,
    /// Cosine distance to the query, finite in `[0, 2]`.
    pub distance: f32,
}

/// A replaceable approximate cosine search backend.
///
/// A backend serves one generation's node rows: every row is inserted
/// exactly once, [`build`](Self::build) links the search structure, and
/// searches answer only after the build completes. Searches return
/// neighbours in ascending `(distance, id)` order with distances on the
/// crate's `[0, 2]` cosine scale; a search may return fewer than
/// `limit` neighbours when the index holds fewer candidates.
pub(crate) trait NearestNeighboursIndex {
    type Error;

    /// Ingests projector representations keyed by node row.
    ///
    /// # Errors
    ///
    /// Returns a backend error when storage or key encoding fails.
    fn insert_many<'embedding>(
        &mut self,
        embeddings: impl IntoIterator<Item = Embedding<'embedding>>,
    ) -> Result<(), Self::Error>;

    /// Links the search structure over every inserted row.
    ///
    /// `rng` drives the backend's randomized construction, so a seeded
    /// generator reproduces the build on one pinned backend version.
    ///
    /// # Errors
    ///
    /// Returns a backend error when construction fails.
    fn build(&mut self, rng: impl Rng + SeedableRng) -> Result<(), Self::Error>;

    /// Returns up to `limit` nearest neighbours of `query`.
    ///
    /// The query is positional: a row whose stored vector equals the
    /// query appears in the results.
    ///
    /// # Errors
    ///
    /// Returns a backend error when the search fails.
    fn search_by_vector(
        &self,
        query: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error>;

    /// Returns up to `limit` nearest neighbours of the stored row `id`,
    /// excluding the row itself.
    ///
    /// # Errors
    ///
    /// Returns a backend error when `id` is not in the index or the
    /// search fails.
    fn search_by_id(
        &self,
        id: NodeRowId,
        limit: usize,
    ) -> Result<impl IntoIterator<Item = Neighbour>, Self::Error>;
}
