//! Scratch fixtures for tests across the crate, and the input-completion cases.

use core::{
    assert_matches,
    future::Future as _,
    pin::pin,
    task::{Context, Poll, Waker},
};
use std::{env, fs, io};

use camino::{Utf8Path, Utf8PathBuf};
use tokio::{io::AsyncWriteExt as _, runtime::Builder, sync::oneshot};
use uuid::Uuid;

use super::{ScratchDirectory, ScratchFile};

/// Creates a fixture scratch directory under the system temporary directory.
#[expect(
    clippy::create_dir,
    reason = "the fixture must refuse an existing directory rather than reuse it"
)]
pub(crate) fn scratch() -> ScratchDirectory {
    let path = Utf8PathBuf::from_path_buf(env::temp_dir())
        .expect("should have a UTF-8 temporary directory")
        .join(format!("atlas-scratch-test-{}", Uuid::now_v7()));
    fs::create_dir(&path).expect("should create the fixture directory");
    ScratchDirectory::new(path)
}

/// Returns the directory's own path for placing fixture files inside it.
pub(crate) fn root(directory: &ScratchDirectory) -> &Utf8Path {
    &directory.path
}

/// Counts the entries directly inside `path`.
pub(crate) fn entry_count(path: &Utf8Path) -> usize {
    fs::read_dir(path)
        .expect("should read the fixture directory")
        .count()
}

/// Completed inputs take distinct names in one directory and keep the bytes written to them.
#[tokio::test]
async fn finish_distinct_files() {
    let directory = scratch();
    let mut first = ScratchFile::new(root(&directory))
        .await
        .expect("should create the first input");
    let mut second = ScratchFile::new(root(&directory))
        .await
        .expect("should create the second input");
    first
        .file
        .write_all(b"first body")
        .await
        .expect("should write the first input");
    first
        .file
        .flush()
        .await
        .expect("should finish writing the first input");
    second
        .file
        .write_all(b"second body")
        .await
        .expect("should write the second input");
    second
        .file
        .flush()
        .await
        .expect("should finish writing the second input");
    let first = first
        .finish(Ok::<_, io::Error>(()))
        .await
        .expect("should retain the first input");
    let second = second
        .finish(Ok::<_, io::Error>(()))
        .await
        .expect("should retain the second input");
    assert_ne!(
        first, second,
        "should choose distinct names in the shared directory"
    );
    assert_eq!(
        first.parent(),
        Some(root(&directory)),
        "should use the supplied scratch directory"
    );
    assert_eq!(
        second.parent(),
        Some(root(&directory)),
        "should use the supplied scratch directory"
    );
    assert_eq!(
        fs::read(first).expect("should read the first input"),
        b"first body"
    );
    assert_eq!(
        fs::read(second).expect("should read the second input"),
        b"second body"
    );
    assert_eq!(
        entry_count(root(&directory)),
        2,
        "should retain both completed inputs"
    );
    drop(directory);
}

#[test]
fn finish_pending_write() {
    let runtime = Builder::new_current_thread()
        .max_blocking_threads(1)
        .build()
        .expect("should build the file runtime");
    runtime.block_on(async {
        let directory = scratch();
        let mut input = ScratchFile::new(root(&directory))
            .await
            .expect("should create the input");

        // occupying the only blocking worker keeps the file write pending.
        let (started, ready) = oneshot::channel();
        let (release, resume) = oneshot::channel::<()>();
        let blocker = tokio::task::spawn_blocking(move || {
            started
                .send(())
                .expect("should announce the blocked worker");
            resume.blocking_recv()
        });
        ready.await.expect("should start the blocked worker");
        input
            .file
            .write_all(b"queued body")
            .await
            .expect("should queue the input write");

        let mut finish = pin!(input.finish(Ok::<_, io::Error>(())));
        let initial = finish
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop()));
        release.send(()).expect("should release the blocked worker");
        blocker
            .await
            .expect("should join the blocked worker")
            .expect("should receive the release");
        assert_matches!(initial, Poll::Pending);

        let path = finish.await.expect("should retain the completed input");
        assert_eq!(
            fs::read(path).expect("should read the completed input"),
            b"queued body"
        );
        drop(directory);
    });
}

/// A failed transfer removes its own partial input, returns its error and retains the others.
#[tokio::test]
async fn finish_partial_failure() {
    let directory = scratch();
    let sentinel = root(&directory).join("retained.bin");
    fs::write(&sentinel, b"retained").expect("should create an unrelated file");
    let mut partial = ScratchFile::new(root(&directory))
        .await
        .expect("should create the partial input");
    partial
        .file
        .write_all(b"short")
        .await
        .expect("should write the initial bytes");
    let error = partial
        .finish(Err(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "fixture transfer failure",
        )))
        .await
        .expect_err("should preserve the transfer error");
    assert_eq!(
        error.kind(),
        io::ErrorKind::UnexpectedEof,
        "should return the transfer's error"
    );
    assert_eq!(
        entry_count(root(&directory)),
        1,
        "should remove only the partial input"
    );
    assert_eq!(
        fs::read(sentinel).expect("should retain the unrelated file"),
        b"retained"
    );
    drop(directory);
}
