//! Reads and conditionally writes `run.json`.

use error_stack::Report;
use hash_crypto::digest::Sha256Digest;
use object_store::UpdateVersion;

use super::{Run, RunContext, RunId, StageError};

/// The version of a stored object that a conditional write compares against.
#[derive(Debug, Clone)]
pub(crate) enum MutableVersion {
    Object(UpdateVersion),
    Local(Sha256Digest),
}

/// Reads the `run.json` of `run` and its version, or `None` if the run has no `run.json`.
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if storage cannot be read
/// - [`Code::StoredJsonInvalid`] if the stored file is not a [`Run`]
///
/// [`Code::StorageUnavailable`]: super::Code::StorageUnavailable
/// [`Code::StoredJsonInvalid`]: super::Code::StoredJsonInvalid
pub(crate) async fn read(
    context: &RunContext,
    run: RunId,
) -> Result<Option<(Run, MutableVersion)>, Report<StageError>> {
    unimplemented!()
}

/// Writes `run` to its `run.json` if the stored file still has the version `expected`.
///
/// `expected` is `None` for a file that must not exist yet. Returns `false` if another writer
/// changed the file first; the caller reads the file again and decides whether to retry.
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if storage cannot be written
///
/// [`Code::StorageUnavailable`]: super::Code::StorageUnavailable
pub(crate) async fn write(
    context: &RunContext,
    run: &Run,
    expected: Option<&MutableVersion>,
) -> Result<bool, Report<StageError>> {
    unimplemented!()
}
