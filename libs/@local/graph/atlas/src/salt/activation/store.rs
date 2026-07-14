use std::{
    fs::{self, File, OpenOptions},
    io::{self, BufReader},
};

use camino::{Utf8Path, Utf8PathBuf};
use serde::{Deserialize, Serialize};
use tempfile::NamedTempFile;

use super::error::ActivationError;
use crate::salt::{
    hash::ContentHash,
    release::{GatedRelease, ReleaseHead},
};

const ACTIVE_FILE: &str = "active.json";
const CANDIDATE_FILE: &str = "candidate.json";
const LOCK_FILE: &str = ".activation.lock";

/// The exact immutable head and gate report visible to readers.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ActiveRelease {
    head: ReleaseHead,
    report: ContentHash,
}

impl ActiveRelease {
    /// Returns the active immutable generation head.
    #[must_use]
    #[inline]
    pub(crate) const fn head(self) -> ReleaseHead {
        self.head
    }

    /// Returns the release report authorizing the active head.
    #[must_use]
    #[inline]
    pub(crate) const fn report(self) -> ContentHash {
        self.report
    }
}

impl From<GatedRelease> for ActiveRelease {
    #[inline]
    fn from(release: GatedRelease) -> Self {
        Self {
            head: release.head(),
            report: release.report(),
        }
    }
}

/// Result of an explicit activation compare-and-swap.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ActivationOutcome {
    Activated(ActiveRelease),
    AlreadyActive(ActiveRelease),
    Conflict { actual: Option<ActiveRelease> },
}

/// Filesystem activation pointer guarded by a process-shared file lock.
#[derive(Debug, Clone)]
pub(crate) struct FileActivationStore {
    root: Utf8PathBuf,
}

impl FileActivationStore {
    /// Binds activation state beneath `root`.
    #[must_use]
    pub(crate) fn new(root: impl Into<Utf8PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Loads the current active pointer.
    ///
    /// # Errors
    ///
    /// This returns an error when the pointer cannot be read or decoded.
    pub(crate) fn current(&self) -> Result<Option<ActiveRelease>, ActivationError> {
        read_optional_json(&self.root.join(ACTIVE_FILE))
    }

    /// Activates a gated candidate if `expected` still names the active head.
    ///
    /// The candidate marker is verified before taking the activation lock.
    /// Under the lock, an already-active desired head succeeds idempotently;
    /// otherwise a mismatched expected head reports a conflict without writing.
    /// The replacement pointer is synced before an atomic rename.
    ///
    /// # Errors
    ///
    /// This returns an error when the exact candidate marker is absent or
    /// different, lock or pointer I/O fails, or JSON cannot be encoded.
    pub(crate) fn compare_exchange(
        &self,
        expected: Option<ActiveRelease>,
        desired: GatedRelease,
    ) -> Result<ActivationOutcome, ActivationError> {
        let desired = ActiveRelease::from(desired);
        verify_candidate(&self.root, desired)?;
        fs::create_dir_all(&self.root)?;
        let lock = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(self.root.join(LOCK_FILE))?;
        lock.lock()?;

        let actual = self.current()?;
        if actual == Some(desired) {
            return Ok(ActivationOutcome::AlreadyActive(desired));
        }
        if actual != expected {
            return Ok(ActivationOutcome::Conflict { actual });
        }
        publish_json(&self.root.join(ACTIVE_FILE), &desired)?;
        Ok(ActivationOutcome::Activated(desired))
    }
}

/// Publishes the discoverability marker for a fully written gated candidate.
///
/// The generation directory must already exist. Calling this operation is the
/// final candidate-publication step before activation.
///
/// # Errors
///
/// This returns an error when the marker cannot be encoded, synced, or renamed
/// into the generation directory.
pub(crate) fn publish_candidate_marker(
    root: &Utf8Path,
    release: GatedRelease,
) -> Result<(), ActivationError> {
    let release = ActiveRelease::from(release);
    publish_json(&candidate_path(root, release.head), &release)
}

fn verify_candidate(root: &Utf8Path, desired: ActiveRelease) -> Result<(), ActivationError> {
    let path = candidate_path(root, desired.head);
    let candidate = read_optional_json(&path)?.ok_or(ActivationError::MissingCandidate {
        generation: desired.head.generation,
    })?;
    if candidate != desired {
        return Err(ActivationError::CandidateMismatch {
            generation: desired.head.generation,
        });
    }
    Ok(())
}

fn candidate_path(root: &Utf8Path, head: ReleaseHead) -> Utf8PathBuf {
    root.join("generations")
        .join(head.generation.to_string())
        .join(CANDIDATE_FILE)
}

fn read_optional_json(path: &Utf8Path) -> Result<Option<ActiveRelease>, ActivationError> {
    match File::open(path) {
        Ok(file) => Ok(Some(serde_json::from_reader(BufReader::new(file))?)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn publish_json(path: &Utf8Path, value: &ActiveRelease) -> Result<(), ActivationError> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("activation path {path} has no parent directory"),
        )
    })?;
    let temporary = NamedTempFile::new_in(parent)?;
    serde_json::to_writer(temporary.as_file(), value)?;
    temporary.as_file().sync_all()?;
    temporary.persist(path)?;
    File::open(parent)?.sync_all()?;
    Ok(())
}
