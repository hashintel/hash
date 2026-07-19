//! The SALT generation repository.
//!
//! One published SALT generation is a repository: the fixed set of files
//! it consists of, plus the metadata describing how they were produced.
//! [`SaltFiles`] names each artifact role explicitly - a generation
//! either has all of them or is not a generation - and every entry binds
//! a file name to its hash, so a repository can be verified end to end
//! from this value alone.

use self::metadata::SaltMetadata;
use super::repository::{RepositoryFile, RepositoryVersion};

pub(crate) mod metadata;

#[cfg(test)]
mod tests;

/// The files of one SALT generation, by role.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SaltFiles {
    /// The `f32[N, 512]` projector representation matrix, row-aligned
    /// with the node stream; an array file.
    pub representations: RepositoryFile,
    /// The `f32[T, 3072]` card embedding matrix in ontology row order;
    /// an array file.
    pub card_embeddings: RepositoryFile,
    /// The card text hashes, one SHA-256 per ontology row: the reuse
    /// key of the card embedding matrix. An array file.
    pub card_hashes: RepositoryFile,
    /// The k-nearest-neighbour table, a sparse matrix file.
    pub knn: RepositoryFile,
    /// The fuzzy semantic graph, a sparse matrix file.
    pub semantic: RepositoryFile,
    /// The landmark skeleton: selected rows, assignment, and layout
    /// coordinates in one combined file.
    pub landmarks: RepositoryFile,
    /// The fitted relation-policy classifier: coefficient rows,
    /// applicability moments, and training distances in one combined
    /// file.
    pub classifier: RepositoryFile,
    /// The resolved geometry policy table, one record per relation
    /// type, ascending by relation; a policy file.
    pub policy: RepositoryFile,
    /// The attraction index: force-bearing link instances grouped by
    /// relation type, one combined attraction file.
    pub attraction: RepositoryFile,
    /// The protection index: the symmetric no-repel evidence matrix, a
    /// sparse matrix file.
    pub protection: RepositoryFile,
    /// The canonical `f32[N, 2]` coordinates, row-aligned with the node
    /// stream; an array file.
    pub coordinates: RepositoryFile,
    /// The Morton code column in base delivery order with its bucket
    /// fenceposts and page index, one combined morton file.
    pub morton: RepositoryFile,
    /// The quadtree topology: the tile node table and its per-node
    /// direct-type sets, one combined quad file.
    pub quad: RepositoryFile,
    /// The wire `f32[N, 2]` coordinates in base delivery order,
    /// normalized into the `[-1, 1]` frame; an array file.
    pub wire_coordinates: RepositoryFile,
    /// Each base position's importance rank, `u32[N]`; an array file.
    pub rank_of_position: RepositoryFile,
    /// Each rank's base position, `u32[N]`: the traversal order of
    /// filter registration; an array file.
    pub position_of_rank: RepositoryFile,
    /// Each node row's base position, `u32[N]`: the permutation the
    /// filter contract maps entity bitmaps through; an array file.
    pub position_of_row: RepositoryFile,
    /// Each base position's node row, `u32[N]`: the gather order that
    /// assembles any row-aligned column into base order; an array file.
    pub row_of_position: RepositoryFile,
    /// The node identities: source id per node row and the sorted
    /// lookup pairs, one identity file.
    pub node_identities: RepositoryFile,
    /// The edge identities: source id per edge row and the sorted
    /// lookup pairs, one identity file.
    pub edge_identities: RepositoryFile,
    /// The ontology identities: source type id per ontology row and
    /// the sorted lookup pairs, one identity file.
    pub ontology_identities: RepositoryFile,
    /// The `u64[E, 2]` endpoint column: each edge row's source and
    /// target node rows; an array file.
    pub edge_endpoints: RepositoryFile,
    /// The incident-edge adjacency: per-node outgoing and incoming edge
    /// rows over one value array, one combined adjacency file.
    pub adjacency: RepositoryFile,
    /// The reviewed-verdicts document supplied to the fit, staged
    /// verbatim: the trainer's human-review input. `None` records that
    /// the fit ran without one.
    pub reviewed_verdicts: Option<RepositoryFile>,
}

impl SaltFiles {
    /// Returns every file of the generation, in role order; the
    /// supplied-verdicts role appears exactly when one was staged.
    ///
    /// Destructuring keeps the list total: a new role fails compilation
    /// here until it is listed.
    pub(crate) fn files(&self) -> impl Iterator<Item = &RepositoryFile> {
        let Self {
            representations,
            card_embeddings,
            card_hashes,
            knn,
            semantic,
            landmarks,
            classifier,
            policy,
            attraction,
            protection,
            coordinates,
            morton,
            quad,
            wire_coordinates,
            rank_of_position,
            position_of_rank,
            position_of_row,
            row_of_position,
            node_identities,
            edge_identities,
            ontology_identities,
            edge_endpoints,
            adjacency,
            reviewed_verdicts,
        } = self;

        [
            representations,
            card_embeddings,
            card_hashes,
            knn,
            semantic,
            landmarks,
            classifier,
            policy,
            attraction,
            protection,
            coordinates,
            morton,
            quad,
            wire_coordinates,
            rank_of_position,
            position_of_rank,
            position_of_row,
            row_of_position,
            node_identities,
            edge_identities,
            ontology_identities,
            edge_endpoints,
            adjacency,
        ]
        .into_iter()
        .chain(reviewed_verdicts.as_ref())
    }
}

/// One published SALT generation.
///
/// The version leads the serialized document, so readers reject a
/// repository of another layout before interpreting anything else.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SaltRepository {
    pub version: RepositoryVersion,
    pub files: SaltFiles,
    pub metadata: SaltMetadata,
}
