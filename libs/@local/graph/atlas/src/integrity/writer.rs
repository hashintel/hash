//! Stream adapters for byte accumulators.

use core::{pin, task};
use std::io;

use futures_sink::Sink;

/// A byte accumulator: state that absorbs a stream of bytes.
///
/// Both integrity accumulators ([`Sha256`](super::Sha256) and
/// [`Crc64`](super::Crc64)) implement this. The absorbed value is determined
/// by the concatenated byte stream alone: feeding one large slice and
/// feeding the same bytes across many calls are equivalent.
pub trait Update {
    /// Absorbs `bytes` into the accumulator.
    fn update(&mut self, bytes: &[u8]);
}

/// A stream terminal that feeds every byte into an [`Update`] accumulator.
///
/// [`Writer`] lets an accumulator terminate whichever pipeline produces the
/// bytes, without buffering the content in memory:
///
/// - [`io::Write`] for synchronous streams,
/// - [`tokio::io::AsyncWrite`] for asynchronous streams,
/// - [`Sink`](futures_sink::Sink) for framed byte chunks.
///
/// Writes always succeed in full, and flush, shutdown, and close are no-ops.
/// The accumulator is the public field, so the finished value is one field
/// access away.
///
/// # Examples
///
/// Digesting a file during a copy:
///
/// ```rust,no_run
/// # fn main() -> Result<(), Box<dyn core::error::Error>> {
/// use hash_graph_atlas::integrity::{Sha256, Writer};
///
/// let mut file = std::fs::File::open("layout-a100.f32")?;
/// let mut writer = Writer(Sha256::new());
/// std::io::copy(&mut file, &mut writer)?;
/// let digest = writer.0.finalize();
/// # Ok(())
/// # }
/// ```
#[derive(Debug, Copy, Clone, Default)]
pub struct Writer<T>(pub T);

impl<T> io::Write for Writer<T>
where
    T: Update,
{
    #[inline]
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0.update(buf);
        Ok(buf.len())
    }

    #[inline]
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl<T> tokio::io::AsyncWrite for Writer<T>
where
    T: Update + Unpin,
{
    fn poll_write(
        self: pin::Pin<&mut Self>,
        _: &mut task::Context<'_>,
        buf: &[u8],
    ) -> task::Poll<io::Result<usize>> {
        self.get_mut().0.update(buf);
        task::Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(
        self: pin::Pin<&mut Self>,
        _: &mut task::Context<'_>,
    ) -> task::Poll<io::Result<()>> {
        task::Poll::Ready(Ok(()))
    }

    fn poll_shutdown(
        self: pin::Pin<&mut Self>,
        _: &mut task::Context<'_>,
    ) -> task::Poll<io::Result<()>> {
        task::Poll::Ready(Ok(()))
    }
}

impl<T, Item> Sink<Item> for Writer<T>
where
    T: Update + Unpin,
    Item: AsRef<[u8]>,
{
    type Error = !;

    fn poll_ready(
        self: pin::Pin<&mut Self>,
        _: &mut task::Context<'_>,
    ) -> task::Poll<Result<(), Self::Error>> {
        task::Poll::Ready(Ok(()))
    }

    fn start_send(self: pin::Pin<&mut Self>, item: Item) -> Result<(), Self::Error> {
        self.get_mut().0.update(item.as_ref());
        Ok(())
    }

    fn poll_flush(
        self: pin::Pin<&mut Self>,
        _: &mut task::Context<'_>,
    ) -> task::Poll<Result<(), Self::Error>> {
        task::Poll::Ready(Ok(()))
    }

    fn poll_close(
        self: pin::Pin<&mut Self>,
        _: &mut task::Context<'_>,
    ) -> task::Poll<Result<(), Self::Error>> {
        task::Poll::Ready(Ok(()))
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
        let mut writer = Writer(Recorder::default());
        writer
            .write_all(b"ab")
            .and_then(|()| writer.write_all(b"c"))
            .and_then(|()| writer.flush())
            .expect("should absorb writes without failing");
        assert_eq!(writer.0.0, b"abc");
    }

    #[tokio::test]
    async fn async_write_absorbs_everything() {
        let mut writer = Writer(Recorder::default());
        tokio::io::AsyncWriteExt::write_all(&mut writer, b"abc")
            .await
            .expect("should absorb writes without failing");
        assert_eq!(writer.0.0, b"abc");
    }

    #[test]
    fn sink_absorbs_every_chunk() {
        let mut writer = Writer(Recorder::default());
        let Ok(()) = Pin::new(&mut writer).start_send(b"ab");
        let Ok(()) = Pin::new(&mut writer).start_send(b"c");
        assert_eq!(writer.0.0, b"abc");
    }
}
