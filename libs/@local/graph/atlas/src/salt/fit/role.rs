//! Artifact roles: the fit's staged file names and their repository bindings.

use std::{fs::File, io};

use camino::Utf8Path;

use crate::{
    file::repository::{FileName, RepositoryFile},
    integrity::{Sha256, Sha256Digest, Writer},
};

/// The artifact roles one fit stages, each with its pinned file name.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum Role {
    Representations,
    CardEmbeddings,
    CardHashes,
    Knn,
    Semantic,
    Landmarks,
    Classifier,
    Policy,
    Attraction,
    Protection,
    Projector,
    Coordinates,
    Morton,
    Quad,
    Postings,
    WireCoordinates,
    RankOfPosition,
    PositionOfRank,
    PositionOfRow,
    RowOfPosition,
    NodeIdentities,
    EdgeIdentities,
    OntologyIdentities,
    EdgeEndpoints,
    Adjacency,
    ReviewedVerdicts,
    AnnotationCorpus,
    AnnotationEmbeddings,
    AnnotationHashes,
}

impl Role {
    /// Returns the role's staged file name.
    pub(super) const fn file_name(self) -> FileName {
        match self {
            Self::Representations => FileName::pinned("representations.arr"),
            Self::CardEmbeddings => FileName::pinned("card-embeddings.arr"),
            Self::CardHashes => FileName::pinned("card-hashes.arr"),
            Self::Knn => FileName::pinned("knn.sprs"),
            Self::Semantic => FileName::pinned("semantic.sprs"),
            Self::Landmarks => FileName::pinned("landmarks.lndm"),
            Self::Classifier => FileName::pinned("classifier.clsf"),
            Self::Policy => FileName::pinned("policy.plcy"),
            Self::Attraction => FileName::pinned("attraction.atrc"),
            Self::Protection => FileName::pinned("protection.sprs"),
            Self::Projector => FileName::pinned("projector.mpk"),
            Self::Coordinates => FileName::pinned("coordinates.arr"),
            Self::Morton => FileName::pinned("morton.mrtn"),
            Self::Quad => FileName::pinned("quadtree.quad"),
            Self::Postings => FileName::pinned("postings.post"),
            Self::WireCoordinates => FileName::pinned("wire-coordinates.arr"),
            Self::RankOfPosition => FileName::pinned("rank-of-position.arr"),
            Self::PositionOfRank => FileName::pinned("position-of-rank.arr"),
            Self::PositionOfRow => FileName::pinned("position-of-row.arr"),
            Self::RowOfPosition => FileName::pinned("row-of-position.arr"),
            Self::NodeIdentities => FileName::pinned("node-identities.idnt"),
            Self::EdgeIdentities => FileName::pinned("edge-identities.idnt"),
            Self::OntologyIdentities => FileName::pinned("ontology-identities.idnt"),
            Self::EdgeEndpoints => FileName::pinned("edge-endpoints.arr"),
            Self::Adjacency => FileName::pinned("adjacency.sprs"),
            Self::ReviewedVerdicts => FileName::pinned("reviewed-verdicts.json"),
            Self::AnnotationCorpus => FileName::pinned("annotation-corpus.json"),
            Self::AnnotationEmbeddings => FileName::pinned("annotation-embeddings.arr"),
            Self::AnnotationHashes => FileName::pinned("annotation-hashes.arr"),
        }
    }

    /// Binds the role's file name to its written digest.
    pub(super) const fn file(self, hash: Sha256Digest) -> RepositoryFile {
        RepositoryFile {
            name: self.file_name(),
            hash,
        }
    }
}

// Every pinned name validates at compile time.
const _: [FileName; 29] = [
    Role::Representations.file_name(),
    Role::CardEmbeddings.file_name(),
    Role::CardHashes.file_name(),
    Role::Knn.file_name(),
    Role::Semantic.file_name(),
    Role::Landmarks.file_name(),
    Role::Classifier.file_name(),
    Role::Policy.file_name(),
    Role::Attraction.file_name(),
    Role::Protection.file_name(),
    Role::Projector.file_name(),
    Role::Coordinates.file_name(),
    Role::Morton.file_name(),
    Role::Quad.file_name(),
    Role::Postings.file_name(),
    Role::WireCoordinates.file_name(),
    Role::RankOfPosition.file_name(),
    Role::PositionOfRank.file_name(),
    Role::PositionOfRow.file_name(),
    Role::RowOfPosition.file_name(),
    Role::NodeIdentities.file_name(),
    Role::EdgeIdentities.file_name(),
    Role::OntologyIdentities.file_name(),
    Role::EdgeEndpoints.file_name(),
    Role::Adjacency.file_name(),
    Role::ReviewedVerdicts.file_name(),
    Role::AnnotationCorpus.file_name(),
    Role::AnnotationEmbeddings.file_name(),
    Role::AnnotationHashes.file_name(),
];

/// Returns the SHA-256 of the file at `path`, streaming its bytes.
pub(super) fn digest_file(path: impl AsRef<Utf8Path>) -> io::Result<Sha256Digest> {
    let path = path.as_ref();
    let _span = tracing::info_span!("digest", file = %path).entered();

    let mut writer = Writer {
        accumulator: Sha256::new(),
        writer: io::sink(),
    };
    io::copy(&mut File::open(path)?, &mut writer)?;

    Ok(writer.accumulator.finalize())
}
