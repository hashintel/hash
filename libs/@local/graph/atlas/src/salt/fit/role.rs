//! Artifact roles and staged-write plumbing shared by the fit stages.

use std::{
    fs::File,
    io::{self, BufWriter, Write as _},
};

use camino::Utf8Path;

use crate::{
    file::{
        array::{ArrayVariant, ArrayWriter, Dim},
        generation::StagedGeneration,
        repository::{FileName, RepositoryFile},
    },
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
    Coordinates,
    Morton,
    WireCoordinates,
    RankOfPosition,
    PositionOfRank,
    PositionOfRow,
    RowOfPosition,
    NodeIdentities,
    EdgeIdentities,
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
            Self::Coordinates => FileName::pinned("coordinates.arr"),
            Self::Morton => FileName::pinned("morton.mrtn"),
            Self::WireCoordinates => FileName::pinned("wire-coordinates.arr"),
            Self::RankOfPosition => FileName::pinned("rank-of-position.arr"),
            Self::PositionOfRank => FileName::pinned("position-of-rank.arr"),
            Self::PositionOfRow => FileName::pinned("position-of-row.arr"),
            Self::RowOfPosition => FileName::pinned("row-of-position.arr"),
            Self::NodeIdentities => FileName::pinned("node-identities.idnt"),
            Self::EdgeIdentities => FileName::pinned("edge-identities.idnt"),
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
const _: [FileName; 17] = [
    Role::Representations.file_name(),
    Role::CardEmbeddings.file_name(),
    Role::CardHashes.file_name(),
    Role::Knn.file_name(),
    Role::Semantic.file_name(),
    Role::Landmarks.file_name(),
    Role::Classifier.file_name(),
    Role::Policy.file_name(),
    Role::Coordinates.file_name(),
    Role::Morton.file_name(),
    Role::WireCoordinates.file_name(),
    Role::RankOfPosition.file_name(),
    Role::PositionOfRank.file_name(),
    Role::PositionOfRow.file_name(),
    Role::RowOfPosition.file_name(),
    Role::NodeIdentities.file_name(),
    Role::EdgeIdentities.file_name(),
];

/// Runs `write` against the role's buffered staged file, surfacing
/// flush errors, and binds the written digest to the role.
pub(super) fn write_staged(
    staging: &StagedGeneration,
    role: Role,
    write: impl FnOnce(&mut BufWriter<File>) -> io::Result<Sha256Digest>,
) -> io::Result<RepositoryFile> {
    let mut writer = BufWriter::new(staging.create(&role.file_name())?);
    let digest = write(&mut writer)?;
    writer.flush()?;

    Ok(role.file(digest))
}

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

/// Stages one array column row by row and binds the sealed file's
/// digest to the role.
///
/// The digest streams over the finished file because the array writer
/// seals its header by seeking.
pub(super) fn stage_column(
    staging: &StagedGeneration,
    role: Role,
    variant: ArrayVariant,
    row_dims: &[Dim],
    rows: impl Iterator<Item: AsRef<[u8]>>,
) -> io::Result<RepositoryFile> {
    {
        let mut writer = BufWriter::new(staging.create(&role.file_name())?);
        let mut array = ArrayWriter::new(&mut writer, variant, row_dims)?;
        for row in rows {
            array.write_row(row.as_ref())?;
        }
        array.finish()?;
    }

    let digest = digest_file(staging.path_of(&role.file_name()))?;
    Ok(role.file(digest))
}
