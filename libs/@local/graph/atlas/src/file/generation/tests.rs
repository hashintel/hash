#![expect(
    clippy::significant_drop_tightening,
    reason = "fixture stagings deliberately live to the end of their tests"
)]
use core::assert_matches;
use std::{
    fs::{self, File},
    io::{self, Read as _, Write as _},
    process::Command,
};

use camino::Utf8PathBuf;

pub(super) use super::fixture::{
    digest, make_writable, publish_noncanonical, repository, root, stage_all,
};
use super::{
    ActivateError, CurrentError, GenerationId, GenerationRoot, LOCK_FILE, METADATA_FILE, OpenError,
    RemoveError, SealError,
};
use crate::{
    file::{repository::FileName, salt::SaltRepository},
    integrity::{Sha256, Update as _},
};

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-generation-{}-{name}",
            std::process::id(),
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    dir
}

fn name(name: &str) -> FileName {
    FileName::new(name.to_owned()).expect("the fixture name is a plain file name")
}

#[test]
fn seal_round_trip() {
    let root = GenerationRoot::new(scratch("publish")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");
    let published_path = root.generation_path(published.id());

    // Every manifest file is present with its staged bytes.
    for entry in repository.files.files() {
        let bytes = fs::read(published_path.join(entry.name.as_str()))
            .expect("a published file should read");
        assert_eq!(bytes, entry.name.as_str().as_bytes());
    }

    let document = fs::read(published_path.join(METADATA_FILE)).expect("the document should read");
    let mut hasher = Sha256::new();
    hasher.update(&document);
    assert_eq!(hasher.finalize(), published.id().digest());

    // The document round-trips to the sealed value.
    let decoded: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");
    assert_eq!(decoded, repository);
}

#[test]
fn seal_read_only() {
    let root = GenerationRoot::new(scratch("readonly")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");
    let published_path = root.generation_path(published.id());

    // Every published file, the metadata document included, is read-only and
    // refuses a write handle: the permission drop turns a rewriting accident
    // into an OS error.
    let mut names: Vec<String> = repository
        .files
        .files()
        .map(|entry| entry.name.as_str().to_owned())
        .collect();
    names.push(METADATA_FILE.to_owned());
    for name in names {
        let path = published_path.join(&name);
        assert!(
            fs::metadata(&path)
                .expect("a published file should stat")
                .permissions()
                .readonly(),
            "{name} should be read-only"
        );
        assert!(
            fs::OpenOptions::new().write(true).open(&path).is_err(),
            "{name} should refuse a write handle"
        );
    }
}

#[test]
fn seal_manifest_mismatch() {
    let root = GenerationRoot::new(scratch("mismatch")).expect("the root should open");
    let repository = repository();

    // A manifest-listed file is absent.
    let staging = root.stage().expect("the staging should create");
    assert_matches!(staging.seal(&repository), Err(SealError::Missing { .. }));

    // The manifest omits a staged file.
    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    drop(
        staging
            .create(&name("stray.arr"))
            .expect("the stray file should create"),
    );
    assert_matches!(staging.seal(&repository), Err(SealError::Unlisted { .. }));

    // No failure published anything: the root holds no generation.
    let entries: Vec<_> = fs::read_dir(&root.path)
        .expect("the root should list")
        .map(|entry| entry.expect("the entry should read").file_name())
        .collect();
    assert!(
        entries.is_empty(),
        "a failed seal should leave no visible entry: {entries:?}"
    );
}

#[test]
fn seal_duplicate_document() {
    let root = GenerationRoot::new(scratch("identical")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    assert_matches!(
        staging.seal(&repository),
        Err(SealError::AlreadyPublished(id)) if id == published.id()
    );
}

#[test]
fn activate_rollback() {
    let root = GenerationRoot::new(scratch("activate")).expect("the root should open");
    assert!(
        root.current()
            .expect("an absent pointer should read")
            .is_none()
    );

    // Activation rejects an unpublished generation and leaves the
    // pointer untouched.
    let unpublished = GenerationId(digest("unpublished"));
    assert_matches!(
        root.activate(unpublished),
        Err(ActivateError::Unpublished(id)) if id == unpublished
    );
    assert!(
        root.current()
            .expect("an absent pointer should read")
            .is_none()
    );

    let first = repository();
    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &first);
    let first = staging.seal(&first).expect("the staging should seal");

    let mut second = repository();
    second.metadata.reproducibility.config.seed = 8;
    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &second);
    let second = staging.seal(&second).expect("the staging should seal");

    root.activate(first.id())
        .expect("the first should activate");
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(first.id())
    );

    root.activate(second.id())
        .expect("the second should activate");
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(second.id())
    );

    // Rollback is re-activation of the older generation.
    root.activate(first.id())
        .expect("the first should activate");
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(first.id())
    );
}

/// Artifact verification retains the root lock while waiting for source bytes.
#[test]
#[cfg(unix)]
fn activate_verified_pending_read() {
    let (_scratch, root) = root();
    let repository = repository();
    let staging = root.stage().expect("should create staging");
    stage_all(&staging, &repository);
    let published = staging
        .seal(&repository)
        .expect("should publish the fixture");
    let previous = publish(&root, 3);
    root.activate(previous)
        .expect("should select the previous generation");

    let first = repository
        .files
        .files()
        .next()
        .expect("should list an artifact");
    let path = root
        .generation_path(published.id())
        .join(first.name.as_str());
    fs::remove_file(&path).expect("should remove the fixture artifact");
    let output = Command::new("mkfifo")
        .arg(&path)
        .output()
        .expect("should create the FIFO");
    assert!(
        output.status.success(),
        "should create the FIFO: {output:?}"
    );

    let (locked, current, activated) = std::thread::scope(|scope| {
        let activation = scope.spawn(|| root.activate_verified(published.id()));
        // opening the write end completes only once verification opens the read end. EOF remains
        // under our control until the writer closes.
        let mut writer = File::options()
            .write(true)
            .open(&path)
            .expect("should open the FIFO writer");
        let independent = File::options()
            .read(true)
            .write(true)
            .open(root.path().join(LOCK_FILE))
            .expect("should open the independent lock descriptor");
        let locked = independent.try_lock();
        drop(independent);
        let current = root.current();

        // release the reader before asserting, including when the lock observation is wrong.
        writer
            .write_all(first.name.as_str().as_bytes())
            .expect("should supply the artifact bytes");
        drop(writer);
        let activated = activation.join().expect("should join verification");
        (locked, current, activated)
    });

    assert_matches!(locked, Err(fs::TryLockError::WouldBlock));
    assert_eq!(
        current.expect("should read the previous pointer"),
        Some(previous)
    );
    activated.expect("should activate after completing verification");
    assert_eq!(
        root.current().expect("should read the selected pointer"),
        Some(published.id())
    );
}

#[test]
fn current_corrupt_pointer() {
    let root = GenerationRoot::new(scratch("corrupt")).expect("the root should open");
    fs::write(root.path.join("current"), "not a digest").expect("the pointer should write");

    assert_matches!(root.current(), Err(CurrentError::Corrupt(_)));
}

#[test]
fn open_active_generation() {
    let root = GenerationRoot::new(scratch("open")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");
    root.activate(published.id())
        .expect("the generation should activate");

    // The serving entry resolves the pointer and opens what it names.
    let id = root
        .current()
        .expect("the pointer should read")
        .expect("a generation is active");
    let generation = root.open(id).expect("the active generation should open");

    assert_eq!(generation.id(), published.id());
    assert_eq!(generation.path(), root.generation_path(published.id()));
    assert_eq!(generation.repository(), &repository);

    // Every manifest file is where path_of points, with its bytes.
    for entry in repository.files.files() {
        let bytes =
            fs::read(generation.path_of(&entry.name)).expect("a published file should read");
        assert_eq!(bytes, entry.name.as_str().as_bytes());
    }
}

#[test]
fn open_invalid_documents() {
    let root = GenerationRoot::new(scratch("open-reject")).expect("the root should open");

    // An unpublished generation.
    let unpublished = GenerationId(digest("unpublished"));
    assert_matches!(
        root.open(unpublished),
        Err(OpenError::Unpublished(id)) if id == unpublished
    );

    // A tampered document still parses but no longer hashes to the
    // directory-naming id.
    let repository = repository();
    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");

    let document_path = root.generation_path(published.id()).join(METADATA_FILE);
    let mut document = fs::read(&document_path).expect("the document should read");
    document.push(b'\n');
    make_writable(&document_path);
    fs::write(&document_path, &document).expect("the document should write");

    assert_matches!(
        root.open(published.id()),
        Err(OpenError::Identity { id, .. }) if id == published.id()
    );

    // A hand-built directory whose document hashes to its name but is
    // no repository fails to parse. The seal path cannot produce this.
    let foreign = "not a repository";
    let id = GenerationId(digest(foreign));
    let path = root.generation_path(id);
    fs::create_dir_all(&path).expect("the foreign directory should create");
    fs::write(path.join(METADATA_FILE), foreign).expect("the foreign document should write");

    assert_matches!(root.open(id), Err(OpenError::Document(_)));
}

#[test]
fn open_version_precedence() {
    let root = GenerationRoot::new(scratch("open-version")).expect("the root should open");

    // Serializing the repository preserves the field order required by version checking.
    let document = serde_json::to_string(&repository()).expect("the repository should serialize");
    assert!(document.contains(r#""version":2"#));
    assert!(document.contains(r#""reproducibility""#));

    let publish = |document: &str| {
        let id = GenerationId(digest(document));
        let path = root.generation_path(id);
        fs::create_dir_all(&path).expect("the generation directory should create");
        fs::write(path.join(METADATA_FILE), document).expect("the document should write");
        id
    };

    // A body that no longer satisfies the current schema.
    let broken = document.replace(r#""reproducibility""#, r#""reproducibilty""#);

    // A retired version takes precedence over an invalid body.
    let retired = broken.replace(r#""version":2"#, r#""version":1"#);
    let error = root
        .open(publish(&retired))
        .expect_err("a retired version should fail");
    assert!(
        error
            .to_string()
            .contains("unsupported repository version 1"),
        "the version decides the diagnosis: {error}",
    );

    // An accepted version exposes the same body's schema error.
    let error = root
        .open(publish(&broken))
        .expect_err("an invalid body should fail");
    let message = error.to_string();
    assert!(
        !message.contains("unsupported repository version"),
        "the accepted version leaves the body to fail: {message}",
    );
}

#[test]
fn staging_drop_cleanup() {
    let path = scratch("abandon");
    let root = GenerationRoot::new(&path).expect("the root should open");

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository());
    drop(staging);

    let entries: Vec<_> = fs::read_dir(&path)
        .expect("the root should list")
        .map(|entry| entry.expect("the entry should read").file_name())
        .collect();
    assert!(
        entries.is_empty(),
        "dropping an abandoned staging should leave no entries: {entries:?}"
    );
}

fn publish(root: &GenerationRoot, byte: u8) -> GenerationId {
    let id = format!("{byte:02x}")
        .repeat(32)
        .parse()
        .expect("the hexadecimal fixture should name a generation");
    fs::create_dir_all(root.generation_path(id)).expect("the generation directory should create");
    id
}

#[test]
fn remove_active() {
    let (_scratch, root) = root();
    let id = publish(&root, 1);
    root.activate(id).expect("the generation should activate");

    let error = root
        .remove(id)
        .expect_err("the active generation should remain");
    assert_matches!(error, RemoveError::Active(active) if active == id);
    assert!(root.generation_path(id).is_dir());
    assert_eq!(root.current().expect("the pointer should read"), Some(id));
}

#[test]
#[expect(
    clippy::verbose_file_reads,
    reason = "the test reads a retained descriptor after removing its path"
)]
fn remove_inactive() {
    let (_scratch, root) = root();
    let retired = publish(&root, 1);
    let active = publish(&root, 2);
    root.activate(active)
        .expect("the generation should activate");
    let path = root.generation_path(retired).join("artifact");
    fs::write(&path, "retained bytes").expect("the artifact should write");
    let mut reader = File::open(path).expect("the artifact should open");

    root.remove(retired)
        .expect("the inactive generation should remove");

    assert!(!root.generation_path(retired).exists());
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(active)
    );
    let mut content = String::new();
    reader
        .read_to_string(&mut content)
        .expect("the open descriptor should remain readable");
    assert_eq!(content, "retained bytes");
    assert_matches!(root.activate(retired), Err(ActivateError::Unpublished(id)) if id == retired);
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(active)
    );
}

#[test]
fn remove_corrupt_pointer() {
    let (_scratch, root) = root();
    let id = publish(&root, 1);
    fs::write(root.path().join("current"), "not a generation")
        .expect("the corrupt pointer should write");

    let error = root
        .remove(id)
        .expect_err("a corrupt pointer should prevent removal");

    assert_matches!(error, RemoveError::Current(CurrentError::Corrupt(_)));
    assert!(root.generation_path(id).is_dir());
}

#[test]
fn remove_missing() {
    let (_scratch, root) = root();
    let id = publish(&root, 1);
    root.remove(id)
        .expect("an inactive generation should remove without a current pointer");

    let error = root
        .remove(id)
        .expect_err("an absent directory should report its filesystem error");

    assert_matches!(error, RemoveError::Io(error) if error.kind() == io::ErrorKind::NotFound);
}

#[test]
fn lock_unavailable() {
    let (_scratch, root) = root();
    let id = publish(&root, 1);
    fs::create_dir_all(root.path().join(LOCK_FILE))
        .expect("the lock-path obstruction should create");

    assert_matches!(root.activate(id), Err(ActivateError::Io(_)));
    let error = root
        .remove(id)
        .expect_err("removal should require the root lock");
    assert_matches!(error, RemoveError::Io(_));
    assert!(root.generation_path(id).is_dir());
    assert_eq!(
        root.current().expect("the absent pointer should read"),
        None
    );
}

/// Independently opened descriptors contend across processes and release on close.
#[test]
#[cfg_attr(miri, ignore = "Miri cannot spawn a second test process")]
fn lock_exclusion() {
    const ROOT: &str = "HASH_ATLAS_LOCK_TEST_ROOT";
    const BLOCKED: &str = "HASH_ATLAS_LOCK_TEST_BLOCKED";
    if let Some(path) = std::env::var_os(ROOT) {
        let file = File::options()
            .read(true)
            .write(true)
            .open(std::path::Path::new(&path).join(LOCK_FILE))
            .expect("the parent's lock file should open independently");
        if std::env::var_os(BLOCKED).is_some() {
            assert_matches!(file.try_lock(), Err(fs::TryLockError::WouldBlock));
        } else {
            file.try_lock()
                .expect("the closed descriptor should release its lock");
        }
        return;
    }

    let (_scratch, root) = root();
    let lock = root.lock().expect("the root lock should acquire");
    let child = |blocked: bool| {
        let mut command =
            Command::new(std::env::current_exe().expect("the test binary should resolve"));
        command
            .args([
                "--exact",
                "file::generation::tests::lock_exclusion",
                "--nocapture",
            ])
            .env(ROOT, root.path())
            .env_remove(BLOCKED);
        if blocked {
            command.env(BLOCKED, "1");
        }
        let output = command
            .output()
            .expect("the lock-checking child should execute");
        assert!(
            output.status.success(),
            "the child should satisfy the lock assertion: {} {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            String::from_utf8_lossy(&output.stdout).contains("1 passed"),
            "the child should execute its assertion"
        );
    };

    child(true);
    drop(lock);
    assert!(root.path().join(LOCK_FILE).is_file());
    child(false);
}
