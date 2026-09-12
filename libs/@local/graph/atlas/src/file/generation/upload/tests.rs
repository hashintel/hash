#![expect(
    clippy::significant_drop_tightening,
    reason = "fixture is alive until end of scope on purpose"
)]
use alloc::rc::Rc;
use core::{assert_matches, cell::RefCell, pin::pin, task::Poll};
use std::{collections::HashMap, fs, io};

use aws_sdk_s3::{error::SdkError, operation::put_object::PutObjectError};
use bytes::Bytes;
use camino::{Utf8Path, Utf8PathBuf};
use futures::{future, poll};
use tokio::{io::AsyncBufRead, sync::Notify};
use uuid::Uuid;

use super::{
    super::{
        GenerationId, GenerationRoot, METADATA_FILE, ScratchDirectory,
        tests::{make_writable, publish_noncanonical, repository, root},
    },
    Promotion, PromotionOptions, Upload,
    backend::GenerationUploadBackend,
    error::UploadError,
};
use crate::{
    file::{
        repository::IntegrityVerificationError,
        salt::SaltRepository,
        storage::{
            Storage, WriteCondition,
            error::StorageError,
            path::{FileContents, FilePath},
        },
    },
    integrity::{ParseHexError, Sha256Digest},
};

/// Returns the current-pointer path under the destination root.
fn current_path(root: &Utf8Path) -> Utf8PathBuf {
    root.join("generations/current")
}

/// Returns the advisory previous-pointer path under the destination root.
fn previous_path(root: &Utf8Path) -> Utf8PathBuf {
    root.join("generations/previous")
}

/// Locates a generation artifact under the destination's repository prefix.
fn repository_path(root: &Utf8Path, id: GenerationId, name: &str) -> Utf8PathBuf {
    root.join(format!("generations/repository/{id}/{name}"))
}

/// Locates the metadata that completes the destination's repository prefix.
fn repository_metadata_path(root: &Utf8Path, id: GenerationId) -> Utf8PathBuf {
    repository_path(root, id, METADATA_FILE)
}

/// Locates the destination's active prefix for one generation.
fn active_directory(root: &Utf8Path, id: GenerationId) -> Utf8PathBuf {
    root.join(format!("generations/active/{id}"))
}

/// Locates a generation artifact under the destination's active prefix.
fn active_path(root: &Utf8Path, id: GenerationId, name: &str) -> Utf8PathBuf {
    active_directory(root, id).join(name)
}

/// Locates the metadata that completes the destination's active prefix.
fn active_metadata_path(root: &Utf8Path, id: GenerationId) -> Utf8PathBuf {
    active_path(root, id, METADATA_FILE)
}

/// Writes a destination object, creating its prefix.
fn seed(path: &Utf8Path, content: impl AsRef<[u8]>) {
    fs::create_dir_all(path.parent().expect("should have a parent"))
        .expect("should create the fixture directory");
    fs::write(path, content).expect("should write the fixture content");
}

/// The artifact name every seeded active prefix carries.
const SEEDED_ARTIFACT: &str = "representations.arr";

/// Writes a complete active prefix for a generation this test never publishes locally.
///
/// The bytes belong to no local publication, which keeps a surviving prefix distinguishable from
/// one the promotion under test wrote.
fn seed_active(root: &Utf8Path, id: GenerationId) {
    seed(&active_path(root, id, SEEDED_ARTIFACT), b"seeded artifact");
    seed(&active_metadata_path(root, id), b"seeded metadata");
}

/// Checks that the complete seeded prefix of `id` survives.
#[track_caller]
fn assert_seeded_active_retained(root: &Utf8Path, id: GenerationId) {
    assert_eq!(
        fs::read(active_metadata_path(root, id)).expect("should retain the seeded metadata"),
        b"seeded metadata".as_slice(),
        "should leave the seeded metadata unchanged"
    );
    assert_eq!(
        fs::read(active_path(root, id, SEEDED_ARTIFACT))
            .expect("should retain the seeded artifact"),
        b"seeded artifact".as_slice(),
        "should leave the seeded artifact unchanged"
    );
}

/// The identities a destination's pointers name before a promotion.
struct Pointers {
    current: GenerationId,
    previous: GenerationId,
}

/// Seeds distinct current and previous pointers, each with a complete active prefix.
///
/// Neither identity belongs to a local publication: a promotion can only retain or remove the two
/// prefixes, never rewrite them.
fn seed_pointers(fixture: &Fixture) -> Pointers {
    let pointers = Pointers {
        current: GenerationId::from_digest(Sha256Digest::of(b"old-current-generation")),
        previous: GenerationId::from_digest(Sha256Digest::of(b"old-previous-generation")),
    };

    seed(&current_path(&fixture.root), pointers.current.to_string());
    seed(&previous_path(&fixture.root), pointers.previous.to_string());
    seed_active(&fixture.root, pointers.current);
    seed_active(&fixture.root, pointers.previous);

    pointers
}

/// A write precondition recorded without its revision.
#[derive(Debug, Clone, PartialEq)]
enum Condition {
    Any,
    Absent,
    Match,
}

impl From<&WriteCondition<'_>> for Condition {
    fn from(condition: &WriteCondition<'_>) -> Self {
        match condition {
            WriteCondition::Any => Self::Any,
            WriteCondition::Absent => Self::Absent,
            WriteCondition::Match(_) => Self::Match,
        }
    }
}

/// One recorded backend call.
#[derive(Debug, Clone, PartialEq)]
enum Event {
    Get {
        path: String,
    },
    Read {
        path: String,
    },
    Put {
        path: String,
        condition: Condition,
    },
    Upload {
        path: String,
        condition: Condition,
    },
    Copy {
        source: String,
        destination: String,
        condition: Condition,
    },
    Remove {
        path: String,
    },
    RemoveDirAll {
        path: String,
    },
}

impl Event {
    /// Reports whether either path of the call contains `needle`.
    fn touches(&self, needle: &str) -> bool {
        match self {
            Self::Get { path }
            | Self::Read { path }
            | Self::Put { path, .. }
            | Self::Upload { path, .. }
            | Self::Remove { path }
            | Self::RemoveDirAll { path } => path.contains(needle),
            Self::Copy {
                source,
                destination,
                ..
            } => source.contains(needle) || destination.contains(needle),
        }
    }
}

/// A storage failure the fixture returns in place of one call's result.
enum Fault {
    /// An I/O failure the storage layer returns.
    Generic,
    /// A request that fails before the client sends it.
    Construction,
    /// A completed S3 request that refused its metadata deletion.
    DeletionRefused,
}

impl Fault {
    /// Builds the storage error this fault returns.
    fn error(self) -> StorageError {
        match self {
            Self::Generic => StorageError::Io(io::Error::other("fixture storage failure")),
            Self::DeletionRefused => StorageError::DeleteRefused {
                failures: vec![
                    aws_sdk_s3::types::Error::builder()
                        .key("metadata.json")
                        .code("AccessDenied")
                        .message("metadata removal denied")
                        .build(),
                ],
            },
            Self::Construction => SdkError::<PutObjectError>::construction_failure(
                io::Error::other("fixture construction failure"),
            )
            .into(),
        }
    }
}

/// Arrival and release notifications for one suspended backend call.
struct Hold {
    entered: Notify,
    resumed: Notify,
}

impl Hold {
    /// Waits until the suspended call reaches its entry.
    async fn entered(&self) {
        self.entered.notified().await;
    }

    /// Resumes the suspended call.
    fn release(&self) {
        self.resumed.notify_one();
    }
}

/// A destination directory with recorded calls, one-shot injected faults and one-shot holds.
///
/// Object operations use [`Storage`]'s local backend unless a [`Fault`] replaces the call's
/// result.
struct Fixture {
    _scratch: ScratchDirectory,
    root: Utf8PathBuf,
    destination: FilePath,
    storage: Storage,
    faults: RefCell<HashMap<String, Fault>>,
    holds: RefCell<HashMap<String, Rc<Hold>>>,
    events: RefCell<Vec<Event>>,
}

impl Fixture {
    /// Creates a destination directory holding no objects and no faults.
    fn new() -> Self {
        let root = Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("should have a UTF-8 path")
            .join(format!("atlas-upload-fixture-{}", Uuid::now_v7()));

        let destination = root
            .as_str()
            .parse()
            .expect("should parse the fixture destination");

        Self {
            _scratch: ScratchDirectory::new(root.clone()),
            root,
            destination,
            storage: Storage::in_temp_dir(),
            faults: RefCell::new(HashMap::new()),
            holds: RefCell::new(HashMap::new()),
            events: RefCell::new(Vec::new()),
        }
    }

    /// Returns the destination containing the `generations/` namespace.
    fn destination(&self) -> &FilePath {
        &self.destination
    }

    /// Installs a one-shot fault for the next call on `path`.
    fn fault(&self, path: &Utf8Path, fault: Fault) {
        self.faults.borrow_mut().insert(path.to_string(), fault);
    }

    /// Removes and returns the fault installed for `path`.
    fn take_fault(&self, path: &FilePath) -> Option<Fault> {
        self.faults.borrow_mut().remove(&path.to_string())
    }

    /// Records one backend call.
    fn record(&self, event: Event) {
        self.events.borrow_mut().push(event);
    }

    /// Suspends the next call on `path` at its entry until the returned hold releases it.
    fn hold(&self, path: &Utf8Path) -> Rc<Hold> {
        let hold = Rc::new(Hold {
            entered: Notify::new(),
            resumed: Notify::new(),
        });

        self.holds
            .borrow_mut()
            .insert(path.to_string(), Rc::clone(&hold));

        hold
    }

    /// Records one call, awaits any hold on `path` and returns the fault installed for it.
    async fn enter(&self, event: Event, path: &FilePath) -> Option<Fault> {
        self.record(event);

        let hold = self.holds.borrow_mut().remove(&path.to_string());
        if let Some(hold) = hold {
            hold.entered.notify_one();
            hold.resumed.notified().await;
        }

        self.take_fault(path)
    }

    /// Copies the recorded calls in their execution order.
    fn events(&self) -> Vec<Event> {
        self.events.borrow().clone()
    }

    /// Copies the recorded removal calls in their execution order.
    fn deletions(&self) -> Vec<Event> {
        self.events
            .borrow()
            .iter()
            .filter(|event| matches!(event, Event::Remove { .. } | Event::RemoveDirAll { .. }))
            .cloned()
            .collect()
    }
}

impl GenerationUploadBackend for &Fixture {
    async fn get(&self, path: &FilePath) -> Result<FileContents<impl AsyncBufRead>, StorageError> {
        let event = Event::Get {
            path: path.to_string(),
        };
        if let Some(fault) = self.enter(event, path).await {
            return Err(fault.error());
        }
        path.get(&self.storage).await
    }

    async fn read(&self, path: &FilePath) -> Result<impl AsyncBufRead, StorageError> {
        let event = Event::Read {
            path: path.to_string(),
        };
        if let Some(fault) = self.enter(event, path).await {
            return Err(fault.error());
        }
        path.read(&self.storage).await
    }

    async fn put(
        &self,
        path: &FilePath,
        body: Bytes,
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError> {
        let event = Event::Put {
            path: path.to_string(),
            condition: Condition::from(&condition),
        };
        if let Some(fault) = self.enter(event, path).await {
            return Err(fault.error());
        }
        path.put(&self.storage, body, condition).await
    }

    async fn upload(
        &self,
        destination: &FilePath,
        source: &Utf8Path,
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError> {
        let event = Event::Upload {
            path: destination.to_string(),
            condition: Condition::from(&condition),
        };
        if let Some(fault) = self.enter(event, destination).await {
            return Err(fault.error());
        }
        destination.upload(&self.storage, source, condition).await
    }

    async fn copy(
        &self,
        source: &FilePath,
        destination: &FilePath,
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError> {
        let event = Event::Copy {
            source: source.to_string(),
            destination: destination.to_string(),
            condition: Condition::from(&condition),
        };
        if let Some(fault) = self.enter(event, destination).await {
            return Err(fault.error());
        }
        destination
            .copy_from(&self.storage, source, condition)
            .await
    }

    async fn remove(&self, path: &FilePath) -> Result<(), StorageError> {
        let event = Event::Remove {
            path: path.to_string(),
        };
        if let Some(fault) = self.enter(event, path).await {
            return Err(fault.error());
        }
        path.remove(&self.storage).await
    }

    async fn remove_dir_all(&self, path: &FilePath) -> Result<(), StorageError> {
        let event = Event::RemoveDirAll {
            path: path.to_string(),
        };
        if let Some(fault) = self.enter(event, path).await {
            return Err(fault.error());
        }
        path.remove_dir_all(&self.storage).await
    }
}

/// Publishes the fixture repository with noncanonical metadata.
fn publish(root: &GenerationRoot) -> (SaltRepository, GenerationId) {
    let repository = repository();
    let id = publish_noncanonical(root, &repository);
    (repository, id)
}

/// Checks the active prefix against the local publication's artifacts and metadata bytes.
#[track_caller]
fn assert_active_matches(
    source: &GenerationRoot,
    destination: &Utf8Path,
    id: GenerationId,
    repository: &SaltRepository,
) {
    for file in repository.files.files() {
        let stored = fs::read(active_path(destination, id, file.name.as_str()))
            .expect("should have copied the active artifact");
        assert_eq!(
            stored,
            file.name.as_str().as_bytes(),
            "should carry the active artifact's fixture body"
        );
    }

    let expected_metadata = fs::read(source.generation_path(id).join(METADATA_FILE))
        .expect("should read the published metadata");
    let stored_metadata = fs::read(active_metadata_path(destination, id))
        .expect("should have written the active metadata");
    assert_eq!(
        stored_metadata, expected_metadata,
        "should retain the original metadata bytes in active"
    );
}

/// Preparation rejects a pointer containing a non-hexadecimal character.
#[tokio::test]
async fn prepare_pointer_invalid_character() {
    let (_scratch, root) = root();
    let fixture = Fixture::new();
    seed(&current_path(&fixture.root), "z".repeat(64));

    let error = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .err()
        .expect("should refuse preparation for a non-hexadecimal pointer");

    assert!(
        error
            .to_string()
            .contains(current_path(&fixture.root).as_str()),
        "should name the malformed pointer in the diagnostic"
    );
    assert_matches!(
        error,
        UploadError::Pointer { path, error: ParseHexError::Character {
            index: 0,
            byte: b'z'
        } } if path.to_string() == current_path(&fixture.root).as_str()
    );
}

/// Preparation rejects a pointer shorter than one identity.
#[tokio::test]
async fn prepare_pointer_short() {
    let (_scratch, root) = root();
    let fixture = Fixture::new();
    seed(&current_path(&fixture.root), "0011");

    let error = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .err()
        .expect("should refuse preparation for a short pointer");

    assert!(
        error
            .to_string()
            .contains(current_path(&fixture.root).as_str()),
        "should name the malformed pointer in the diagnostic"
    );
    assert_matches!(
        error,
        UploadError::Pointer { path, error: ParseHexError::Length {
            expected: 64,
            actual: 4
        } } if path.to_string() == current_path(&fixture.root).as_str()
    );
}

/// Preparation rejects trailing bytes instead of accepting an identity prefix.
#[tokio::test]
async fn prepare_pointer_over_length() {
    let (_scratch, root) = root();
    let fixture = Fixture::new();
    seed(&current_path(&fixture.root), "1".repeat(65));

    let error = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .err()
        .expect(
            "should refuse preparation for a 65-byte pointer rather than parse a truncated prefix",
        );

    assert!(
        error
            .to_string()
            .contains(current_path(&fixture.root).as_str()),
        "should name the malformed pointer in the diagnostic"
    );
    assert_matches!(
        error,
        UploadError::Pointer { path, error: ParseHexError::Length {
            expected: 64,
            actual: 65
        } } if path.to_string() == current_path(&fixture.root).as_str()
    );
}

/// Preparation rejects a previous pointer containing a non-hexadecimal character.
#[tokio::test]
async fn prepare_previous_pointer_invalid_character() {
    let (_scratch, root) = root();
    let fixture = Fixture::new();
    let old_id = GenerationId::from_digest(Sha256Digest::of(b"old-current-generation"));
    seed(&current_path(&fixture.root), old_id.to_string());
    seed(&previous_path(&fixture.root), "z".repeat(64));

    let error = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .err()
        .expect("should refuse preparation for a non-hexadecimal previous pointer");

    assert!(
        error
            .to_string()
            .contains(previous_path(&fixture.root).as_str()),
        "should name the malformed pointer in the diagnostic"
    );
    assert_matches!(
        error,
        UploadError::Pointer { path, error: ParseHexError::Character {
            index: 0,
            byte: b'z'
        } } if path.to_string() == previous_path(&fixture.root).as_str()
    );
}

/// A failed pointer read refuses preparation and retains the storage error.
#[tokio::test]
async fn prepare_storage_failure() {
    let (_scratch, root) = root();
    let fixture = Fixture::new();
    fixture.fault(&current_path(&fixture.root), Fault::Generic);

    let error = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .err()
        .expect("should refuse preparation for a storage failure");

    assert_matches!(error, UploadError::Storage(StorageError::Io(_)));
}

/// An upload writes each artifact and then the metadata, touching no pointer and no active object.
#[tokio::test]
async fn upload_creates_repository() {
    let (_scratch, root) = root();
    let (repository, id) = publish(&root);
    let fixture = Fixture::new();

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");
    let before = fixture.events().len();
    upload.upload(id).await.expect("should complete the upload");

    let events = fixture.events()[before..].to_vec();
    let mut expected_events: Vec<Event> = repository
        .files
        .files()
        .map(|file| Event::Upload {
            path: repository_path(&fixture.root, id, file.name.as_str()).to_string(),
            condition: Condition::Absent,
        })
        .collect();
    expected_events.push(Event::Put {
        path: repository_metadata_path(&fixture.root, id).to_string(),
        condition: Condition::Absent,
    });
    assert_eq!(
        events, expected_events,
        "should preserve the operation order and absent conditions"
    );

    for file in repository.files.files() {
        let stored = fs::read(repository_path(&fixture.root, id, file.name.as_str()))
            .expect("should have uploaded the artifact");
        assert_eq!(
            stored,
            file.name.as_str().as_bytes(),
            "should carry the uploaded artifact's fixture body"
        );
    }

    let expected_metadata = fs::read(root.generation_path(id).join(METADATA_FILE))
        .expect("should read the published metadata");
    let stored_metadata = fs::read(repository_metadata_path(&fixture.root, id))
        .expect("should have uploaded the metadata document");
    assert_eq!(
        stored_metadata, expected_metadata,
        "should retain the original metadata bytes in repository"
    );

    for excluded in [
        "projector.mpk",
        "annotation-corpus.json",
        "annotation-embeddings.arr",
        "annotation-hashes.arr",
    ] {
        assert!(
            fs::metadata(repository_path(&fixture.root, id, excluded)).is_err(),
            "should not upload the absent optional role {excluded}"
        );
    }

    assert!(
        events.iter().all(|event| {
            !event.touches("active") && !event.touches("current") && !event.touches("previous")
        }),
        "should not touch active, current or previous: {events:?}"
    );
}

/// A failed artifact transfer leaves the repository prefix without its metadata.
#[tokio::test]
async fn upload_artifact_failure() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    fixture.fault(
        &repository_path(&fixture.root, id, "representations.arr"),
        Fault::Generic,
    );

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");

    let error = upload
        .upload(id)
        .await
        .expect_err("should prevent completion after a failed artifact transfer");

    assert_matches!(error, UploadError::Storage(_));
    assert!(
        fs::metadata(repository_metadata_path(&fixture.root, id)).is_err(),
        "should prevent the metadata write after a failed artifact"
    );
}

/// A missing local artifact fails verification before the first transfer.
#[tokio::test]
async fn upload_missing_local_content() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let path = root.generation_path(id).join("representations.arr");
    fs::remove_file(&path).expect("should remove the fixture artifact");

    let fixture = Fixture::new();
    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");
    let before = fixture.events().len();

    let error = upload
        .upload(id)
        .await
        .expect_err("should prevent completion for a missing local artifact");

    assert_matches!(
        error,
        UploadError::Integrity(IntegrityVerificationError::Io { name, .. })
            if name.as_str() == "representations.arr"
    );
    assert!(
        fixture.events()[before..].is_empty(),
        "should fail verification on the first manifest file before any transfer starts"
    );
}

/// A tampered local artifact fails verification before the first transfer.
#[tokio::test]
async fn upload_corrupt_local_content() {
    let (_scratch, root) = root();
    let (repository, id) = publish(&root);
    let path = root.generation_path(id).join("representations.arr");
    make_writable(&path);
    fs::write(&path, b"tampered bytes").expect("should overwrite the fixture artifact");

    let fixture = Fixture::new();
    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");
    let before = fixture.events().len();

    let error = upload
        .upload(id)
        .await
        .expect_err("should prevent completion for corrupted local content");

    assert_matches!(
        error,
        UploadError::Integrity(IntegrityVerificationError::Checksum { file, received })
            if file.name.as_str() == "representations.arr"
                && file.hash == repository.files.representations.hash()
                && received == Sha256Digest::of(b"tampered bytes")
    );
    assert!(
        fixture.events()[before..].is_empty(),
        "should fail verification on the first manifest file before any transfer starts"
    );
}

/// An upload reuses an existing object after verifying its bytes against the artifact.
#[tokio::test]
async fn upload_reuse_matching() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    seed(
        &repository_path(&fixture.root, id, "representations.arr"),
        b"representations.arr",
    );

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");

    upload
        .upload(id)
        .await
        .expect("should reuse matching preexisting content");

    let events = fixture.events();
    let representation_events: Vec<_> = events
        .iter()
        .filter(|event| event.touches("representations.arr"))
        .cloned()
        .collect();
    assert_matches!(
        representation_events.as_slice(),
        [Event::Upload { .. }, Event::Read { .. }]
    );
    assert!(
        fs::metadata(repository_metadata_path(&fixture.root, id)).is_ok(),
        "should still complete the upload after reuse"
    );
}

/// Reuse rejects an object's mismatched bytes before writing metadata.
#[tokio::test]
async fn upload_checksum_mismatch_artifact() {
    let (_scratch, root) = root();
    let (repository, id) = publish(&root);
    let fixture = Fixture::new();
    seed(
        &repository_path(&fixture.root, id, "representations.arr"),
        b"wrong bytes",
    );

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");

    let error = upload
        .upload(id)
        .await
        .expect_err("should refuse reuse of mismatching preexisting content");

    assert_matches!(
        error,
        UploadError::Checksum { expected, actual, .. }
            if expected == repository.files.representations.hash()
                && actual == Sha256Digest::of(b"wrong bytes")
    );
    assert!(
        fs::metadata(repository_metadata_path(&fixture.root, id)).is_err(),
        "should prevent the metadata write after a checksum mismatch"
    );
}

/// Reuse rejects metadata whose bytes differ from the expected document.
#[tokio::test]
async fn upload_checksum_mismatch_metadata() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    seed(
        &repository_metadata_path(&fixture.root, id),
        b"wrong metadata bytes",
    );

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");

    let error = upload
        .upload(id)
        .await
        .expect_err("should refuse reuse of mismatching preexisting metadata");

    assert_matches!(
        error,
        UploadError::Checksum { actual, .. } if actual == Sha256Digest::of(b"wrong metadata bytes")
    );
}

/// Promotion selects its completed active prefix without writing previous.
#[tokio::test]
async fn promote_current_absent() {
    let (_scratch, root) = root();
    let (repository, id) = publish(&root);
    let fixture = Fixture::new();

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");
    upload.upload(id).await.expect("should complete the upload");

    let before = fixture.events().len();
    let promotion = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect("should complete the promotion");

    assert_eq!(promotion.id, id);

    let promote_events = fixture.events()[before..].to_vec();
    let mut expected = vec![Event::Read {
        path: repository_metadata_path(&fixture.root, id).to_string(),
    }];
    expected.extend(repository.files.files().map(|file| Event::Copy {
        source: repository_path(&fixture.root, id, file.name.as_str()).to_string(),
        destination: active_path(&fixture.root, id, file.name.as_str()).to_string(),
        condition: Condition::Absent,
    }));
    expected.push(Event::Put {
        path: active_metadata_path(&fixture.root, id).to_string(),
        condition: Condition::Absent,
    });
    expected.push(Event::Put {
        path: current_path(&fixture.root).to_string(),
        condition: Condition::Absent,
    });

    assert_eq!(
        promote_events, expected,
        "should complete active before selecting current"
    );

    let current =
        fs::read(current_path(&fixture.root)).expect("should have written the current pointer");
    assert_eq!(
        current,
        id.to_string().as_bytes(),
        "should carry the current pointer's promoted identity"
    );

    assert_active_matches(&root, &fixture.root, id, &repository);

    assert!(
        fs::metadata(previous_path(&fixture.root)).is_err(),
        "should leave no previous object for an absent prior current pointer"
    );
}

/// A promotion selects current against the captured revision, then records the replaced identity.
#[tokio::test]
async fn promote_current_replaces_previous() {
    let (_scratch, root) = root();
    let (repository, id) = publish(&root);
    let fixture = Fixture::new();
    let old_id = GenerationId::from_digest(Sha256Digest::of(b"previous-generation"));
    let current_pointer = current_path(&fixture.root);
    seed(&current_pointer, old_id.to_string());

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture the existing current pointer during preparation");
    upload.upload(id).await.expect("should complete the upload");

    let before = fixture.events().len();
    let promotion = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect("should complete the promotion");

    assert_eq!(promotion.id, id);

    let promote_events = fixture.events()[before..].to_vec();
    let mut expected = vec![Event::Read {
        path: repository_metadata_path(&fixture.root, id).to_string(),
    }];
    expected.extend(repository.files.files().map(|file| Event::Copy {
        source: repository_path(&fixture.root, id, file.name.as_str()).to_string(),
        destination: active_path(&fixture.root, id, file.name.as_str()).to_string(),
        condition: Condition::Absent,
    }));
    expected.push(Event::Put {
        path: active_metadata_path(&fixture.root, id).to_string(),
        condition: Condition::Absent,
    });
    expected.push(Event::Put {
        path: current_pointer.to_string(),
        condition: Condition::Match,
    });
    expected.push(Event::Put {
        path: previous_path(&fixture.root).to_string(),
        condition: Condition::Any,
    });

    assert_eq!(
        promote_events, expected,
        "should copy, write active metadata, select current against the captured revision, then \
         record previous"
    );

    let current = fs::read(&current_pointer).expect("should have written the current pointer");
    assert_eq!(
        current,
        id.to_string().as_bytes(),
        "should carry the current pointer's promoted identity"
    );

    assert_active_matches(&root, &fixture.root, id, &repository);

    let previous =
        fs::read(previous_path(&fixture.root)).expect("should have written the previous pointer");
    assert_eq!(
        previous,
        old_id.to_string().as_bytes(),
        "should carry the superseded generation's identity in previous"
    );
}

/// A failed active copy prevents the current write.
#[tokio::test]
async fn promote_active_copy_failure() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    fixture.fault(
        &active_path(&fixture.root, id, "representations.arr"),
        Fault::Generic,
    );

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");
    upload.upload(id).await.expect("should complete the upload");

    let error = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect_err("should prevent selection after a failed active copy");

    assert_matches!(error, UploadError::Storage(_));
    assert!(
        fs::metadata(current_path(&fixture.root)).is_err(),
        "should prevent the current write after a failed active copy"
    );
}

/// A failed active metadata write leaves the prefix incomplete and every pointer unchanged.
#[tokio::test]
async fn promote_active_metadata_failure() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let current = current_path(&fixture.root);
    let old_id = GenerationId::from_digest(Sha256Digest::of(b"previous-generation"));
    seed(&current, old_id.to_string());

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture the existing current pointer");
    upload.upload(id).await.expect("should complete the upload");
    fixture.fault(&active_metadata_path(&fixture.root, id), Fault::Generic);

    let before = fixture.events().len();
    let error = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect_err("should prevent selection after a failed active metadata write");

    assert_matches!(error, UploadError::Storage(StorageError::Io(_)));
    assert_eq!(
        fs::read(&current).expect("should retain the current pointer"),
        old_id.to_string().as_bytes(),
        "should preserve current after a failed active metadata write"
    );
    assert!(
        fs::metadata(active_metadata_path(&fixture.root, id)).is_err(),
        "should leave the active prefix incomplete"
    );
    assert!(
        fixture.events()[before..]
            .iter()
            .all(|event| !event.touches("current") && !event.touches("previous")),
        "should make no pointer write after a failed active metadata write"
    );
}

/// Active metadata holding other bytes prevents the current write.
#[tokio::test]
async fn promote_active_metadata_mismatch() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");
    upload.upload(id).await.expect("should complete the upload");
    seed(&active_metadata_path(&fixture.root, id), b"wrong metadata");

    let error = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect_err("should prevent selection for mismatching active metadata");

    assert_matches!(
        error,
        UploadError::Checksum { expected, actual, .. }
            if expected == id.digest() && actual == Sha256Digest::of(b"wrong metadata")
    );
    assert!(
        fs::metadata(current_path(&fixture.root)).is_err(),
        "should leave current absent after an active metadata mismatch"
    );
}

/// A repository document holding other bytes stops the promotion before any copy.
#[tokio::test]
async fn promote_repository_metadata_mismatch() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");
    upload.upload(id).await.expect("should complete the upload");
    let metadata = repository_metadata_path(&fixture.root, id);
    seed(&metadata, b"foreign metadata");

    let before = fixture.events().len();
    let error = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect_err("should prevent copying from a mismatching repository marker");

    assert_matches!(
        error,
        UploadError::Checksum { expected, actual, .. }
            if expected == id.digest() && actual == Sha256Digest::of(b"foreign metadata")
    );
    assert_eq!(
        &fixture.events()[before..],
        &[Event::Read {
            path: metadata.to_string(),
        }],
        "should stop before copying or selecting an invalid repository prefix"
    );
    assert!(
        fs::metadata(current_path(&fixture.root)).is_err(),
        "should leave current absent after a repository metadata mismatch"
    );
}

/// Selection fails when current changes after capture, writing no previous and removing nothing.
#[tokio::test]
async fn promote_current_conflict_present() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let old_id = GenerationId::from_digest(Sha256Digest::of(b"previous-generation"));
    let old_previous_id = GenerationId::from_digest(Sha256Digest::of(b"old-previous-generation"));
    let current_pointer = current_path(&fixture.root);
    seed(&current_pointer, old_id.to_string());
    seed(&previous_path(&fixture.root), old_previous_id.to_string());
    seed_active(&fixture.root, old_previous_id);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture the existing current pointer during preparation");
    upload.upload(id).await.expect("should complete the upload");

    let concurrent_id = GenerationId::from_digest(Sha256Digest::of(b"concurrent-writer"));
    seed(&current_pointer, concurrent_id.to_string());

    let before = fixture.events().len();
    let error = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect_err("should refuse selection for a stale captured revision");

    assert_matches!(error, UploadError::Conflict(_));

    let current = fs::read(&current_pointer).expect("should leave the current pointer present");
    assert_eq!(
        current,
        concurrent_id.to_string().as_bytes(),
        "should not change the concurrently written pointer after a rejected write"
    );

    let current_pointer_text = current_pointer.to_string();
    let previous_pointer_text = previous_path(&fixture.root).to_string();
    let recorded = fixture.events()[before..].to_vec();
    let put_events: Vec<_> = recorded
        .iter()
        .filter(|event| matches!(event, Event::Put { path, .. } if path == &current_pointer_text))
        .cloned()
        .collect();
    assert_matches!(
        put_events.as_slice(),
        [Event::Put {
            condition: Condition::Match,
            ..
        }]
    );
    assert!(
        recorded.iter().all(
            |event| !matches!(event, Event::Put { path, .. } if path == &previous_pointer_text)
        ),
        "should make no previous put call after a rejected selection"
    );

    assert_eq!(
        fs::read(previous_path(&fixture.root)).expect("should leave the previous pointer present"),
        old_previous_id.to_string().as_bytes(),
        "should not change previous after a rejected selection"
    );
    assert!(
        fixture.deletions().is_empty(),
        "should make no removal call after a rejected selection: {:?}",
        fixture.deletions()
    );
    assert_seeded_active_retained(&fixture.root, old_previous_id);
}

/// Selection fails if another writer creates current after an absent capture.
#[tokio::test]
async fn promote_current_conflict_absent() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let old_previous_id = GenerationId::from_digest(Sha256Digest::of(b"old-previous-generation"));
    seed(&previous_path(&fixture.root), old_previous_id.to_string());
    seed_active(&fixture.root, old_previous_id);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");
    upload.upload(id).await.expect("should complete the upload");

    let concurrent_id = GenerationId::from_digest(Sha256Digest::of(b"concurrent-writer"));
    let current_pointer = current_path(&fixture.root);
    seed(&current_pointer, concurrent_id.to_string());

    let before = fixture.events().len();
    let error = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect_err("should refuse an absent write for a concurrently created current pointer");

    assert_matches!(error, UploadError::Conflict(_));

    let current = fs::read(&current_pointer).expect("should leave the current pointer present");
    assert_eq!(
        current,
        concurrent_id.to_string().as_bytes(),
        "should not overwrite the concurrently created pointer after a rejected write"
    );

    let current_pointer_text = current_pointer.to_string();
    let previous_pointer_text = previous_path(&fixture.root).to_string();
    let recorded = fixture.events()[before..].to_vec();
    let put_events: Vec<_> = recorded
        .iter()
        .filter(|event| matches!(event, Event::Put { path, .. } if path == &current_pointer_text))
        .cloned()
        .collect();
    assert_matches!(
        put_events.as_slice(),
        [Event::Put {
            condition: Condition::Absent,
            ..
        }]
    );
    assert!(
        recorded.iter().all(
            |event| !matches!(event, Event::Put { path, .. } if path == &previous_pointer_text)
        ),
        "should make no previous put call after a rejected selection"
    );

    assert_eq!(
        fs::read(previous_path(&fixture.root)).expect("should leave the previous pointer present"),
        old_previous_id.to_string().as_bytes(),
        "should not change previous after a rejected selection"
    );
    assert!(
        fixture.deletions().is_empty(),
        "should make no removal call after a rejected selection: {:?}",
        fixture.deletions()
    );
    assert_seeded_active_retained(&fixture.root, old_previous_id);
}

/// A current write failing during request construction leaves previous unwritten.
#[tokio::test]
async fn promote_current_construction_failure() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let current_pointer = current_path(&fixture.root);
    let old_previous_id = GenerationId::from_digest(Sha256Digest::of(b"old-previous-generation"));
    seed(&previous_path(&fixture.root), old_previous_id.to_string());
    seed_active(&fixture.root, old_previous_id);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");
    upload.upload(id).await.expect("should complete the upload");
    fixture.fault(&current_pointer, Fault::Construction);

    let before = fixture.events().len();
    let error = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect_err("should refuse selection for a construction failure");

    assert_matches!(
        error,
        UploadError::Storage(StorageError::Request(sdk_error))
            if matches!(sdk_error.as_ref(), SdkError::ConstructionFailure(_))
    );

    let current_pointer_text = current_pointer.to_string();
    let previous_pointer_text = previous_path(&fixture.root).to_string();
    let promote_events = fixture.events()[before..].to_vec();
    let current_puts: Vec<_> = promote_events
        .iter()
        .filter(|event| matches!(event, Event::Put { path, .. } if path == &current_pointer_text))
        .cloned()
        .collect();
    assert_matches!(
        current_puts.as_slice(),
        [Event::Put {
            condition: Condition::Absent,
            ..
        }]
    );
    assert!(
        promote_events.iter().all(
            |event| !matches!(event, Event::Put { path, .. } if path == &previous_pointer_text)
        ),
        "should make no previous put call after a failed current write"
    );
    assert_eq!(
        fs::read(previous_path(&fixture.root)).expect("should leave the previous pointer present"),
        old_previous_id.to_string().as_bytes(),
        "should not change previous after a failed current write"
    );
    assert!(
        fixture.deletions().is_empty(),
        "should make no removal call after a failed current write: {:?}",
        fixture.deletions()
    );
    assert_seeded_active_retained(&fixture.root, old_previous_id);
}

/// Promotion succeeds when the advisory previous write fails.
#[tokio::test]
async fn promote_previous_write_failure() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let old_id = GenerationId::from_digest(Sha256Digest::of(b"previous-generation"));
    let current_pointer = current_path(&fixture.root);
    seed(&current_pointer, old_id.to_string());

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture the existing current pointer during preparation");
    upload.upload(id).await.expect("should complete the upload");
    fixture.fault(&previous_path(&fixture.root), Fault::Generic);

    let promotion: Promotion = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect("should still complete despite the failed previous write");

    assert_eq!(promotion.id, id);

    let current = fs::read(&current_pointer).expect("should have advanced the current pointer");
    assert_eq!(
        current,
        id.to_string().as_bytes(),
        "should carry the newly promoted identity in the current pointer"
    );
    assert!(
        fs::metadata(previous_path(&fixture.root)).is_err(),
        "should leave no previous object after its write failed"
    );
}

/// An existing active object holding other bytes prevents selection.
#[tokio::test]
async fn promote_checksum_mismatch() {
    let (_scratch, root) = root();
    let (repository, id) = publish(&root);
    let fixture = Fixture::new();

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should prepare against an absent current pointer");
    upload.upload(id).await.expect("should complete the upload");
    seed(
        &active_path(&fixture.root, id, "representations.arr"),
        b"wrong active bytes",
    );

    let error = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect_err("should refuse selection for mismatching preexisting active content");

    assert_matches!(
        error,
        UploadError::Checksum { expected, actual, .. }
            if expected == repository.files.representations.hash()
                && actual == Sha256Digest::of(b"wrong active bytes")
    );
    assert!(
        fs::metadata(current_path(&fixture.root)).is_err(),
        "should never select current after a checksum mismatch during promotion"
    );
}

/// Pruning removes the captured old previous prefix after both pointer writes.
#[tokio::test]
async fn promote_prune_previous() {
    let (_scratch, root) = root();
    let (repository, id) = publish(&root);
    let fixture = Fixture::new();
    let pointers = seed_pointers(&fixture);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture both pointers during preparation");
    upload.upload(id).await.expect("should complete the upload");

    let before = fixture.events().len();
    let promotion = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect("should complete the promotion");

    assert_eq!(promotion.id, id);

    let mut expected = vec![Event::Read {
        path: repository_metadata_path(&fixture.root, id).to_string(),
    }];
    expected.extend(repository.files.files().map(|file| Event::Copy {
        source: repository_path(&fixture.root, id, file.name.as_str()).to_string(),
        destination: active_path(&fixture.root, id, file.name.as_str()).to_string(),
        condition: Condition::Absent,
    }));
    expected.push(Event::Put {
        path: active_metadata_path(&fixture.root, id).to_string(),
        condition: Condition::Absent,
    });
    expected.push(Event::Put {
        path: current_path(&fixture.root).to_string(),
        condition: Condition::Match,
    });
    expected.push(Event::Put {
        path: previous_path(&fixture.root).to_string(),
        condition: Condition::Any,
    });
    expected.push(Event::Remove {
        path: active_metadata_path(&fixture.root, pointers.previous).to_string(),
    });
    expected.push(Event::RemoveDirAll {
        path: active_directory(&fixture.root, pointers.previous).to_string(),
    });

    assert_eq!(
        fixture.events()[before..].to_vec(),
        expected,
        "should prune the replaced generation after both pointer writes, metadata first"
    );

    assert_eq!(
        fs::read(current_path(&fixture.root)).expect("should have written the current pointer"),
        id.to_string().as_bytes(),
        "should carry the promoted identity in current"
    );
    assert_eq!(
        fs::read(previous_path(&fixture.root)).expect("should have written the previous pointer"),
        pointers.current.to_string().as_bytes(),
        "should carry the superseded identity in previous"
    );

    assert_active_matches(&root, &fixture.root, id, &repository);
    assert_seeded_active_retained(&fixture.root, pointers.current);
    assert!(
        fs::metadata(active_directory(&fixture.root, pointers.previous)).is_err(),
        "should remove the pruned generation's prefix"
    );

    for file in repository.files.files() {
        assert!(
            fs::metadata(repository_path(&fixture.root, id, file.name.as_str())).is_ok(),
            "should retain repository artifact {}",
            file.name
        );
    }
    assert!(
        fs::metadata(repository_metadata_path(&fixture.root, id)).is_ok(),
        "should retain the promoted generation's repository metadata"
    );
}

#[tokio::test]
async fn promote_prune_disabled() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let pointers = seed_pointers(&fixture);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture both pointers during preparation");
    upload.upload(id).await.expect("should complete the upload");

    let promotion = upload
        .promote(
            id,
            PromotionOptions {
                prune_active_generations: false,
            },
        )
        .await
        .expect("should complete the promotion");

    assert_eq!(promotion.id, id);
    assert!(
        fixture.deletions().is_empty(),
        "should make no removal call while pruning is off: {:?}",
        fixture.deletions()
    );
    assert_eq!(
        fs::read(previous_path(&fixture.root)).expect("should have written the previous pointer"),
        pointers.current.to_string().as_bytes(),
        "should still record the superseded identity in previous"
    );
    assert_seeded_active_retained(&fixture.root, pointers.previous);
    assert_seeded_active_retained(&fixture.root, pointers.current);
}

/// A failed previous write retains the generation the unchanged pointer names.
///
/// Pruning after this failure would remove the generation a reader still resolves through
/// previous.
#[tokio::test]
async fn promote_previous_write_failure_retains_target() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let pointers = seed_pointers(&fixture);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture both pointers during preparation");
    upload.upload(id).await.expect("should complete the upload");
    fixture.fault(&previous_path(&fixture.root), Fault::Generic);

    let promotion = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect("should still complete despite the failed previous write");

    assert_eq!(promotion.id, id);
    assert!(
        fixture.deletions().is_empty(),
        "should make no removal call after a failed previous write: {:?}",
        fixture.deletions()
    );
    assert_eq!(
        fs::read(previous_path(&fixture.root)).expect("should leave the previous pointer present"),
        pointers.previous.to_string().as_bytes(),
        "should leave previous naming the retained generation"
    );
    assert_seeded_active_retained(&fixture.root, pointers.previous);
}

/// A failed metadata removal stops cleanup before the prefix removal.
#[tokio::test]
async fn promote_prune_metadata_failure() {
    for fault in [Fault::Generic, Fault::DeletionRefused] {
        let (_scratch, root) = root();
        let (_repository, id) = publish(&root);
        let fixture = Fixture::new();
        let pointers = seed_pointers(&fixture);
        let metadata = active_metadata_path(&fixture.root, pointers.previous);
        fixture.fault(&metadata, fault);

        let upload = Upload::prepare(&fixture, &root, fixture.destination())
            .await
            .expect("should capture both pointers during preparation");
        upload.upload(id).await.expect("should complete the upload");

        let promotion = upload
            .promote(id, PromotionOptions::default())
            .await
            .expect("should still complete despite the failed cleanup");

        assert_eq!(promotion.id, id);
        assert_eq!(
            fixture.deletions(),
            vec![Event::Remove {
                path: metadata.to_string()
            }],
            "should skip the prefix removal after a failed metadata removal"
        );
        assert_seeded_active_retained(&fixture.root, pointers.previous);
    }
}

/// A failed prefix removal preserves the confirmed promotion.
#[tokio::test]
async fn promote_prune_prefix_failure() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let pointers = seed_pointers(&fixture);
    let directory = active_directory(&fixture.root, pointers.previous);
    fixture.fault(&directory, Fault::Generic);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture both pointers during preparation");
    upload.upload(id).await.expect("should complete the upload");

    let promotion = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect("should still complete despite the failed cleanup");

    assert_eq!(promotion.id, id);
    assert_eq!(
        fixture.deletions(),
        vec![
            Event::Remove {
                path: active_metadata_path(&fixture.root, pointers.previous).to_string()
            },
            Event::RemoveDirAll {
                path: directory.to_string()
            },
        ],
        "should attempt the prefix removal after removing the metadata"
    );
    assert!(
        fs::metadata(active_metadata_path(&fixture.root, pointers.previous)).is_err(),
        "should have removed the pruned generation's metadata"
    );
    assert_eq!(
        fs::read(active_path(
            &fixture.root,
            pointers.previous,
            SEEDED_ARTIFACT
        ))
        .expect("should retain the unremoved artifact"),
        b"seeded artifact".as_slice(),
        "should leave the artifacts of the incomplete prefix in place"
    );
    assert_eq!(
        fs::read(current_path(&fixture.root)).expect("should have written the current pointer"),
        id.to_string().as_bytes(),
        "should carry the promoted identity in current"
    );
}

/// Cleanup removes artifacts even when metadata is already absent.
#[tokio::test]
async fn promote_prune_metadata_absent() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let pointers = seed_pointers(&fixture);
    fs::remove_file(active_metadata_path(&fixture.root, pointers.previous))
        .expect("should remove the fixture metadata");

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture both pointers during preparation");
    upload.upload(id).await.expect("should complete the upload");

    let promotion = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect("should complete the promotion");

    assert_eq!(promotion.id, id);
    assert_eq!(
        fixture.deletions(),
        vec![
            Event::Remove {
                path: active_metadata_path(&fixture.root, pointers.previous).to_string()
            },
            Event::RemoveDirAll {
                path: active_directory(&fixture.root, pointers.previous).to_string()
            },
        ],
        "should continue cleanup after an absent metadata document"
    );
    assert!(
        fs::metadata(active_directory(&fixture.root, pointers.previous)).is_err(),
        "should remove the remaining artifacts of the incomplete prefix"
    );
}

/// An absent prefix completes cleanup.
#[tokio::test]
async fn prune_prefix_absent() {
    let (_scratch, root) = root();
    let fixture = Fixture::new();
    let id = GenerationId::from_digest(Sha256Digest::of(b"absent-generation"));
    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture the absent pointers");

    upload
        .prune(id)
        .await
        .expect("should accept an already-absent prefix");
    assert_eq!(
        fixture.deletions(),
        vec![
            Event::Remove {
                path: active_metadata_path(&fixture.root, id).to_string()
            },
            Event::RemoveDirAll {
                path: active_directory(&fixture.root, id).to_string()
            },
        ],
        "should attempt both removals against the absent prefix"
    );
}

/// An absent captured current leaves previous and the generation it names untouched.
#[tokio::test]
async fn promote_current_absent_previous_present() {
    let (_scratch, root) = root();
    let (repository, id) = publish(&root);
    let fixture = Fixture::new();
    let old_previous_id = GenerationId::from_digest(Sha256Digest::of(b"old-previous-generation"));
    seed(&previous_path(&fixture.root), old_previous_id.to_string());
    seed_active(&fixture.root, old_previous_id);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture the previous pointer against an absent current pointer");
    upload.upload(id).await.expect("should complete the upload");

    let before = fixture.events().len();
    let promotion = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect("should complete the promotion");

    assert_eq!(promotion.id, id);

    let mut expected = vec![Event::Read {
        path: repository_metadata_path(&fixture.root, id).to_string(),
    }];
    expected.extend(repository.files.files().map(|file| Event::Copy {
        source: repository_path(&fixture.root, id, file.name.as_str()).to_string(),
        destination: active_path(&fixture.root, id, file.name.as_str()).to_string(),
        condition: Condition::Absent,
    }));
    expected.push(Event::Put {
        path: active_metadata_path(&fixture.root, id).to_string(),
        condition: Condition::Absent,
    });
    expected.push(Event::Put {
        path: current_path(&fixture.root).to_string(),
        condition: Condition::Absent,
    });

    assert_eq!(
        fixture.events()[before..].to_vec(),
        expected,
        "should select current without writing previous or removing a prefix"
    );
    assert_eq!(
        fs::read(previous_path(&fixture.root)).expect("should leave the previous pointer present"),
        old_previous_id.to_string().as_bytes(),
        "should leave previous naming its original generation"
    );
    assert_seeded_active_retained(&fixture.root, old_previous_id);
}

/// Pruning skips a captured previous identity equal to the captured current.
#[tokio::test]
async fn promote_prune_previous_matches_current() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let shared_id = GenerationId::from_digest(Sha256Digest::of(b"shared-generation"));
    seed(&current_path(&fixture.root), shared_id.to_string());
    seed(&previous_path(&fixture.root), shared_id.to_string());
    seed_active(&fixture.root, shared_id);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture one identity in both pointers");
    upload.upload(id).await.expect("should complete the upload");

    let promotion = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect("should complete the promotion");

    assert_eq!(promotion.id, id);
    assert!(
        fixture.deletions().is_empty(),
        "should retain the generation previous still names: {:?}",
        fixture.deletions()
    );
    assert_eq!(
        fs::read(previous_path(&fixture.root)).expect("should have written the previous pointer"),
        shared_id.to_string().as_bytes(),
        "should record the superseded identity in previous"
    );
    assert_seeded_active_retained(&fixture.root, shared_id);
}

/// Pruning skips a captured previous identity equal to the promoted generation.
#[tokio::test]
async fn promote_prune_previous_matches_promoted() {
    let (_scratch, root) = root();
    let (repository, id) = publish(&root);
    let fixture = Fixture::new();
    let old_current_id = GenerationId::from_digest(Sha256Digest::of(b"old-current-generation"));
    seed(&current_path(&fixture.root), old_current_id.to_string());
    seed(&previous_path(&fixture.root), id.to_string());
    seed_active(&fixture.root, old_current_id);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture a previous pointer naming the promoted generation");
    upload.upload(id).await.expect("should complete the upload");

    let promotion = upload
        .promote(id, PromotionOptions::default())
        .await
        .expect("should complete the promotion");

    assert_eq!(promotion.id, id);
    assert!(
        fixture.deletions().is_empty(),
        "should retain the generation this promotion selected: {:?}",
        fixture.deletions()
    );
    assert_active_matches(&root, &fixture.root, id, &repository);
    assert_eq!(
        fs::read(current_path(&fixture.root)).expect("should have written the current pointer"),
        id.to_string().as_bytes(),
        "should carry the promoted identity in current"
    );
    assert_eq!(
        fs::read(previous_path(&fixture.root)).expect("should have written the previous pointer"),
        old_current_id.to_string().as_bytes(),
        "should carry the superseded identity in previous"
    );
}

/// Prefix removal waits for the metadata removal to complete.
#[tokio::test]
async fn promote_prune_metadata_awaited() {
    let (_scratch, root) = root();
    let (_repository, id) = publish(&root);
    let fixture = Fixture::new();
    let pointers = seed_pointers(&fixture);
    let metadata = active_metadata_path(&fixture.root, pointers.previous);

    let upload = Upload::prepare(&fixture, &root, fixture.destination())
        .await
        .expect("should capture both pointers during preparation");
    upload.upload(id).await.expect("should complete the upload");

    let hold = fixture.hold(&metadata);
    let mut promoting = pin!(upload.promote(id, PromotionOptions::default()));

    match future::select(pin!(hold.entered()), promoting.as_mut()).await {
        future::Either::Left(_) => {}
        future::Either::Right((result, _)) => {
            panic!("should reach the held metadata removal before returning: {result:?}")
        }
    }
    assert_matches!(poll!(promoting.as_mut()), Poll::Pending);
    assert_eq!(
        fixture.deletions(),
        vec![Event::Remove {
            path: metadata.to_string()
        }],
        "should hold the prefix removal until the metadata removal completes"
    );

    hold.release();

    let promotion = promoting
        .await
        .expect("should complete the promotion after the release");

    assert_eq!(promotion.id, id);
    assert_eq!(
        fixture.deletions(),
        vec![
            Event::Remove {
                path: metadata.to_string()
            },
            Event::RemoveDirAll {
                path: active_directory(&fixture.root, pointers.previous).to_string()
            },
        ],
        "should remove the prefix after the released metadata removal"
    );
    assert!(
        fs::metadata(active_directory(&fixture.root, pointers.previous)).is_err(),
        "should remove the pruned generation's prefix"
    );
}
