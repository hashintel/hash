use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read as _},
};

use burn::tensor::backend::Backend;
use camino::{Utf8Path, Utf8PathBuf};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use tempfile::NamedTempFile;

use super::{error::ActivationError, load::projector_config};
use crate::salt::{
    hash::ContentHash,
    manifest::{
        ArtifactRole, VerifiedArtifact, load_verified_manifest, verify_loaded_manifest_artifacts,
    },
    projector::{ConditionedProjector, load_projector_checkpoint_bytes},
    release::{
        ExternalGateVerifierSet, GateReport, GateVerifier, GatedRelease, ReleaseHead,
        load_gate_evidence,
    },
};

const ACTIVE_FILE: &str = "active.json";
const CANDIDATE_FILE: &str = "candidate.json";
const LOCK_FILE: &str = ".activation.lock";
const MANIFEST_FILE: &str = "manifest.json";
const RELEASE_REPORT_FILE: &str = "release-report.json";
const MAX_ACTIVATION_JSON_BYTES: u64 = 4 * 1024 * 1024;

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

pub(super) struct PreparedCandidate<B: Backend> {
    manifest: crate::salt::manifest::GenerationManifest,
    artifacts: Vec<VerifiedArtifact>,
    projector: ConditionedProjector<B>,
}

impl<B: Backend> PreparedCandidate<B> {
    #[must_use]
    #[inline]
    pub(super) fn into_parts(
        self,
    ) -> (
        crate::salt::manifest::GenerationManifest,
        Vec<VerifiedArtifact>,
        ConditionedProjector<B>,
    ) {
        (self.manifest, self.artifacts, self.projector)
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
pub(crate) struct FileActivationStore<B: Backend> {
    root: Utf8PathBuf,
    verifier: GateVerifier,
    external_verifiers: ExternalGateVerifierSet,
    device: B::Device,
}

impl<B: Backend> FileActivationStore<B> {
    /// Binds activation state beneath `root`.
    #[must_use]
    pub(crate) fn new(
        root: impl Into<Utf8PathBuf>,
        verifier: GateVerifier,
        external_verifiers: ExternalGateVerifierSet,
        device: B::Device,
    ) -> Self {
        Self {
            root: root.into(),
            verifier,
            external_verifiers,
            device,
        }
    }

    /// Loads the current active pointer.
    ///
    /// # Errors
    ///
    /// This returns an error when the pointer cannot be read or decoded.
    pub(crate) fn current(&self) -> Result<Option<ActiveRelease>, ActivationError> {
        self.prepare_current()
            .map(|prepared| prepared.map(|(active, _prepared)| active))
    }

    /// Reads the active pointer without reopening the generation it names.
    ///
    /// This is used only as a cache key. Callers MUST use [`Self::load_active`]
    /// before serving any generation content.
    pub(crate) fn active_pointer(&self) -> Result<Option<ActiveRelease>, ActivationError> {
        read_optional_json(&self.root.join(ACTIVE_FILE))
    }

    pub(super) fn prepare_current(
        &self,
    ) -> Result<Option<(ActiveRelease, PreparedCandidate<B>)>, ActivationError> {
        let Some(active) = read_optional_json(&self.root.join(ACTIVE_FILE))? else {
            return Ok(None);
        };
        let prepared = verify_candidate::<B>(
            &self.root,
            active,
            &self.verifier,
            &self.external_verifiers,
            &self.device,
        )?;
        Ok(Some((active, prepared)))
    }

    /// Activates a gated candidate if `expected` still names the active head.
    ///
    /// The candidate marker is verified while holding the activation lock. An
    /// already-active desired head succeeds idempotently; otherwise a
    /// mismatched expected head reports a conflict without writing. The
    /// replacement pointer is synced before an atomic rename.
    ///
    /// # Errors
    ///
    /// This returns an error when the exact candidate marker or release report
    /// is absent or different, lock or pointer I/O fails, or JSON cannot be
    /// encoded.
    pub(crate) fn compare_exchange(
        &self,
        expected: Option<ActiveRelease>,
        desired: GatedRelease,
    ) -> Result<ActivationOutcome, ActivationError> {
        let desired = ActiveRelease::from(desired);
        fs::create_dir_all(&self.root)?;
        let lock = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(self.root.join(LOCK_FILE))?;
        lock.lock()?;

        let _prepared = verify_candidate::<B>(
            &self.root,
            desired,
            &self.verifier,
            &self.external_verifiers,
            &self.device,
        )?;
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

    /// Restores a previous pointer only while `current` is still active.
    ///
    /// This is the compensating operation for a failure immediately after a
    /// successful activation. A concurrent replacement wins: this method then
    /// returns `false` without changing the newer pointer.
    pub(crate) fn restore_if_current(
        &self,
        current: ActiveRelease,
        previous: Option<ActiveRelease>,
    ) -> Result<bool, ActivationError> {
        fs::create_dir_all(&self.root)?;
        let lock = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(self.root.join(LOCK_FILE))?;
        lock.lock()?;
        if self.active_pointer()? != Some(current) {
            return Ok(false);
        }
        if let Some(previous) = previous {
            let _prepared = verify_candidate::<B>(
                &self.root,
                previous,
                &self.verifier,
                &self.external_verifiers,
                &self.device,
            )?;
            publish_json(&self.root.join(ACTIVE_FILE), &previous)?;
        } else {
            match fs::remove_file(self.root.join(ACTIVE_FILE)) {
                Ok(()) => File::open(&self.root)?.sync_all()?,
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
        }
        Ok(true)
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
    let path = candidate_path(root, release.head);
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("candidate path {path} has no parent directory"),
        )
    })?;
    let temporary = NamedTempFile::new_in(parent)?;
    serde_json::to_writer(temporary.as_file(), &release)?;
    temporary.as_file().sync_all()?;
    match temporary.persist_noclobber(&path) {
        Ok(file) => {
            file.sync_all()?;
            File::open(parent)?.sync_all()?;
            Ok(())
        }
        Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => {
            let existing: ActiveRelease =
                read_optional_json(&path)?.ok_or(ActivationError::MissingCandidate {
                    generation: release.head.generation,
                })?;
            if existing == release {
                File::open(&path)?.sync_all()?;
                File::open(parent)?.sync_all()?;
                Ok(())
            } else {
                Err(ActivationError::CandidateMismatch {
                    generation: release.head.generation,
                })
            }
        }
        Err(error) => Err(ActivationError::Persist(error)),
    }
}

/// Removes an inactive candidate's discoverability marker under the activation lock.
///
/// This is the compensating operation used when a lower-assurance local
/// authorization check changes after publication but before activation. The
/// immutable diagnostic artifacts remain available, but the release cannot be
/// selected by [`FileActivationStore::compare_exchange`].
///
/// # Errors
///
/// Returns an error when the candidate has already become active, names
/// different bytes, or cannot be removed and durably synced.
pub(crate) fn withdraw_candidate_marker(
    root: &Utf8Path,
    release: GatedRelease,
) -> Result<(), ActivationError> {
    let release = ActiveRelease::from(release);
    fs::create_dir_all(root)?;
    let lock = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(root.join(LOCK_FILE))?;
    lock.lock()?;
    if read_optional_json(&root.join(ACTIVE_FILE))? == Some(release) {
        return Err(ActivationError::CandidateMismatch {
            generation: release.head.generation,
        });
    }
    let path = candidate_path(root, release.head);
    match read_optional_json::<ActiveRelease>(&path)? {
        Some(candidate) if candidate != release => {
            return Err(ActivationError::CandidateMismatch {
                generation: release.head.generation,
            });
        }
        None => return Ok(()),
        Some(_) => {}
    }
    fs::remove_file(&path)?;
    File::open(
        path.parent()
            .expect("candidate marker should have a generation directory"),
    )?
    .sync_all()?;
    Ok(())
}

fn verify_candidate<B: Backend>(
    root: &Utf8Path,
    desired: ActiveRelease,
    verifier: &GateVerifier,
    external_verifiers: &ExternalGateVerifierSet,
    device: &B::Device,
) -> Result<PreparedCandidate<B>, ActivationError> {
    let path = candidate_path(root, desired.head);
    let candidate: ActiveRelease =
        read_optional_json(&path)?.ok_or(ActivationError::MissingCandidate {
            generation: desired.head.generation,
        })?;
    if candidate != desired {
        return Err(ActivationError::CandidateMismatch {
            generation: desired.head.generation,
        });
    }
    let report_path = root
        .join("generations")
        .join(desired.head.generation.to_string())
        .join(RELEASE_REPORT_FILE);
    let report: GateReport =
        read_optional_json(&report_path)?.ok_or(ActivationError::CandidateMismatch {
            generation: desired.head.generation,
        })?;
    if report.validate().is_err()
        || report.head() != desired.head
        || report.content_hash() != desired.report
    {
        return Err(ActivationError::CandidateMismatch {
            generation: desired.head.generation,
        });
    }
    let manifest_path = root
        .join("generations")
        .join(desired.head.generation.to_string())
        .join(MANIFEST_FILE);
    let manifest = load_verified_manifest(&manifest_path, desired.head.manifest)?;
    if manifest.generation_id != desired.head.generation
        || manifest.storage.base_revision != desired.head.data.base()
        || manifest.storage.initial_delta_revision != desired.head.data.delta()
    {
        return Err(ActivationError::CandidateMismatch {
            generation: desired.head.generation,
        });
    }
    let generation_directory = manifest_path
        .parent()
        .expect("generation manifest should have a parent");
    load_gate_evidence(
        generation_directory,
        &report,
        &manifest,
        verifier,
        external_verifiers,
    )?;
    let artifacts = verify_loaded_manifest_artifacts(&manifest_path, &manifest)?;
    let checkpoint = artifacts
        .iter()
        .find(|artifact| artifact.role() == ArtifactRole::ProjectorCheckpoint)
        .expect("validated manifest should contain a projector checkpoint");
    let projector = load_projector_checkpoint_bytes::<B>(
        checkpoint.bytes(),
        projector_config(&manifest),
        device,
    )?;
    Ok(PreparedCandidate {
        manifest,
        artifacts,
        projector,
    })
}

fn candidate_path(root: &Utf8Path, head: ReleaseHead) -> Utf8PathBuf {
    root.join("generations")
        .join(head.generation.to_string())
        .join(CANDIDATE_FILE)
}

fn read_optional_json<T: DeserializeOwned + Serialize>(
    path: &Utf8Path,
) -> Result<Option<T>, ActivationError> {
    match File::open(path) {
        Ok(mut file) => {
            file.lock_shared()?;
            let metadata = file.metadata()?;
            if !metadata.is_file() || metadata.len() > MAX_ACTIVATION_JSON_BYTES {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "activation JSON is not a bounded regular file",
                )
                .into());
            }
            let capacity = usize::try_from(metadata.len()).map_err(|_error| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    "activation JSON length does not fit memory",
                )
            })?;
            let mut bytes = Vec::with_capacity(capacity);
            file.by_ref()
                .take(MAX_ACTIVATION_JSON_BYTES.saturating_add(1))
                .read_to_end(&mut bytes)?;
            if !matches!(
                u64::try_from(bytes.len()),
                Ok(length) if length <= MAX_ACTIVATION_JSON_BYTES
            ) {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "activation JSON grew beyond its byte limit while it was read",
                )
                .into());
            }
            if u64::try_from(bytes.len()).ok() != Some(metadata.len()) {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "activation JSON changed while it was read",
                )
                .into());
            }
            let value = serde_json::from_slice(&bytes)?;
            if serde_json::to_vec(&value)? != bytes {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "activation JSON is not canonically encoded",
                )
                .into());
            }
            Ok(Some(value))
        }
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
