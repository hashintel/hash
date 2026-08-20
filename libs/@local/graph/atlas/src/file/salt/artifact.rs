//! The artifact classes of one SALT generation.
//!
//! Each marker names one artifact of the repository and pins its file name, so a binding, a
//! staged write, and a manifest slot all speak the same typed vocabulary. A write is admitted
//! per artifact through [`WriteAs`] impls beside the value types, which
//! makes the set of values allowed to produce each file a checkable fact rather than a
//! convention.
//!
//! Every name is distinct and none claims the metadata document's own name, which the test below
//! holds. A sealed manifest therefore cannot repeat a name or shadow the document, and the seal
//! re-checks neither.

use crate::{
    file::{
        WriteAs,
        array::SizedColumn,
        repository::{Artifact, FileName},
    },
    identity::{BasePosition, ImportanceRank, NodeRowId},
    math::Vec2,
};

/// Declares one artifact marker with its pinned file name.
macro_rules! artifact {
    ($(#[$doc:meta])* $name:ident = $file:literal) => {
        $(#[$doc])*
        #[derive(Debug, Copy, Clone, PartialEq, Eq)]
        pub(crate) struct $name;

        impl Artifact for $name {
            const NAME: FileName = FileName::pinned($file);
        }
    };
}

artifact!(
    /// The projector representation matrix, row-aligned with the node stream.
    Representations = "representations.arr"
);
artifact!(
    /// The card embedding matrix in ontology row order.
    CardEmbeddings = "card-embeddings.arr"
);
artifact!(
    /// The card text hashes, one SHA-256 per ontology row.
    CardHashes = "card-hashes.arr"
);
artifact!(
    /// The corpus-domain k-nearest-neighbour table.
    Knn = "knn.sprs"
);
artifact!(
    /// The corpus-domain fuzzy semantic graph.
    Semantic = "semantic.sprs"
);
artifact!(
    /// The landmark skeleton over the corpus row domain.
    Landmarks = "landmarks.lndm"
);
artifact!(
    /// The fitted relation-policy classifier.
    Classifier = "classifier.clsf"
);
artifact!(
    /// The resolved geometry policy table, ascending by relation.
    Policy = "policy.plcy"
);
artifact!(
    /// The corpus-domain attraction index.
    Attraction = "attraction.atrc"
);
artifact!(
    /// The corpus-domain protection index.
    Protection = "protection.sprs"
);
artifact!(
    /// The trained projector checkpoint.
    Projector = "projector.mpk"
);
artifact!(
    /// The canonical coordinate column, row-aligned with the node stream.
    Coordinates = "coordinates.arr"
);
artifact!(
    /// The Morton code column in base delivery order.
    Morton = "morton.mrtn"
);
artifact!(
    /// The quadtree topology.
    Quad = "quadtree.quad"
);
artifact!(
    /// The type postings over the base delivery order.
    Postings = "postings.post"
);
artifact!(
    /// The wire coordinate column in base delivery order.
    WireCoordinates = "wire-coordinates.arr"
);
artifact!(
    /// Each base position's importance rank.
    RankOfPosition = "rank-of-position.arr"
);
artifact!(
    /// Each rank's base position.
    PositionOfRank = "position-of-rank.arr"
);
artifact!(
    /// Each node row's base position.
    PositionOfRow = "position-of-row.arr"
);
artifact!(
    /// Each base position's node row.
    RowOfPosition = "row-of-position.arr"
);
artifact!(
    /// The node identities.
    NodeIdentities = "node-identities.idnt"
);
artifact!(
    /// The edge identities.
    EdgeIdentities = "edge-identities.idnt"
);
artifact!(
    /// The ontology identities.
    OntologyIdentities = "ontology-identities.idnt"
);
artifact!(
    /// The endpoint column holding each edge row's source and target node rows.
    EdgeEndpoints = "edge-endpoints.arr"
);
artifact!(
    /// The incident-edge adjacency.
    Adjacency = "adjacency.sprs"
);
artifact!(
    /// The reviewed-verdicts document supplied to the fit, staged verbatim.
    ReviewedVerdicts = "reviewed-verdicts.json"
);
artifact!(
    /// The annotation-corpus document the run fitted the classifier from, staged verbatim.
    AnnotationCorpus = "annotation-corpus.json"
);
artifact!(
    /// The annotation card embedding matrix, row-aligned with the assembled corpus.
    AnnotationEmbeddings = "annotation-embeddings.arr"
);
artifact!(
    /// The annotation card text hashes, one SHA-256 per assembled row.
    AnnotationHashes = "annotation-hashes.arr"
);

// The served column set, each admitted from exactly its own row domain and element type, so two
// permutation columns of equal width cannot swap at the write.
impl WriteAs<Coordinates> for SizedColumn<NodeRowId, Vec2> {}
impl WriteAs<WireCoordinates> for SizedColumn<BasePosition, Vec2> {}
impl WriteAs<RankOfPosition> for SizedColumn<BasePosition, ImportanceRank> {}
impl WriteAs<PositionOfRank> for SizedColumn<ImportanceRank, BasePosition> {}
impl WriteAs<PositionOfRow> for SizedColumn<NodeRowId, BasePosition> {}
impl WriteAs<RowOfPosition> for SizedColumn<BasePosition, NodeRowId> {}

#[cfg(test)]
mod tests {
    use super::Artifact as _;
    use crate::file::{generation::METADATA_FILE, repository::FileName};

    /// Every pinned artifact name, in manifest order.
    fn names() -> [FileName; 29] {
        [
            super::Representations::NAME,
            super::CardEmbeddings::NAME,
            super::CardHashes::NAME,
            super::Knn::NAME,
            super::Semantic::NAME,
            super::Landmarks::NAME,
            super::Classifier::NAME,
            super::Policy::NAME,
            super::Attraction::NAME,
            super::Protection::NAME,
            super::Projector::NAME,
            super::Coordinates::NAME,
            super::Morton::NAME,
            super::Quad::NAME,
            super::Postings::NAME,
            super::WireCoordinates::NAME,
            super::RankOfPosition::NAME,
            super::PositionOfRank::NAME,
            super::PositionOfRow::NAME,
            super::RowOfPosition::NAME,
            super::NodeIdentities::NAME,
            super::EdgeIdentities::NAME,
            super::OntologyIdentities::NAME,
            super::EdgeEndpoints::NAME,
            super::Adjacency::NAME,
            super::ReviewedVerdicts::NAME,
            super::AnnotationCorpus::NAME,
            super::AnnotationEmbeddings::NAME,
            super::AnnotationHashes::NAME,
        ]
    }

    #[test]
    fn names_distinct() {
        let names = names();
        for (position, name) in names.iter().enumerate() {
            assert!(
                !names[position + 1..].contains(name),
                "the artifact name {} is pinned twice",
                name.as_str(),
            );
        }
    }

    #[test]
    fn metadata_name_unclaimed() {
        assert!(
            names().iter().all(|name| name.as_str() != METADATA_FILE),
            "an artifact claims the metadata document's name",
        );
    }
}
