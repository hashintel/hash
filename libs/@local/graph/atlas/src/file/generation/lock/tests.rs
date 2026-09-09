use core::assert_matches;
use std::{
    fs::{self, File},
    io::{self, Read as _},
    process::Command,
};

use camino::Utf8PathBuf;
use uuid::Uuid;

use super::{LOCK_FILE, RemoveError};
use crate::file::generation::{
    ActivateError, CurrentError, GenerationId, GenerationRoot, ScratchDirectory,
};

fn root() -> (ScratchDirectory, GenerationRoot) {
    let path = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temporary directory should have a UTF-8 path")
        .join(format!("atlas-generation-lock-{}", Uuid::now_v7()));
    let scratch = ScratchDirectory::new(path.clone());
    let root = GenerationRoot::new(path).expect("the generation root should open");
    (scratch, root)
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
                "file::generation::lock::tests::lock_exclusion",
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
