use core::{pin, task};
use std::io;

use tokio::io::{AsyncBufRead, AsyncRead};

use crate::file::storage::{Revision, RevisionKind};

#[cfg(test)]
mod tests;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum FileOrigin {
    Local,
    Bucket,
}

pin_project_lite::pin_project! {
    pub(crate) struct FileContents<R> {
        #[pin]
        pub reader: R,
        revision: Revision,
    }
}

impl<R> FileContents<R> {
    pub(super) const fn new(reader: R, revision: Revision) -> Self {
        Self { reader, revision }
    }

    pub(crate) const fn revision(&self) -> &Revision {
        &self.revision
    }

    pub(crate) const fn origin(&self) -> FileOrigin {
        match self.revision.0 {
            RevisionKind::Local(_) => FileOrigin::Local,
            RevisionKind::Bucket(_) => FileOrigin::Bucket,
        }
    }

    pub(crate) fn into_inner(self) -> R {
        self.reader
    }

    pub(crate) fn into_parts(self) -> (R, Revision) {
        (self.reader, self.revision)
    }
}

impl<R> AsyncRead for FileContents<R>
where
    R: AsyncRead,
{
    fn poll_read(
        self: pin::Pin<&mut Self>,
        cx: &mut task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> task::Poll<io::Result<()>> {
        self.project().reader.poll_read(cx, buf)
    }
}

impl<R> AsyncBufRead for FileContents<R>
where
    R: AsyncBufRead,
{
    fn poll_fill_buf(
        self: pin::Pin<&mut Self>,
        cx: &mut task::Context<'_>,
    ) -> task::Poll<io::Result<&[u8]>> {
        self.project().reader.poll_fill_buf(cx)
    }

    fn consume(self: pin::Pin<&mut Self>, amt: usize) {
        self.project().reader.consume(amt);
    }
}
