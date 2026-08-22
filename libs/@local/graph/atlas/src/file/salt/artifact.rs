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
        generation::METADATA_FILE,
        repository::{Artifact, FileName},
    },
    identity::{BasePosition, ImportanceRank, NodeRowId},
    math::Vec2,
};

/// Declares one artifact marker with its pinned file name.
macro_rules! artifact {
    ($($(#[$doc:meta])* $name:ident = $file:literal),+) => {
        const ARTIFACTS: [&str; ${count($file)}] = [$($file),+];

        $(
            artifact!(@impl $(#[$doc])* $name = $file);
        )+
    };
    (@impl $(#[$doc:meta])* $name:ident = $file:literal) => {
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
    Representations = "representations.arr",
    /// The card embedding matrix in ontology row order.
    CardEmbeddings = "card-embeddings.arr",
    /// The card text hashes, one SHA-256 per ontology row.
    CardHashes = "card-hashes.arr",
    /// The corpus-domain k-nearest-neighbour table.
    Knn = "knn.sprs",
    /// The corpus-domain fuzzy semantic graph.
    Semantic = "semantic.sprs",
    /// The landmark skeleton over the corpus row domain.
    Landmarks = "landmarks.lndm",
    /// The fitted relation-policy classifier.
    Classifier = "classifier.clsf",
    /// The resolved geometry policy table, ascending by relation.
    Policy = "policy.plcy",
    /// The corpus-domain attraction index.
    Attraction = "attraction.atrc",
    /// The corpus-domain protection index.
    Protection = "protection.sprs",
    /// The trained projector checkpoint.
    Projector = "projector.mpk",
    /// The canonical coordinate column, row-aligned with the node stream.
    Coordinates = "coordinates.arr",
    /// The Morton code column in base delivery order.
    Morton = "morton.mrtn",
    /// The quadtree topology.
    Quad = "quadtree.quad",
    /// The type postings over the base delivery order.
    Postings = "postings.post",
    /// The wire coordinate column in base delivery order.
    WireCoordinates = "wire-coordinates.arr",
    /// Each base position's importance rank.
    RankOfPosition = "rank-of-position.arr",
    /// Each rank's base position.
    PositionOfRank = "position-of-rank.arr",
    /// Each node row's base position.
    PositionOfRow = "position-of-row.arr",
    /// Each base position's node row.
    RowOfPosition = "row-of-position.arr",
    /// The node identities.
    NodeIdentities = "node-identities.idnt",
    /// The edge identities.
    EdgeIdentities = "edge-identities.idnt",
    /// The ontology identities.
    OntologyIdentities = "ontology-identities.idnt",
    /// The endpoint column holding each edge row's source and target node rows.
    EdgeEndpoints = "edge-endpoints.arr",
    /// The incident-edge adjacency.
    Adjacency = "adjacency.sprs",
    /// The reviewed-verdicts document supplied to the fit, staged verbatim.
    ReviewedVerdicts = "reviewed-verdicts.json",
    /// The annotation-corpus document the run fitted the classifier from, staged verbatim.
    AnnotationCorpus = "annotation-corpus.json",
    /// The annotation card embedding matrix, row-aligned with the assembled corpus.
    AnnotationEmbeddings = "annotation-embeddings.arr",
    /// The annotation card text hashes, one SHA-256 per assembled row.
    AnnotationHashes = "annotation-hashes.arr"
);

const _: () = {
    let mut index = 0;

    while index < ARTIFACTS.len() {
        let mut ptr = index + 1;

        assert!(ARTIFACTS[0] != METADATA_FILE);
        while ptr < ARTIFACTS.len() {
            assert!(ARTIFACTS[ptr] != ARTIFACTS[index]);
            ptr += 1;
        }

        index += 1;
    }
};

// The served column set, each admitted from exactly its own row domain and element type, so two
// permutation columns of equal width cannot swap at the write.
impl WriteAs<Coordinates> for SizedColumn<NodeRowId, Vec2> {}
impl WriteAs<WireCoordinates> for SizedColumn<BasePosition, Vec2> {}
impl WriteAs<RankOfPosition> for SizedColumn<BasePosition, ImportanceRank> {}
impl WriteAs<PositionOfRank> for SizedColumn<ImportanceRank, BasePosition> {}
impl WriteAs<PositionOfRow> for SizedColumn<NodeRowId, BasePosition> {}
impl WriteAs<RowOfPosition> for SizedColumn<BasePosition, NodeRowId> {}
