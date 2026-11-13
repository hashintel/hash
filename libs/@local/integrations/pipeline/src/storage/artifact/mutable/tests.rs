use core::time::Duration;
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::Instant,
};

use bytes::Bytes;
use hash_crypto::{Secret, digest::Sha256Digest};
use object_store::{PutPayload, UpdateVersion, path::Path as Location};
use rstest::rstest;
use serde_json::json;
use tempfile::TempDir;
use tokio::runtime::{Builder, Runtime};

use super::{MAX_MUTABLE_BYTES, MutableVersion};
use crate::storage::{
    ArtifactError, ArtifactKey, ArtifactStorage, S3Bucket,
    tests::{bucket, minio, s3_storage},
};

fn key() -> ArtifactKey {
    ArtifactKey("scope/current.json".into())
}

fn runtime() -> Runtime {
    Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("should build a test runtime")
}

fn wait_for(path: &Path) {
    let deadline = Instant::now() + Duration::from_secs(20);
    while !path.is_file() {
        assert!(
            Instant::now() < deadline,
            "should reach the process barrier at {path:?}"
        );
        thread::sleep(Duration::from_millis(5));
    }
}

fn child(root: &Path, name: &str, mode: &str) -> Child {
    Command::new(env::current_exe().expect("should locate the test executable"))
        .args([
            "--exact",
            "storage::artifact::mutable::tests::conditional_process",
            "--nocapture",
        ])
        .env("PIPELINE_STORAGE_CHILD_ROOT", root)
        .env("PIPELINE_STORAGE_CHILD_NAME", name)
        .env("PIPELINE_STORAGE_CHILD_MODE", mode)
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("should spawn an independent storage process")
}

/// The helper test is selected directly in a subprocess, where all storage handles are new.
#[test]
fn conditional_process() {
    let Some(root) = env::var_os("PIPELINE_STORAGE_CHILD_ROOT").map(PathBuf::from) else {
        return;
    };
    let name = env::var("PIPELINE_STORAGE_CHILD_NAME").expect("should have a child name");
    let mode = env::var("PIPELINE_STORAGE_CHILD_MODE").expect("should have a child mode");
    runtime().block_on(async {
        let storage = ArtifactStorage::local(&root.join("objects")).expect("should open storage");
        let previous = storage
            .read_versioned(&key())
            .await
            .expect("should read the original state");
        if mode == "race" {
            fs::write(root.join(format!("{name}.ready")), []).expect("should announce the read");
            wait_for(&root.join("release"));
        }
        let bytes =
            serde_json::to_vec(&json!({"winner": name})).expect("should encode child state");
        let won = storage
            .replace_if(
                &key(),
                previous.as_ref().map(|value| &value.version),
                Bytes::from(bytes),
            )
            .await
            .expect("should attempt a conditional write");
        fs::write(
            root.join(format!("{name}.result")),
            if won {
                b"true".as_slice()
            } else {
                b"false".as_slice()
            },
        )
        .expect("should record the conditional outcome");
    });
}

#[expect(
    clippy::infinite_loop,
    reason = "the parent deliberately kills this child while it holds the write lock"
)]
pub(super) fn crash_point(point: &str) {
    if env::var("PIPELINE_STORAGE_CHILD_MODE").as_deref() != Ok(point) {
        return;
    }
    let root = PathBuf::from(
        env::var_os("PIPELINE_STORAGE_CHILD_ROOT").expect("should have a child root"),
    );
    fs::write(root.join("crash.ready"), []).expect("should announce the crash boundary");
    loop {
        thread::park();
    }
}

#[test]
fn conditional_local_process_races() {
    let directory = TempDir::new().expect("should create a race directory");
    let runtime = runtime();
    for phase in ["create", "update"] {
        let root = directory.path();
        let names = [format!("{phase}-first"), format!("{phase}-second")];
        let mut first = child(root, &names[0], "race");
        let mut second = child(root, &names[1], "race");
        wait_for(&root.join(format!("{}.ready", names[0])));
        wait_for(&root.join(format!("{}.ready", names[1])));
        fs::write(root.join("release"), []).expect("should release both writers");
        assert!(
            first
                .wait()
                .expect("should join the first process")
                .success(),
            "should finish first writer"
        );
        assert!(
            second
                .wait()
                .expect("should join the second process")
                .success(),
            "should finish second writer"
        );
        let first_won = fs::read(root.join(format!("{}.result", names[0])))
            .expect("should read first result")
            == b"true";
        let second_won = fs::read(root.join(format!("{}.result", names[1])))
            .expect("should read second result")
            == b"true";
        assert_ne!(
            first_won, second_won,
            "should have exactly one winner for {phase}"
        );
        let winner = if first_won { &names[0] } else { &names[1] };
        let stored = runtime.block_on(async {
            ArtifactStorage::local(&root.join("objects"))
                .expect("should reopen local storage")
                .read_versioned(&key())
                .await
                .expect("should read the winning bytes")
                .expect("should retain the winner")
                .bytes
        });
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&stored)
                .expect("should decode complete JSON"),
            json!({"winner": winner}),
            "should retain the winning complete state"
        );
        fs::remove_file(root.join("release")).expect("should reset the race barrier");
    }
}

#[rstest]
#[case::before("before_rename", "original")]
#[case::after("after_rename", "crashed")]
fn conditional_local_crash(#[case] point: &str, #[case] winner: &str) {
    let directory = TempDir::new().expect("should create a crash directory");
    let storage =
        ArtifactStorage::local(&directory.path().join("objects")).expect("should open storage");
    let runtime = runtime();
    runtime.block_on(async {
        assert!(
            storage
                .replace_if(
                    &key(),
                    None,
                    Bytes::from_static(br#"{"winner":"original"}"#)
                )
                .await
                .expect("should seed state"),
            "should create initial state"
        );
    });
    let mut process = child(directory.path(), "crashed", point);
    wait_for(&directory.path().join("crash.ready"));
    process
        .kill()
        .expect("should stop the process at the write boundary");
    let _status = process.wait().expect("should reap the stopped process");
    runtime.block_on(async {
        let stored = storage
            .read_versioned(&key())
            .await
            .expect("should reacquire released OS lock")
            .expect("should retain complete state");
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&stored.bytes)
                .expect("should decode complete JSON"),
            json!({"winner": winner}),
            "should observe the complete old or complete new state"
        );
        assert!(
            storage
                .replace_if(
                    &key(),
                    Some(&stored.version),
                    Bytes::from_static(br#"{"winner":"retry"}"#)
                )
                .await
                .expect("should update after process death"),
            "should recover from the observed version"
        );
    });
}

#[tokio::test]
async fn conditional_s3_races() {
    let directory = TempDir::new().expect("should create a directory");
    let (_minio, port) = minio().await;
    let first = s3_storage(port, &directory.path().join("first"));
    let second = s3_storage(port, &directory.path().join("second"));
    let key = key();
    for phase in 0..2 {
        let first_bytes = Bytes::from(format!("first-{phase}"));
        let second_bytes = Bytes::from(format!("second-{phase}"));
        let first_read = first
            .read_versioned(&key)
            .await
            .expect("should read first token");
        let second_read = second
            .read_versioned(&key)
            .await
            .expect("should read second token");
        let (first_write, second_write) = tokio::join!(
            first.replace_if(
                &key,
                first_read.as_ref().map(|value| &value.version),
                first_bytes.clone()
            ),
            second.replace_if(
                &key,
                second_read.as_ref().map(|value| &value.version),
                second_bytes.clone()
            ),
        );
        let first_won = first_write.expect("should conditionally write first state");
        let second_won = second_write.expect("should conditionally write second state");
        assert_ne!(first_won, second_won, "should allow one conditional writer");
        let stored = first
            .read_versioned(&key)
            .await
            .expect("should read winning state")
            .expect("should retain an object");
        assert_eq!(
            stored.bytes.as_ref(),
            if first_won {
                first_bytes.as_ref()
            } else {
                second_bytes.as_ref()
            },
            "should not overwrite the winner"
        );
    }
}

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn conditional_size_limits(#[case] s3: bool) {
    let directory = TempDir::new().expect("should create a directory");
    let server = if s3 { Some(minio().await) } else { None };
    let storage = server.as_ref().map_or_else(
        || ArtifactStorage::local(directory.path()).expect("should open local storage"),
        |(_, port)| s3_storage(*port, directory.path()),
    );
    let oversized = Bytes::from(vec![0; MAX_MUTABLE_BYTES + 1]);
    let error = storage
        .replace_if(&key(), None, oversized.clone())
        .await
        .expect_err("should refuse an oversized update");
    assert!(
        matches!(error.current_context(), ArtifactError::Write),
        "should classify payload failure as write"
    );
    assert!(
        storage
            .read_versioned(&key())
            .await
            .expect("should read absent state")
            .is_none(),
        "should leave the key untouched"
    );
    storage
        .store
        .put(&Location::from(&*key().0), PutPayload::from(oversized))
        .await
        .expect("should seed an externally oversized object");
    let error = storage
        .read_versioned(&key())
        .await
        .expect_err("should refuse an oversized read");
    assert!(
        matches!(error.current_context(), ArtifactError::Read),
        "should classify excessive stored bytes as read"
    );
}

#[tokio::test]
async fn conditional_invalid_tokens() {
    let directory = TempDir::new().expect("should create a directory");
    let storage = ArtifactStorage::local(directory.path()).expect("should open storage");
    let version = MutableVersion::Object(UpdateVersion {
        e_tag: Some("remote".into()),
        version: None,
    });
    let error = storage
        .replace_if(&key(), Some(&version), Bytes::from_static(b"{}"))
        .await
        .expect_err("should refuse a token from another backend");
    assert!(
        matches!(error.current_context(), ArtifactError::Write),
        "should fail without falling back to an unconditional write"
    );
    assert!(
        storage
            .read_versioned(&key())
            .await
            .expect("should read absent state")
            .is_none(),
        "should not create the object"
    );
}

#[tokio::test]
async fn conditional_remote_invalid_tokens() {
    let directory = TempDir::new().expect("should create a directory");
    let storage = ArtifactStorage::s3(&bucket(1), directory.path()).expect("should build a client");
    for version in [
        MutableVersion::Local(Sha256Digest::of(b"{}")),
        MutableVersion::Object(UpdateVersion {
            e_tag: None,
            version: Some("version-only".into()),
        }),
        MutableVersion::Object(UpdateVersion {
            e_tag: Some(String::new()),
            version: None,
        }),
    ] {
        let error = storage
            .replace_if(&key(), Some(&version), Bytes::from_static(b"{}"))
            .await
            .expect_err("should reject unusable tokens before contacting the endpoint");
        assert!(
            matches!(error.current_context(), ArtifactError::Write),
            "should fail closed for an unusable update token"
        );
        assert!(
            error.downcast_ref::<object_store::Error>().is_none(),
            "should reject the token before a backend request"
        );
    }
}

#[tokio::test]
async fn conditional_s3_authentication_failure() {
    let directory = TempDir::new().expect("should create a directory");
    let (_minio, port) = minio().await;
    let storage = ArtifactStorage::s3(
        &S3Bucket {
            secret: Secret::from_vec(b"wrong".to_vec()),
            ..bucket(port)
        },
        directory.path(),
    )
    .expect("should build the client");
    let error = storage
        .read_versioned(&key())
        .await
        .expect_err("should not treat authorization failure as absence");
    assert!(
        matches!(error.current_context(), ArtifactError::Read),
        "should retain a storage read failure"
    );
    let error = storage
        .replace_if(&key(), None, Bytes::from_static(b"{}"))
        .await
        .expect_err("should not treat authorization failure as a conflict");
    assert!(
        matches!(error.current_context(), ArtifactError::Write),
        "should retain a storage write failure"
    );
}
