//! Migrating published generations across artifact-format changes.
//!
//! [`migrate_adjacency`] republishes one generation with its retired
//! `.adjc` adjacency converted to the structure-only sparse matrix
//! serving reads. Every other artifact carries over bit for bit (hard
//! links where the filesystem allows), and the metadata document's
//! adjacency entry is the one field that changes. The result is a NEW
//! generation: a directory is named by the SHA-256 of its metadata
//! document, so the source generation stays untouched and the migrated
//! one is distinguishable by identity alone. When the source
//! generation was the root's current one, the pointer moves to the
//! migrated generation, completing the migration; otherwise activation
//! stays the operator's decision.
//!
//! The conversion needs no store access: the retired file's bytes hold
//! the full lists, verified against the document's recorded digest
//! before parsing, and the current write path republishes them - the
//! same lists a fresh fit derives, byte for byte. A generation already
//! carrying the current format refuses the migration instead of
//! republishing a duplicate.

use std::{fs, io};

use camino::Utf8Path;

use super::role::Role;
use crate::{
    file::{
        generation::{
            ActivateError, CurrentError, GenerationId, GenerationRoot, METADATA_FILE, SealError,
            document_digest,
        },
        repository::{FileName, RepositoryFile},
        salt::SaltRepository,
        sprs::write::WriteSprsError,
    },
    integrity::Sha256Digest,
    salt::adjacency::legacy::{LegacyAdjacencyError, read_legacy},
};

/// One completed migration.
#[derive(Debug, Copy, Clone)]
pub(crate) struct MigrateOutcome {
    /// The republished generation.
    pub published: GenerationId,
    /// Whether the root's pointer moved to the republished generation,
    /// which it does exactly when the source generation was current.
    pub activated: bool,
}

/// Migrating a generation failed.
///
/// Every failure leaves the source generation untouched; the staging
/// directory of a failed attempt is dot-prefixed transient state.
#[derive(Debug)]
pub(crate) enum MigrateError {
    /// A file operation failed.
    Io(io::Error),
    /// The source generation is not published in this root.
    Unpublished(GenerationId),
    /// The source metadata document does not hash to the generation's
    /// identity.
    Identity {
        /// The claimed identity.
        id: GenerationId,
        /// The digest of the document as read.
        actual: Sha256Digest,
    },
    /// The source metadata document is not JSON, or the spliced
    /// document does not parse as a repository.
    Document(serde_json::Error),
    /// The source document's file roster misses an entry or shapes it
    /// without a name.
    Roster {
        /// The roster field that failed to read.
        field: String,
    },
    /// The source generation already carries the current adjacency
    /// format.
    AlreadyCurrent(GenerationId),
    /// The retired adjacency's bytes do not hash to the digest the
    /// document records.
    Artifact {
        /// The recorded digest.
        expected: Sha256Digest,
        /// The digest of the bytes as read.
        actual: Sha256Digest,
    },
    /// The retired adjacency's bytes failed to parse.
    Legacy(LegacyAdjacencyError),
    /// The converted adjacency failed to write.
    Write(WriteSprsError),
    /// The spliced document lost or reshaped a field: the typed
    /// round-trip did not reproduce it.
    Splice,
    /// Sealing the republished generation failed.
    Seal(SealError),
    /// Reading the root's pointer failed.
    Current(CurrentError),
    /// Moving the root's pointer failed.
    Activate(ActivateError),
}

impl core::fmt::Display for MigrateError {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "a file operation failed: {error}"),
            Self::Unpublished(id) => {
                write!(formatter, "generation {id} is not published in this root")
            }
            Self::Identity { id, actual } => write!(
                formatter,
                "the metadata document hashes to {actual}, not to the claimed identity {id}",
            ),
            Self::Document(error) => {
                write!(formatter, "the metadata document failed to parse: {error}")
            }
            Self::Roster { field } => write!(
                formatter,
                "the document's file roster holds no readable `{field}` entry",
            ),
            Self::AlreadyCurrent(id) => write!(
                formatter,
                "generation {id} already carries the current adjacency format",
            ),
            Self::Artifact { expected, actual } => write!(
                formatter,
                "the retired adjacency hashes to {actual} where the document records {expected}",
            ),
            Self::Legacy(error) => {
                write!(formatter, "the retired adjacency failed to parse: {error}")
            }
            Self::Write(error) => {
                write!(
                    formatter,
                    "the converted adjacency failed to write: {error}"
                )
            }
            Self::Splice => write!(
                formatter,
                "the spliced document did not survive the typed round-trip",
            ),
            Self::Seal(error) => write!(formatter, "sealing the generation failed: {error}"),
            Self::Current(error) => write!(formatter, "reading the root pointer failed: {error}"),
            Self::Activate(error) => write!(formatter, "moving the root pointer failed: {error}"),
        }
    }
}

impl core::error::Error for MigrateError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Document(error) => Some(error),
            Self::Legacy(error) => Some(error),
            Self::Write(error) => Some(error),
            Self::Seal(error) => Some(error),
            Self::Current(error) => Some(error),
            Self::Activate(error) => Some(error),
            Self::Unpublished(_)
            | Self::Identity { .. }
            | Self::Roster { .. }
            | Self::AlreadyCurrent(_)
            | Self::Artifact { .. }
            | Self::Splice => None,
        }
    }
}

/// The retired adjacency file name the migration converts from.
const LEGACY_ADJACENCY: &str = "adjacency.adjc";

/// Republishes generation `id` with its adjacency converted to the
/// current structure-only sparse matrix format.
///
/// Verifies the retired file's bytes against the document's recorded
/// digest, republishes the same lists through the current write path,
/// carries every other artifact over bit for bit, and seals the
/// patched metadata document as a new generation in the same root.
/// Moves the root's pointer exactly when the source generation was
/// current. The source generation is never modified.
///
/// # Errors
///
/// Returns an error when the source generation is missing, corrupt, or
/// already current; when the retired adjacency fails its digest check
/// or parse; and when staging, sealing, or activating fails. No
/// failure modifies the source generation.
#[expect(
    clippy::significant_drop_tightening,
    reason = "the staging directory must live until seal consumes it; its drop is the \
              failure-path cleanup"
)]
#[tracing::instrument(skip_all, fields(generation = %id))]
pub(crate) fn migrate_adjacency(
    root: &GenerationRoot,
    id: GenerationId,
) -> Result<MigrateOutcome, MigrateError> {
    let path = root.generation_path(id);
    let (mut document, roster) = read_source(&path, id)?;

    // The retired file, verified against the document before parsing:
    // the digest pins the exact bytes the generation published, so the
    // lists inside were validated then and re-derive verbatim.
    let recorded = roster_entry(&document)?;
    let bytes = fs::read(path.join(LEGACY_ADJACENCY)).map_err(MigrateError::Io)?;
    let actual = document_digest(&bytes);
    if actual != recorded {
        return Err(MigrateError::Artifact {
            expected: recorded,
            actual,
        });
    }
    let adjacency = read_legacy(&bytes).map_err(MigrateError::Legacy)?;

    // Stage the republished generation: every artifact but the retired
    // adjacency carries over bit for bit, the conversion writes fresh,
    // and the spliced document seals the set under its new identity.
    let staged = root.stage().map_err(MigrateError::Io)?;
    for name in &roster {
        if name.as_str() == LEGACY_ADJACENCY {
            continue;
        }
        carry(&path.join(name.as_str()), &staged.path_of(name)).map_err(MigrateError::Io)?;
    }
    let name = Role::Adjacency.file_name();
    let hash = adjacency
        .write_into(staged.create(&name).map_err(MigrateError::Io)?)
        .map_err(MigrateError::Write)?;

    let entry =
        serde_json::to_value(RepositoryFile { name, hash }).map_err(MigrateError::Document)?;
    let slot = document
        .get_mut("files")
        .and_then(|files| files.get_mut("adjacency"))
        .ok_or(MigrateError::Splice)?;
    *slot = entry;

    // The typed round-trip is the splice's proof: the current parser
    // accepts the document and reproduces it field for field, so the
    // republished generation is one a current reader speaks. The
    // comparison goes through text on both sides - a float re-parses
    // to its canonical shortest representation either way, where a
    // value-level comparison would widen `f32` fields through `f64`
    // and never compare equal.
    let repository: SaltRepository =
        serde_json::from_value(document.clone()).map_err(MigrateError::Document)?;
    let round_trip: serde_json::Value =
        serde_json::from_slice(&serde_json::to_vec(&repository).map_err(MigrateError::Document)?)
            .map_err(MigrateError::Document)?;
    if round_trip != document {
        return Err(MigrateError::Splice);
    }

    let published = staged.seal(&repository).map_err(MigrateError::Seal)?;
    let published = published.id();

    let activated = root.current().map_err(MigrateError::Current)? == Some(id);
    if activated {
        root.activate(published).map_err(MigrateError::Activate)?;
    }

    Ok(MigrateOutcome {
        published,
        activated,
    })
}

/// Reads and verifies the source generation's raw document and the
/// roster of artifacts it names.
///
/// The document reads as JSON rather than through the typed parser, so
/// the migration diagnoses its own guard - the adjacency entry's name -
/// instead of whatever field a schema-mismatched parse trips first;
/// the bytes are verified against the identity the same way a typed
/// open is.
fn read_source(
    path: &Utf8Path,
    id: GenerationId,
) -> Result<(serde_json::Value, Vec<FileName>), MigrateError> {
    let bytes = match fs::read(path.join(METADATA_FILE)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err(MigrateError::Unpublished(id));
        }
        Err(error) => return Err(MigrateError::Io(error)),
    };
    let actual = document_digest(&bytes);
    if actual != id.digest() {
        return Err(MigrateError::Identity { id, actual });
    }
    let document: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(MigrateError::Document)?;

    let files = document
        .get("files")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| MigrateError::Roster {
            field: "files".to_owned(),
        })?;
    let adjacency = files
        .get("adjacency")
        .and_then(|entry| entry.get("name"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| MigrateError::Roster {
            field: "adjacency".to_owned(),
        })?;
    if adjacency != LEGACY_ADJACENCY {
        return Err(MigrateError::AlreadyCurrent(id));
    }

    let mut roster = Vec::new();
    for (field, value) in files {
        if value.is_null() {
            continue;
        }
        let name = value
            .get("name")
            .and_then(serde_json::Value::as_str)
            .and_then(|name| FileName::new(name.to_owned()))
            .ok_or_else(|| MigrateError::Roster {
                field: field.clone(),
            })?;
        roster.push(name);
    }

    Ok((document, roster))
}

/// Reads the retired adjacency's recorded digest off the document.
fn roster_entry(document: &serde_json::Value) -> Result<Sha256Digest, MigrateError> {
    document
        .get("files")
        .and_then(|files| files.get("adjacency"))
        .and_then(|entry| entry.get("hash"))
        .and_then(serde_json::Value::as_str)
        .and_then(|hex| hex.parse().ok())
        .ok_or_else(|| MigrateError::Roster {
            field: "adjacency".to_owned(),
        })
}

/// Carries one artifact into the staging directory.
///
/// A hard link preserves the bytes without copying them; a root
/// spanning filesystems cannot link, so the fallback copy pays the
/// bytes for the same bit-for-bit result.
fn carry(source: &Utf8Path, target: &Utf8Path) -> io::Result<()> {
    match fs::hard_link(source, target) {
        Ok(()) => Ok(()),
        Err(_) => fs::copy(source, target).map(drop),
    }
}
