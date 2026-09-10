use core::{
    assert_matches,
    future::Future as _,
    pin::Pin,
    task::{Context, Poll},
};
use std::{fs, io};

use tokio::{
    io::{AsyncRead, AsyncReadExt as _, ReadBuf},
    sync::oneshot,
};

use super::LocalFile;
use crate::file::{
    generation::scratch::tests::{entry_count, root, scratch},
    storage::{WriteCondition, error::StorageError},
};

struct FailedReader;

impl AsyncRead for FailedReader {
    fn poll_read(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        _buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Poll::Ready(Err(io::Error::other("source stopped")))
    }
}

struct PausedReader {
    entered: Option<oneshot::Sender<()>>,
    release: oneshot::Receiver<()>,
}

impl AsyncRead for PausedReader {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        _buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = self.get_mut();

        if let Some(entered) = this.entered.take()
            && entered.send(()).is_err()
        {
            return Poll::Ready(Err(io::Error::other("entry observer dropped")));
        }

        match Pin::new(&mut this.release).poll(cx) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(error)) => Poll::Ready(Err(io::Error::other(error))),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// A failed source leaves the old destination and removes its partial replacement.
#[tokio::test]
async fn write_partial_source() {
    let directory = scratch();
    let path = root(&directory).join("current");
    fs::write(&path, b"retained").expect("should seed the destination");
    let source = b"partial".as_slice().chain(FailedReader);
    let error = LocalFile::new(&path)
        .write(source, &WriteCondition::Any)
        .await
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
#[tokio::test]
async fn write_transfer_lock() {
    let directory = scratch();
    let path = root(&directory).join("current");
    let lock_path = root(&directory).join(".storage-lock");
    let (entered, started) = oneshot::channel();
    let (release, proceed) = oneshot::channel();
    let writer = tokio::spawn(async move {
        LocalFile::new(&path)
            .write(
                PausedReader {
                    entered: Some(entered),
                    release: proceed,
                },
                &WriteCondition::Absent,
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
