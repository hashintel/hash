use core::{
    assert_matches,
    future::{Future, poll_fn},
    pin::{Pin, pin},
    task::{Context, Poll},
    time::Duration,
};
use std::{
    collections::HashMap,
    fs,
    io::{self, Cursor},
    sync::{Arc, Mutex},
};

use camino::{Utf8Path, Utf8PathBuf};
use tokio::{
    io::{AsyncBufRead, AsyncRead, AsyncReadExt as _, BufReader, ReadBuf},
    sync::oneshot,
    task::JoinHandle,
};
use tokio_util::either::Either;
use uuid::Uuid;

use super::{
    super::{
        ActivateError, GenerationId, GenerationRoot, METADATA_FILE, OpenError, ScratchDirectory,
        tests::{make_writable, publish_noncanonical, repository, root},
    },
    Download, DownloadError,
    backend::GenerationDownloadBackend,
};
use crate::{
    file::{
        repository::IntegrityVerificationError,
        salt::SaltRepository,
        storage::{Storage, error::StorageError, path::FilePath},
    },
    integrity::Sha256Digest,
};

/// The source's current-generation pointer.
fn current_path(source: &Utf8Path) -> Utf8PathBuf {
    source.join("generations/current")
}

/// One object of the source's active prefix.
fn active_path(source: &Utf8Path, id: GenerationId, name: &str) -> Utf8PathBuf {
    source.join(format!("generations/active/{id}/{name}"))
}

/// Writes a source object, creating its prefix.
fn seed(path: &Utf8Path, content: impl AsRef<[u8]>) {
    fs::create_dir_all(path.parent().expect("a source object should have a prefix"))
        .expect("should create the source prefix");
    fs::write(path, content).expect("should write the source object");
}

/// The terminal I/O failure of a truncated source body.
struct FailingBody;

impl AsyncRead for FailingBody {
    fn poll_read(
        self: Pin<&mut Self>,
        _context: &mut Context<'_>,
        _buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Poll::Ready(Err(io::Error::other("fixture body failure")))
    }
}

/// A one-shot override of a source read.
enum Trigger {
    /// Delivers `prefix`, then fails the body.
    Body { prefix: Vec<u8> },
    /// Holds the read open until the test releases it.
    Hold(Hold),
}

/// The fixture's side of a held read.
///
/// The read announces itself through `entered` and remains pending until `released` resolves.
struct Hold {
    entered: oneshot::Sender<()>,
    released: oneshot::Receiver<()>,
}

impl Hold {
    async fn wait(self) {
        self.entered
            .send(())
            .expect("the test should await the held read");
        self.released
            .await
            .expect("the test should release the held read");
    }
}

/// The test's side of a held read.
struct HoldControl {
    entered: oneshot::Receiver<()>,
    release: oneshot::Sender<()>,
}

/// Creates a read hold and the handles the test drives it with.
fn hold() -> (Trigger, HoldControl) {
    let (entered_sender, entered) = oneshot::channel();
    let (release, released) = oneshot::channel();

    (
        Trigger::Hold(Hold {
            entered: entered_sender,
            released,
        }),
        HoldControl { entered, release },
    )
}

/// A source directory with recorded reads and one-shot read controls.
///
/// Object reads use [`Storage`]'s local backend. A [`Trigger`] can hold a read pending or return
/// a truncated body.
struct Fixture {
    _scratch: ScratchDirectory,
    path: Utf8PathBuf,
    storage: Storage,
    triggers: Mutex<HashMap<String, Trigger>>,
    reads: Mutex<Vec<String>>,
}

impl Fixture {
    fn new() -> Self {
        let path = Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("the temporary directory should have a UTF-8 path")
            .join(format!("atlas-download-fixture-{}", Uuid::now_v7()));
        fs::create_dir_all(&path).expect("should create the fixture source directory");

        Self {
            _scratch: ScratchDirectory::new(path.clone()),
            path,
            storage: Storage::in_temp_dir(),
            triggers: Mutex::new(HashMap::new()),
            reads: Mutex::new(Vec::new()),
        }
    }

    /// The parent of the source's `generations/` namespace.
    fn source(&self) -> FilePath {
        self.path
            .as_str()
            .parse()
            .expect("should parse the fixture source")
    }

    fn trigger(&self, path: &Utf8Path, trigger: Trigger) {
        self.triggers
            .lock()
            .expect("should lock the fixture triggers")
            .insert(path.to_string(), trigger);
    }

    /// The paths read so far, in call order.
    fn reads(&self) -> Vec<String> {
        self.reads
            .lock()
            .expect("should lock the fixture reads")
            .clone()
    }

    /// The paths read since `mark`, in call order.
    fn reads_since(&self, mark: usize) -> Vec<String> {
        self.reads()[mark..].to_vec()
    }
}

impl GenerationDownloadBackend for Arc<Fixture> {
    async fn read(&self, path: &FilePath) -> Result<impl AsyncBufRead + Send, StorageError> {
        let key = path.to_string();
        self.reads
            .lock()
            .expect("should lock the fixture reads")
            .push(key.clone());
        let trigger = self
            .triggers
            .lock()
            .expect("should lock the fixture triggers")
            .remove(&key);

        match trigger {
            Some(Trigger::Body { prefix }) => {
                return Ok(Either::Right(BufReader::new(
                    Cursor::new(prefix).chain(FailingBody),
                )));
            }
            Some(Trigger::Hold(hold)) => hold.wait().await,
            None => {}
        }

        Ok(Either::Left(path.read(&self.storage).await?))
    }
}

fn publish(root: &GenerationRoot, fit_seed: u64) -> (SaltRepository, GenerationId) {
    let mut repository = repository();
    repository.metadata.reproducibility.config.seed = fit_seed;
    let id = publish_noncanonical(root, &repository);
    (repository, id)
}

/// Copies a local publication into the source's active prefix and points the source at it.
fn seed_source(
    fixture: &Fixture,
    root: &GenerationRoot,
    id: GenerationId,
    repository: &SaltRepository,
) {
    let published = root.generation_path(id);

    for file in repository.files.files() {
        let bytes = fs::read(published.join(file.name.as_str()))
            .expect("should read the published artifact");
        seed(&active_path(&fixture.path, id, file.name.as_str()), bytes);
    }

    let metadata =
        fs::read(published.join(METADATA_FILE)).expect("should read the published metadata");
    seed(&active_path(&fixture.path, id, METADATA_FILE), metadata);
    seed(&current_path(&fixture.path), id.to_string());
}

/// The read sequence one complete acquisition of `id` makes.
fn acquisition_reads(
    fixture: &Fixture,
    id: GenerationId,
    repository: &SaltRepository,
) -> Vec<String> {
    let mut expected = vec![
        current_path(&fixture.path).to_string(),
        active_path(&fixture.path, id, METADATA_FILE).to_string(),
    ];
    expected.extend(
        repository
            .files
            .files()
            .map(|file| active_path(&fixture.path, id, file.name.as_str()).to_string()),
    );

    expected
}

/// The staging directories an attempt left in the root.
fn staging_entries(root: &GenerationRoot) -> Vec<String> {
    fs::read_dir(root.path())
        .expect("should list the root")
        .map(|entry| {
            entry
                .expect("should read the root entry")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .filter(|name| name.starts_with(".stage-"))
        .collect()
}

/// Checks original metadata bytes and read-only artifacts.
#[track_caller]
fn assert_published(
    target: &GenerationRoot,
    fixture: &Fixture,
    id: GenerationId,
    repository: &SaltRepository,
) {
    let published = target.generation_path(id);

    let source_metadata = fs::read(active_path(&fixture.path, id, METADATA_FILE))
        .expect("should read the source metadata");
    let local_metadata =
        fs::read(published.join(METADATA_FILE)).expect("should read the published metadata");
    assert_eq!(
        local_metadata, source_metadata,
        "should preserve the source metadata encoding byte for byte"
    );

    for file in repository.files.files() {
        let path = published.join(file.name.as_str());
        let bytes = fs::read(&path).expect("should read the published artifact");
        assert_eq!(
            bytes,
            file.name.as_str().as_bytes(),
            "should carry the source artifact's bytes for {}",
            file.name
        );
        assert!(
            fs::metadata(&path)
                .expect("should stat the published artifact")
                .permissions()
                .readonly(),
            "{} should publish read-only",
            file.name
        );
    }

    assert!(
        fs::metadata(published.join(METADATA_FILE))
            .expect("should stat the published metadata")
            .permissions()
            .readonly(),
        "the metadata document should publish read-only"
    );
}

/// Runs one synchronization on a task, returning the download with its result.
fn spawn_synchronize(
    mut download: Download<Arc<Fixture>>,
) -> JoinHandle<(
    Download<Arc<Fixture>>,
    Result<Option<GenerationId>, DownloadError>,
)> {
    tokio::spawn(async move {
        let result = download.synchronize().await;
        (download, result)
    })
}

/// Polls `future` once instead of waiting for it.
async fn poll_once<F: Future>(mut future: Pin<&mut F>) -> Poll<F::Output> {
    poll_fn(|context| Poll::Ready(future.as_mut().poll(context))).await
}

#[tokio::test]
async fn synchronize_fresh_source() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    let (_scratch, target) = root();
    let last = repository
        .files
        .files()
        .last()
        .expect("the fixture manifest should list a file");
    let (trigger, control) = hold();
    fixture.trigger(&active_path(&fixture.path, id, last.name.as_str()), trigger);

    let handle = spawn_synchronize(Download::new(
        Arc::clone(&fixture),
        target.clone(),
        fixture.source(),
    ));
    control
        .entered
        .await
        .expect("should open the held artifact read");

    let pending_current = target.current();
    let pending_publication = target.generation_path(id).exists();
    let pending_staging = staging_entries(&target);

    control
        .release
        .send(())
        .expect("should release the held artifact read");
    let (_download, result) = handle.await.expect("the synchronization task should join");

    assert_eq!(
        pending_current.expect("should read current during transfer"),
        None,
        "should select nothing while an artifact is still in transfer"
    );
    assert!(
        !pending_publication,
        "should publish nothing while an artifact is still in transfer"
    );
    assert!(
        !pending_staging.is_empty(),
        "should assemble the acquisition in a staging directory"
    );
    assert_matches!(result, Ok(Some(actual)) if actual == id);
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(id),
        "should select the acquired generation"
    );
    assert_published(&target, &fixture, id, &repository);

    // trailing whitespace distinguishes the source bytes from the canonical encoding.
    let canonical =
        serde_json::to_vec_pretty(&repository).expect("the repository should serialize");
    let local_metadata = fs::read(target.generation_path(id).join(METADATA_FILE))
        .expect("should read the published metadata");
    assert_ne!(
        local_metadata, canonical,
        "the source encoding should differ from the canonical one, or the case proves nothing"
    );

    for excluded in [
        "projector.mpk",
        "annotation-corpus.json",
        "annotation-embeddings.arr",
        "annotation-hashes.arr",
    ] {
        assert_matches!(
            fs::metadata(target.generation_path(id).join(excluded)),
            Err(error) if error.kind() == io::ErrorKind::NotFound,
            "should publish no file for the absent optional role {excluded}"
        );
    }

    assert_eq!(
        fixture.reads(),
        acquisition_reads(&fixture, id, &repository),
        "should read the current pointer, the metadata document and each manifest artifact once"
    );
    assert!(
        staging_entries(&target).is_empty(),
        "should leave no staging directory behind"
    );
}

#[tokio::test]
async fn synchronize_source_pointer_absent() {
    let (_scratch, target) = root();
    let (_repository, local) = publish(&target, 7);
    target
        .activate(local)
        .expect("the local generation should activate");

    let fixture = Arc::new(Fixture::new());
    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());

    let result = download
        .synchronize()
        .await
        .expect("should report an absent source pointer without failing");

    assert_eq!(result, None, "should name no generation");
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(local),
        "should preserve the local pointer"
    );
    assert_eq!(
        fixture.reads(),
        vec![current_path(&fixture.path).to_string()],
        "should read nothing beyond the absent pointer"
    );
}

#[tokio::test]
async fn synchronize_artifact_absent() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    let first = repository
        .files
        .files()
        .next()
        .expect("the fixture manifest should list a file");
    let missing = active_path(&fixture.path, id, first.name.as_str());
    fs::remove_file(&missing).expect("should remove the source artifact");

    let (_scratch, target) = root();
    let (_local_repository, local) = publish(&target, 9);
    target
        .activate(local)
        .expect("the local generation should activate");

    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    let error = download
        .synchronize()
        .await
        .expect_err("should refuse an incomplete source");

    assert_matches!(
        error,
        DownloadError::Storage(StorageError::Io(error)) if error.kind() == io::ErrorKind::NotFound
    );
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(local),
        "should preserve the local pointer"
    );
    assert!(
        !target.generation_path(id).exists(),
        "should publish nothing from an incomplete source"
    );
    assert!(
        staging_entries(&target).is_empty(),
        "should remove the failed attempt's staging directory"
    );

    // the same download acquires the repaired source.
    seed(&missing, first.name.as_str().as_bytes());
    let result = download
        .synchronize()
        .await
        .expect("should acquire the repaired source");

    assert_eq!(result, Some(id), "should name the repaired generation");
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(id),
        "should select the repaired generation"
    );
    assert_published(&target, &fixture, id, &repository);
}

#[tokio::test]
async fn synchronize_artifact_corrupt() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    let first = repository
        .files
        .files()
        .next()
        .expect("the fixture manifest should list a file");
    seed(
        &active_path(&fixture.path, id, first.name.as_str()),
        b"tampered bytes",
    );

    let (_scratch, target) = root();
    let (_local_repository, local) = publish(&target, 9);
    target
        .activate(local)
        .expect("the local generation should activate");

    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    let error = download
        .synchronize()
        .await
        .expect_err("should refuse a source artifact that fails its recorded digest");

    assert_matches!(
        error,
        DownloadError::Checksum { expected, actual, .. }
            if expected == first.hash && actual == Sha256Digest::of(b"tampered bytes")
    );
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(local),
        "should preserve the local pointer"
    );
    assert!(
        !target.generation_path(id).exists(),
        "should publish nothing from a corrupt source"
    );
    assert!(
        staging_entries(&target).is_empty(),
        "should remove the failed attempt's staging directory"
    );
}

#[tokio::test]
async fn synchronize_metadata_mismatch() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    // appending whitespace changes the identity while preserving valid JSON.
    let metadata_path = active_path(&fixture.path, id, METADATA_FILE);
    let mut metadata = fs::read(&metadata_path).expect("should read the source metadata");
    metadata.push(b' ');
    seed(&metadata_path, &metadata);

    let (_scratch, target) = root();
    let (_local_repository, local) = publish(&target, 9);
    target
        .activate(local)
        .expect("the local generation should activate");

    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    let error = download
        .synchronize()
        .await
        .expect_err("should refuse metadata that names another identity");

    assert_matches!(
        error,
        DownloadError::Document(OpenError::Identity { id: requested, actual })
            if requested == id && actual == Sha256Digest::of(&metadata)
    );
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(local),
        "should preserve the local pointer"
    );
    assert_eq!(
        fixture.reads(),
        vec![
            current_path(&fixture.path).to_string(),
            metadata_path.to_string(),
        ],
        "should read no artifact after the metadata fails its identity"
    );
    assert!(
        staging_entries(&target).is_empty(),
        "should leave no staging directory for a rejected document"
    );
}

#[tokio::test]
async fn synchronize_body_truncated() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    let first = repository
        .files
        .files()
        .next()
        .expect("the fixture manifest should list a file");
    fixture.trigger(
        &active_path(&fixture.path, id, first.name.as_str()),
        Trigger::Body {
            prefix: first.name.as_str().as_bytes()[..4].to_vec(),
        },
    );

    let (_scratch, target) = root();
    let (_local_repository, local) = publish(&target, 9);
    target
        .activate(local)
        .expect("the local generation should activate");

    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    let error = download
        .synchronize()
        .await
        .expect_err("should refuse a source body that fails mid-transfer");

    assert_matches!(error, DownloadError::Io(error) if error.kind() == io::ErrorKind::Other);
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(local),
        "should preserve the local pointer"
    );
    assert!(
        !target.generation_path(id).exists(),
        "should publish nothing from a failed transfer"
    );
    assert!(
        staging_entries(&target).is_empty(),
        "should remove the staging directory holding the written prefix"
    );
}

#[tokio::test]
async fn synchronize_publication_complete() {
    let (_scratch, target) = root();
    let (_repository, id) = publish(&target, 7);

    // the source pointer names a generation with no metadata or artifacts at the source.
    let fixture = Arc::new(Fixture::new());
    seed(&current_path(&fixture.path), id.to_string());

    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    let result = download
        .synchronize()
        .await
        .expect("should select the complete local publication");

    assert_eq!(result, Some(id), "should name the local generation");
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(id),
        "should select the local publication"
    );
    assert_eq!(
        fixture.reads(),
        vec![current_path(&fixture.path).to_string()],
        "should read no metadata or artifact object for a complete local publication"
    );
}

#[tokio::test]
async fn synchronize_publication_incomplete() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    // the source contains the missing target artifact. The existing publication must remain
    // untouched.
    let (_scratch, target) = root();
    let (_same_repository, same) = publish(&target, 7);
    assert_eq!(same, id, "the fixture publication should be reproducible");
    let first = repository
        .files
        .files()
        .next()
        .expect("the fixture manifest should list a file");
    let incomplete = target.generation_path(id).join(first.name.as_str());
    fs::remove_file(&incomplete).expect("should remove the published artifact");

    let (_local_repository, local) = publish(&target, 9);
    target
        .activate(local)
        .expect("the local generation should activate");

    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    let error = download
        .synchronize()
        .await
        .expect_err("should refuse an incomplete local publication");

    assert_matches!(
        error,
        DownloadError::Activate(ActivateError::Integrity(IntegrityVerificationError::Io {
            name,
            ..
        })) if name == first.name
    );
    assert!(
        !incomplete.exists(),
        "should not repair the incomplete publication"
    );
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(local),
        "should not select the incomplete publication"
    );
    assert_eq!(
        fixture.reads(),
        vec![current_path(&fixture.path).to_string()],
        "should read no metadata or artifact object for an existing publication"
    );
}

#[tokio::test]
async fn synchronize_publication_metadata_absent() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    let (_scratch, target) = root();
    let (_same_repository, same) = publish(&target, 7);
    assert_eq!(same, id, "should reproduce the source generation");
    let metadata = target.generation_path(id).join(METADATA_FILE);
    fs::remove_file(&metadata).expect("should remove the published metadata");

    let (_local_repository, local) = publish(&target, 9);
    target
        .activate(local)
        .expect("should activate the prior generation");
    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    let error = download
        .synchronize()
        .await
        .expect_err("should refuse a publication without metadata");

    assert_matches!(
        error,
        DownloadError::Activate(ActivateError::Open(OpenError::Unpublished(missing)))
            if missing == id
    );
    assert_matches!(
        fs::metadata(metadata),
        Err(error) if error.kind() == io::ErrorKind::NotFound,
        "should leave the incomplete publication unchanged"
    );
    assert_eq!(target.current().expect("should read current"), Some(local));
    assert_eq!(
        fixture.reads(),
        vec![current_path(&fixture.path).to_string()],
        "should not mistake absent metadata for an absent publication"
    );
}

#[tokio::test]
async fn synchronize_publication_corrupt() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    let (_scratch, target) = root();
    let (_same_repository, same) = publish(&target, 7);
    assert_eq!(same, id, "the fixture publication should be reproducible");
    let first = repository
        .files
        .files()
        .next()
        .expect("the fixture manifest should list a file");
    let corrupt = target.generation_path(id).join(first.name.as_str());
    make_writable(&corrupt);
    fs::write(&corrupt, b"tampered bytes").expect("should overwrite the published artifact");

    let (_local_repository, local) = publish(&target, 9);
    target
        .activate(local)
        .expect("the local generation should activate");

    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    let error = download
        .synchronize()
        .await
        .expect_err("should refuse a corrupt local publication");

    assert_matches!(
        error,
        DownloadError::Activate(ActivateError::Integrity(
            IntegrityVerificationError::Checksum { file, received }
        )) if file.name == first.name && received == Sha256Digest::of(b"tampered bytes")
    );
    assert_eq!(
        fs::read(&corrupt).expect("should read the published artifact"),
        b"tampered bytes".as_slice(),
        "should not repair the corrupt publication"
    );
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(local),
        "should not select the corrupt publication"
    );
    assert_eq!(
        fixture.reads(),
        vec![current_path(&fixture.path).to_string()],
        "should read no metadata or artifact object for an existing publication"
    );
}

#[tokio::test]
async fn synchronize_repeat_unchanged() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    let (_scratch, target) = root();
    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    download
        .synchronize()
        .await
        .expect("should acquire the source generation");
    let acquired = fixture.reads().len();

    let result = download
        .synchronize()
        .await
        .expect("should confirm the unchanged source generation");

    assert_eq!(result, Some(id), "should name the same generation");
    assert_eq!(
        fixture.reads_since(acquired),
        vec![current_path(&fixture.path).to_string()],
        "should read the source pointer and nothing else"
    );
}

#[tokio::test]
async fn synchronize_repeat_pointer_moved() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    let (_scratch, target) = root();
    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    download
        .synchronize()
        .await
        .expect("should acquire the source generation");
    let acquired = fixture.reads().len();

    // a local rollback moves the pointer away from the remembered success.
    let (_rolled_back_repository, rolled_back) = publish(&target, 9);
    target
        .activate(rolled_back)
        .expect("the rollback generation should activate");

    let result = download
        .synchronize()
        .await
        .expect("should reselect the source generation");

    assert_eq!(result, Some(id), "should name the source generation");
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(id),
        "should restore the pointer instead of trusting the remembered success"
    );
    assert_eq!(
        fixture.reads_since(acquired),
        vec![current_path(&fixture.path).to_string()],
        "should revalidate the local publication without reacquiring it"
    );
}

#[tokio::test]
async fn synchronize_repeat_directory_removed() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    let (_scratch, target) = root();
    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    download
        .synchronize()
        .await
        .expect("should acquire the source generation");
    let acquired = fixture.reads().len();

    fs::remove_dir_all(target.generation_path(id)).expect("should remove the published generation");

    let result = download
        .synchronize()
        .await
        .expect("should reacquire the removed generation");

    assert_eq!(result, Some(id), "should name the source generation");
    assert_published(&target, &fixture, id, &repository);
    assert_eq!(
        fixture.reads_since(acquired),
        acquisition_reads(&fixture, id, &repository),
        "should reacquire the generation instead of trusting the remembered success"
    );
}

#[tokio::test]
async fn synchronize_source_advances_during_read() {
    let (_source_scratch, source) = root();
    let (sampled_repository, sampled) = publish(&source, 7);
    let (successor_repository, successor) = publish(&source, 8);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, sampled, &sampled_repository);

    let first = sampled_repository
        .files
        .files()
        .next()
        .expect("the fixture manifest should list a file");
    let (trigger, control) = hold();
    fixture.trigger(
        &active_path(&fixture.path, sampled, first.name.as_str()),
        trigger,
    );

    let (_scratch, target) = root();
    let handle = spawn_synchronize(Download::new(
        Arc::clone(&fixture),
        target.clone(),
        fixture.source(),
    ));
    control
        .entered
        .await
        .expect("should open the held artifact read");

    // the source advances while the sampled generation is still in transfer.
    seed_source(&fixture, &source, successor, &successor_repository);

    control
        .release
        .send(())
        .expect("should release the held artifact read");
    let (mut download, result) = handle.await.expect("the synchronization task should join");

    assert_eq!(
        result.expect("should complete the sampled acquisition"),
        Some(sampled),
        "should complete the identity it sampled"
    );
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(sampled),
        "should select the sampled generation"
    );
    assert_published(&target, &fixture, sampled, &sampled_repository);

    let result = download
        .synchronize()
        .await
        .expect("should acquire the successor");

    assert_eq!(result, Some(successor), "should observe the successor next");
    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(successor),
        "should select the successor"
    );
    assert_published(&target, &fixture, successor, &successor_repository);
}

#[tokio::test(start_paused = true)]
async fn run_shutdown_during_read() {
    let (_source_scratch, source) = root();
    let (repository, id) = publish(&source, 7);
    let fixture = Arc::new(Fixture::new());
    seed_source(&fixture, &source, id, &repository);

    let first = repository
        .files
        .files()
        .next()
        .expect("the fixture manifest should list a file");
    let (trigger, mut control) = hold();
    fixture.trigger(
        &active_path(&fixture.path, id, first.name.as_str()),
        trigger,
    );

    let (_scratch, target) = root();
    let mut download = Download::new(Arc::clone(&fixture), target.clone(), fixture.source());
    let (shutdown, shutdown_signal) = oneshot::channel();
    let mut run = pin!(download.run(Duration::from_secs(60), async move {
        shutdown_signal.await.expect("should signal shutdown");
    }));

    tokio::select! {
        biased;
        () = &mut run => panic!("the run should await the held read"),
        entered = &mut control.entered => entered.expect("should open the held artifact read"),
    }
    shutdown.send(()).expect("should signal shutdown");

    // make the interval overdue as well, to observe shutdown's priority over a ready tick.
    tokio::time::advance(Duration::from_secs(120)).await;
    let pending = poll_once(run.as_mut()).await;
    let released = control.release.send(());
    assert_matches!(
        pending,
        Poll::Pending,
        "should keep running while the started read is held"
    );
    released.expect("should release the held artifact read");
    run.await;

    assert_eq!(
        target.current().expect("the pointer should read"),
        Some(id),
        "should finish the synchronization it started"
    );
    assert_published(&target, &fixture, id, &repository);
    assert_eq!(
        fixture.reads(),
        acquisition_reads(&fixture, id, &repository),
        "should stop without polling the source again"
    );
}
