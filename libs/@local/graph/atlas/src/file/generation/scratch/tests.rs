use std::{env, fs, io};

use camino::{Utf8Path, Utf8PathBuf};
use tokio::io::AsyncWriteExt as _;
use uuid::Uuid;

use super::{ScratchDirectory, ScratchFile};

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

pub(crate) fn entry_count(path: &Utf8Path) -> usize {
    fs::read_dir(path)
        .expect("should read the fixture directory")
        .count()
}

#[tokio::test]
async fn finish_distinct_files() {
    let directory = scratch();
    let mut first = ScratchFile::new(directory.path())
        .await
        .expect("should create the first input");
    let mut second = ScratchFile::new(directory.path())
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
        Some(directory.path()),
        "should use the supplied scratch directory"
    );
    assert_eq!(
        second.parent(),
        Some(directory.path()),
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
        entry_count(directory.path()),
        2,
        "should retain both completed inputs"
    );
}

#[tokio::test]
async fn finish_partial_failure() {
    let directory = scratch();
    let sentinel = directory.path().join("retained.bin");
    fs::write(&sentinel, b"retained").expect("should create an unrelated file");
    let mut partial = ScratchFile::new(directory.path())
        .await
        .expect("should create the partial input");
    partial
        .file
        .write_all(b"short")
        .await
        .expect("should write the initial bytes");
    partial
        .file
        .flush()
        .await
        .expect("should finish writing the initial bytes");
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
        entry_count(directory.path()),
        1,
        "should remove only the partial input"
    );
    assert_eq!(
        fs::read(sentinel).expect("should retain the unrelated file"),
        b"retained"
    );
}
