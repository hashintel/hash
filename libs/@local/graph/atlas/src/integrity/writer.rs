//! Stream adapters for byte accumulators.

use core::{pin, task};
use std::io;

use futures_sink::Sink;
use pin_project_lite::pin_project;

/// A byte accumulator that absorbs a stream of bytes into running state.
///
/// [`Sha256`](super::Sha256) implements this. The concatenated byte stream alone determines the
/// absorbed value: feeding one large slice and feeding the same bytes across many calls are
/// equivalent.
pub(crate) trait Update {
    /// Absorbs `bytes` into the accumulator.
    fn update(&mut self, bytes: &[u8]);
}

pin_project! {
    /// A stream terminal that feeds every byte into an [`Update`] accumulator.
    ///
    /// [`Writer`] lets an accumulator terminate whichever pipeline produces the bytes, without
    /// buffering the content in memory:
    ///
    /// - [`io::Write`] for synchronous streams,
    /// - [`tokio::io::AsyncWrite`] for asynchronous streams,
    /// - [`Sink`](futures_sink::Sink) for framed byte chunks.
    ///
    /// Writes always succeed in full, and flush, shutdown, and close are no-ops. The accumulator is
    /// the public field, so the finished value is one field access away.
    ///
    /// # Examples
    ///
    /// Digesting a file during a copy:
    ///
    /// ```ignore
    /// # fn main() -> Result<(), Box<dyn core::error::Error>> {
    /// use crate::integrity::{Sha256, Writer};
    ///
    /// let mut file = std::fs::File::open("layout-a100.f32")?;
    /// let mut writer = Writer {
    ///     accumulator: Sha256::new(),
    ///     writer: std::io::sink(),
    /// };
    /// std::io::copy(&mut file, &mut writer)?;
    /// let digest = writer.accumulator.finalize();
    /// # Ok(())
    /// # }
    /// ```
    #[derive(Debug, Copy, Clone, Default)]
    pub struct Writer<T, W> {
        pub accumulator: T,
        #[pin]
        pub writer: W,
    }
}

impl<T, W> io::Write for Writer<T, W>
where
    T: Update,
    W: io::Write,
{
    #[inline]
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.accumulator.update(buf);
        self.writer.write(buf)
    }

    #[inline]
    fn flush(&mut self) -> io::Result<()> {
        self.writer.flush()
    }
}

impl<T, W> tokio::io::AsyncWrite for Writer<T, W>
where
    T: Update,
    W: tokio::io::AsyncWrite,
{
    fn poll_write(
        self: pin::Pin<&mut Self>,
        cx: &mut task::Context<'_>,
        buf: &[u8],
    ) -> task::Poll<io::Result<usize>> {
        let this = self.project();

        this.accumulator.update(buf);
        this.writer.poll_write(cx, buf)
    }

    fn poll_flush(
        self: pin::Pin<&mut Self>,
        cx: &mut task::Context<'_>,
    ) -> task::Poll<io::Result<()>> {
        let this = self.project();
        this.writer.poll_flush(cx)
    }

    fn poll_shutdown(
        self: pin::Pin<&mut Self>,
        cx: &mut task::Context<'_>,
    ) -> task::Poll<io::Result<()>> {
        let this = self.project();
        this.writer.poll_shutdown(cx)
    }
}

impl<T, W, Item> Sink<Item> for Writer<T, W>
where
    T: Update,
    W: Sink<Item>,
    Item: AsRef<[u8]>,
{
    type Error = W::Error;

    fn poll_ready(
        self: pin::Pin<&mut Self>,
        cx: &mut task::Context<'_>,
    ) -> task::Poll<Result<(), Self::Error>> {
        let this = self.project();
        this.writer.poll_ready(cx)
    }

    fn start_send(self: pin::Pin<&mut Self>, item: Item) -> Result<(), Self::Error> {
        let this = self.project();
        this.accumulator.update(item.as_ref());
        this.writer.start_send(item)
    }

    fn poll_flush(
        self: pin::Pin<&mut Self>,
        cx: &mut task::Context<'_>,
    ) -> task::Poll<Result<(), Self::Error>> {
        let this = self.project();
        this.writer.poll_flush(cx)
    }

    fn poll_close(
        self: pin::Pin<&mut Self>,
        cx: &mut task::Context<'_>,
    ) -> task::Poll<Result<(), Self::Error>> {
        let this = self.project();
        this.writer.poll_close(cx)
    }
}

#[cfg(test)]
mod tests {
    use core::pin::Pin;
    use std::io::Write as _;

    use futures_sink::Sink as _;

    use super::{Update, Writer};

    /// Records the absorbed stream for adapter assertions.
    #[derive(Default)]
    struct Recorder(Vec<u8>);

    impl Update for Recorder {
        fn update(&mut self, bytes: &[u8]) {
            self.0.extend_from_slice(bytes);
        }
    }

    #[test]
    fn io_write_absorbs_everything() {
        let mut writer = Writer {
            accumulator: Recorder::default(),
            writer: std::io::sink(),
        };

        writer
            .write_all(b"ab")
            .and_then(|()| writer.write_all(b"c"))
            .and_then(|()| writer.flush())
            .expect("should absorb writes without failing");
        assert_eq!(writer.accumulator.0, b"abc");
    }

    #[tokio::test]
    async fn async_write_absorbs_everything() {
        let mut writer = Writer {
            accumulator: Recorder::default(),
            writer: tokio::io::sink(),
        };

        tokio::io::AsyncWriteExt::write_all(&mut writer, b"abc")
            .await
            .expect("should absorb writes without failing");
        assert_eq!(writer.accumulator.0, b"abc");
    }

    #[test]
    fn sink_absorbs_every_chunk() {
        let mut writer = Writer {
            accumulator: Recorder::default(),
            writer: futures::sink::drain::<&'static [u8]>(),
        };
        let Ok(()) = Pin::new(&mut writer).start_send(b"ab");
        let Ok(()) = Pin::new(&mut writer).start_send(b"c");
        assert_eq!(writer.accumulator.0, b"abc");
    }
}
