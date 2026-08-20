//! The SALT generation repository.
//!
//! One published SALT generation is a repository. It consists of a fixed set of files plus the
//! metadata describing what produced them. [`SaltFiles`] names each artifact role, so a generation
//! either has all of them or is not a generation. Every entry binds a file name to its hash, so a
//! reader can verify a repository end to end from this value alone.

use self::metadata::SaltMetadata;
use super::repository::{Binding, RepositoryFile, RepositoryVersion};

pub(crate) mod artifact;
pub(crate) mod metadata;

#[cfg(test)]
mod tests;

/// The files of one SALT generation, by role.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SaltFiles {
    /// The `f32[N, 512]` projector representation matrix, row-aligned with the node stream.
    ///
    /// An array file.
    pub representations: Binding<artifact::Representations>,
    /// The `f32[T, 3072]` card embedding matrix in ontology row order.
    ///
    /// An array file.
    pub card_embeddings: Binding<artifact::CardEmbeddings>,
    /// The card text hashes, one SHA-256 per ontology row.
    ///
    /// The reuse key of the card embedding matrix. An array file.
    pub card_hashes: Binding<artifact::CardHashes>,
    /// The k-nearest-neighbour table, a sparse matrix file.
    pub knn: Binding<artifact::Knn>,
    /// The fuzzy semantic graph, a sparse matrix file.
    pub semantic: Binding<artifact::Semantic>,
    /// The landmark skeleton.
    ///
    /// Selected rows, assignment, and layout coordinates in one combined file.
    pub landmarks: Binding<artifact::Landmarks>,
    /// The fitted relation-policy classifier.
    ///
    /// Coefficient rows, applicability moments, and training distances in one combined file.
    pub classifier: Binding<artifact::Classifier>,
    /// The resolved geometry policy table, one record per relation type, ascending by relation.
    ///
    /// A policy file.
    pub policy: Binding<artifact::Policy>,
    /// The attraction index.
    ///
    /// Force-bearing link instances grouped by relation type, one combined attraction file.
    pub attraction: Binding<artifact::Attraction>,
    /// The protection index.
    ///
    /// The symmetric no-repel evidence matrix, a sparse matrix file.
    pub protection: Binding<artifact::Protection>,
    /// The canonical `f32[N, 2]` coordinates, row-aligned with the node stream.
    ///
    /// An array file.
    pub coordinates: Binding<artifact::Coordinates>,
    /// The Morton code column in base delivery order with its bucket fenceposts and page index.
    ///
    /// One combined morton file.
    pub morton: Binding<artifact::Morton>,
    /// The quadtree topology.
    ///
    /// The tile node table and its per-node direct-type sets, one combined quad file.
    pub quad: Binding<artifact::Quad>,
    /// The type postings.
    ///
    /// Per-type membership over the base delivery order and the type graph's direct parent edges,
    /// one combined postings file.
    pub postings: Binding<artifact::Postings>,
    /// The wire `f32[N, 2]` coordinates in base delivery order.
    ///
    /// Normalized into the `[-1, 1]` frame. An array file.
    pub wire_coordinates: Binding<artifact::WireCoordinates>,
    /// Each base position's importance rank, `u32[N]`.
    ///
    /// An array file.
    pub rank_of_position: Binding<artifact::RankOfPosition>,
    /// Each rank's base position, `u32[N]`: the traversal order of filter registration.
    ///
    /// An array file.
    pub position_of_rank: Binding<artifact::PositionOfRank>,
    /// Each node row's base position, `u32[N]`.
    ///
    /// The permutation the filter contract maps entity bitmaps through. An array file.
    pub position_of_row: Binding<artifact::PositionOfRow>,
    /// Each base position's node row, `u32[N]`.
    ///
    /// The gather order that assembles any row-aligned column into base order. An array file.
    pub row_of_position: Binding<artifact::RowOfPosition>,
    /// The node identities.
    ///
    /// Source id per node row and the sorted lookup pairs, one identity file.
    pub node_identities: Binding<artifact::NodeIdentities>,
    /// The edge identities.
    ///
    /// Source id per edge row and the sorted lookup pairs, one identity file.
    pub edge_identities: Binding<artifact::EdgeIdentities>,
    /// The ontology identities.
    ///
    /// Source type id per ontology row and the sorted lookup pairs, one identity file.
    pub ontology_identities: Binding<artifact::OntologyIdentities>,
    /// The `u64[E, 2]` endpoint column: each edge row's source and target node rows.
    ///
    /// An array file.
    pub edge_endpoints: Binding<artifact::EdgeEndpoints>,
    /// The incident-edge adjacency.
    ///
    /// Per-node outgoing and incoming edge rows over one value array, one combined adjacency file.
    pub adjacency: Binding<artifact::Adjacency>,
    /// The trained projector checkpoint, the framework's named `MessagePack` record.
    ///
    /// `None` records that the coordinates came from the landmark baseline, not a trained model.
    pub projector: Option<Binding<artifact::Projector>>,
    /// The reviewed-verdicts document supplied to the fit, staged verbatim.
    ///
    /// The trainer's human-review input. `None` records that the fit ran without one.
    pub reviewed_verdicts: Option<Binding<artifact::ReviewedVerdicts>>,
    /// The annotation-corpus document the run fitted the classifier from, staged verbatim.
    ///
    /// `None` records that the run received a supplied classifier instead of fitting one.
    pub annotation_corpus: Option<Binding<artifact::AnnotationCorpus>>,
    /// The `f32[R, 3072]` annotation card embedding matrix, row-aligned with the assembled corpus.
    ///
    /// An array file. Present exactly when the corpus is.
    pub annotation_embeddings: Option<Binding<artifact::AnnotationEmbeddings>>,
    /// The annotation card text hashes, one SHA-256 per assembled row.
    ///
    /// The reuse key of the annotation embedding matrix. An array file, present exactly when the
    /// corpus is.
    pub annotation_hashes: Option<Binding<artifact::AnnotationHashes>>,
}

impl SaltFiles {
    /// Returns every file of the generation, in role order.
    ///
    /// The projector, supplied-verdicts, and annotation roles appear exactly when the run staged
    /// them.
    ///
    /// Destructuring keeps the list total: a new role fails compilation here until this method
    /// lists it.
    pub(crate) fn files(&self) -> impl Iterator<Item = RepositoryFile> {
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
            postings,
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
            projector,
            reviewed_verdicts,
            annotation_corpus,
            annotation_embeddings,
            annotation_hashes,
        } = self;

        [
            representations.file(),
            card_embeddings.file(),
            card_hashes.file(),
            knn.file(),
            semantic.file(),
            landmarks.file(),
            classifier.file(),
            policy.file(),
            attraction.file(),
            protection.file(),
            coordinates.file(),
            morton.file(),
            quad.file(),
            postings.file(),
            wire_coordinates.file(),
            rank_of_position.file(),
            position_of_rank.file(),
            position_of_row.file(),
            row_of_position.file(),
            node_identities.file(),
            edge_identities.file(),
            ontology_identities.file(),
            edge_endpoints.file(),
            adjacency.file(),
        ]
        .into_iter()
        .chain(projector.as_ref().map(Binding::file))
        .chain(reviewed_verdicts.as_ref().map(Binding::file))
        .chain(annotation_corpus.as_ref().map(Binding::file))
        .chain(annotation_embeddings.as_ref().map(Binding::file))
        .chain(annotation_hashes.as_ref().map(Binding::file))
    }
}

/// One published SALT generation.
///
/// The version leads the serialized document, so readers reject a repository of another layout
/// before interpreting anything else.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SaltRepository {
    pub version: RepositoryVersion,
    pub files: SaltFiles,
    pub metadata: SaltMetadata,
}
