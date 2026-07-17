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

mod metadata;

/// The files of one SALT generation, by role.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SaltFiles {
    /// The canonical entity embeddings, an `f32` array file.
    pub embeddings: RepositoryFile,
}

/// One published SALT generation.
///
/// The version leads the serialized document, so readers reject a
/// repository of another layout before interpreting anything else.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SaltRepository {
    pub version: RepositoryVersion,
    pub files: SaltFiles,
    pub metadata: SaltMetadata,
}
