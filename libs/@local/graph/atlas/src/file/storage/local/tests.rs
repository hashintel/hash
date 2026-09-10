use core::assert_matches;
use std::{fs, io, io::Read as _, sync::mpsc, thread};

use super::LocalFile;
use crate::file::{
    generation::scratch::tests::{entry_count, root, scratch},
    storage::{Revision, RevisionKind, WriteCondition, error::StorageError},
};

struct PausedReader {
    entered: mpsc::Sender<()>,
    release: mpsc::Receiver<()>,
}

impl io::Read for PausedReader {
    fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
        self.entered.send(()).map_err(io::Error::other)?;
        self.release.recv().map_err(io::Error::other)?;
        Ok(0)
    }
}

struct FailedReader;

impl io::Read for FailedReader {
    fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
        Err(io::Error::other("source stopped"))
    }
}

/// A failed source leaves the old destination and removes its partial replacement.
#[test]
fn write_partial_source() {
    let directory = scratch();
    let path = root(&directory).join("current");
    fs::write(&path, b"retained").expect("should seed the destination");
    let source = b"partial".as_slice().chain(FailedReader);
    let error = LocalFile::new(&path)
        .write(source, &WriteCondition::Any)
        .expect_err("should return the source failure");
    assert_matches!(error, StorageError::Io(error) if error.to_string() == "source stopped");
    assert_eq!(
        fs::read(&path).expect("should read the destination"),
        b"retained"
    );
    assert_eq!(
        entry_count(root(&directory)),
        2,
        "should retain only the destination and persistent lock"
    );
    drop(directory);
}

/// The directory lock excludes another writer until source transfer completes.
#[test]
fn write_transfer_lock() {
    let directory = scratch();
    let path = root(&directory).join("current");
    let lock_path = root(&directory).join(".storage-lock");
    let (entered, started) = mpsc::channel();
    let (release, proceed) = mpsc::channel();
    let writer = thread::spawn(move || {
        LocalFile::new(&path).write(
            PausedReader {
                entered,
                release: proceed,
            },
            &WriteCondition::Absent,
        )
    });
    started.recv().expect("should begin reading the source");
    let lock = fs::File::options().read(true).write(true).open(lock_path);
    let attempted = lock.as_ref().map(fs::File::try_lock);
    let released = release.send(());
    let completed = writer.join().expect("should join the writer");
    released.expect("should release the source reader");
    completed.expect("should complete the file");
    assert_matches!(attempted, Ok(Err(fs::TryLockError::WouldBlock)));
    let lock = lock.expect("should open the persistent lock");
    lock.try_lock()
        .expect("should release the lock after publication");
    drop(lock);
    drop(directory);
}

#[test]
fn write_foreign_revision() {
    let directory = scratch();
    let path = root(&directory).join("missing/current");
    let condition = WriteCondition::Match(Revision(RevisionKind::Bucket("opaque".to_owned())));
    let error = LocalFile::new(&path)
        .write(b"contents".as_slice(), &condition)
        .expect_err("should refuse an S3 revision");
    assert_matches!(error, StorageError::RevisionMismatch);
    assert_eq!(entry_count(root(&directory)), 0);
    drop(directory);
}
