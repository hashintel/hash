use alloc::io::Read;
use core::{assert_matches, io::Cursor};
use std::{fs, io};

use tokio::sync::oneshot;

use super::{LocalFile, WriteCondition};
use crate::file::{
    generation::test_utils::{entry_count, scratch, scratch_root},
    storage::error::StorageError,
};

/// A source that fails on its first read.
struct FailedReader;

impl Read for FailedReader {
    fn read(&mut self, _buf: &mut [u8]) -> io::Result<usize> {
        Err(io::Error::other("source stopped"))
    }
}

/// A source that announces its first read and blocks until its observer releases it.
struct PausedReader {
    /// Signals the first read, once.
    entered: Option<oneshot::Sender<()>>,
    /// Completes the read when the observer releases it.
    release: Option<oneshot::Receiver<()>>,
}

impl Read for PausedReader {
    fn read(&mut self, _buf: &mut [u8]) -> io::Result<usize> {
        if let Some(entered) = self.entered.take()
            && entered.send(()).is_err()
        {
            return Err(io::Error::other("entry observer dropped"));
        }

        if let Some(release) = self.release.take() {
            release.blocking_recv().map_err(io::Error::other)?;
        }
        Ok(0)
    }
}

/// A failed source leaves the old destination and removes its partial replacement.
#[tokio::test]
async fn write_partial_source() {
    let directory = scratch();
    let path = scratch_root(&directory).join("current");
    fs::write(&path, b"retained").expect("should seed the destination");
    let source = Cursor::new(b"partial").chain(FailedReader);
    let error = LocalFile::new(&path)
        .write(source, WriteCondition::Any)
        .await
        .expect_err("should return the source failure");
    assert_matches!(error, StorageError::Io(error) if error.to_string() == "source stopped");
    assert_eq!(
        fs::read(&path).expect("should read the destination"),
        b"retained"
    );
    assert_eq!(
        entry_count(scratch_root(&directory)),
        2,
        "should retain only the destination and persistent lock"
    );
    drop(directory);
}

/// The directory lock excludes another writer until source transfer completes.
#[tokio::test]
async fn write_transfer_lock() {
    let directory = scratch();
    let path = scratch_root(&directory).join("current");
    let lock_path = scratch_root(&directory).join(".storage-lock");
    let (entered, started) = oneshot::channel();
    let (release, proceed) = oneshot::channel();
    let writer = tokio::spawn(async move {
        LocalFile::new(&path)
            .write(
                PausedReader {
                    entered: Some(entered),
                    release: Some(proceed),
                },
                WriteCondition::Absent,
            )
            .await
    });
    started.await.expect("should begin reading the source");
    let lock = fs::File::options().read(true).write(true).open(&lock_path);
    let attempted = lock.as_ref().map(fs::File::try_lock);
    let released = release.send(());
    let completed = writer.await.expect("should join the writer");
    released.expect("should release the source reader");
    completed.expect("should complete the file");
    assert_matches!(attempted, Ok(Err(fs::TryLockError::WouldBlock)));
    let lock = lock.expect("should open the persistent lock");
    lock.try_lock()
        .expect("should release the lock after publication");
    drop(lock);
    drop(directory);
}
