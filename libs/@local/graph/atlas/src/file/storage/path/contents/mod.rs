//! The value a file open returns: a reader, and the revision a conditional replacement checks.

use core::{pin, task};
use std::io;

use tokio::io::{AsyncBufRead, AsyncRead};

use crate::file::storage::Revision;

#[cfg(test)]
mod tests;

pin_project_lite::pin_project! {
    /// An opened reader and the revision identifying the contents it reads.
    ///
    /// The revision belongs to the contents observed at open time. [`AsyncRead`] and [`AsyncBufRead`] both use the opened reader and share one position.
    pub(crate) struct FileContents<R> {
        #[pin]
        pub reader: R,
        revision: Revision,
    }
}

impl<R> FileContents<R> {
    /// Pairs an opened reader with the revision of the contents it reads.
    pub(super) const fn new(reader: R, revision: Revision) -> Self {
        Self { reader, revision }
    }

    /// Separates the reader from the revision.
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
