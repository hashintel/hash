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
    /// The canonical `f32[N, 2]` coordinates, row-aligned with the node
    /// stream; an array file.
    pub coordinates: RepositoryFile,
    /// The node identities: source id per node row and the sorted
    /// lookup pairs, one identity file.
    pub node_identities: RepositoryFile,
    /// The edge identities: source id per edge row and the sorted
    /// lookup pairs, one identity file.
    pub edge_identities: RepositoryFile,
}

impl SaltFiles {
    /// Returns every file of the generation, in role order.
    ///
    /// Destructuring keeps the list total: a new role fails compilation
    /// here until it is listed.
    #[must_use]
    pub(crate) const fn files(&self) -> [&RepositoryFile; 11] {
        let Self {
            representations,
            card_embeddings,
            card_hashes,
            knn,
            semantic,
            landmarks,
            classifier,
            policy,
            coordinates,
            node_identities,
            edge_identities,
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
            coordinates,
            node_identities,
            edge_identities,
        ]
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
