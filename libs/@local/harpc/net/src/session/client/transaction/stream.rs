use alloc::sync::Arc;
use core::sync::atomic::{AtomicU8, Ordering};

use bytes::Bytes;
use futures::{stream::FusedStream, Stream, StreamExt};
use harpc_wire_protocol::response::kind::ErrorCode;

use crate::stream::TerminatedChannelStream;

/// The state of a stream.
///
/// This is used to track (and report) on the state of the underlying stream
///
/// # Implementation Notes
///
/// Layout:
///
/// ```text
/// X X X X X X X A
///
/// * X: Unused
/// * A: EndOfResponse
/// ```
#[derive(Debug, Clone)]
pub struct StreamState(Arc<AtomicU8>);

impl StreamState {
    const END_OF_RESPONSE_BITMASK: u8 = 0b0000_0001;

    pub(crate) fn new() -> Self {
        Self(Arc::new(AtomicU8::new(0)))
    }

    fn load(&self) -> u8 {
        self.0.load(Ordering::SeqCst)
    }

    fn fetch_or(&self, value: u8) -> u8 {
        self.0.fetch_or(value, Ordering::SeqCst)
    }

    pub fn is_end_of_response(&self) -> bool {
        self.load() & Self::END_OF_RESPONSE_BITMASK != 0
    }

    pub(crate) fn set_end_of_response(&self) {
        self.fetch_or(Self::END_OF_RESPONSE_BITMASK);
    }
}

#[derive(Debug)]
pub struct ErrorStream {
    pub(crate) code: ErrorCode,

    pub(crate) inner: TerminatedChannelStream<Bytes>,

    pub(crate) state: StreamState,
}

impl ErrorStream {
    #[must_use]
    pub const fn code(&self) -> ErrorCode {
        self.code
    }

    /// Returns the state of the stream.
    ///
    /// This is used to track (and report) on the state of the underlying stream.
    ///
    /// Only available after the stream has been terminated.
    #[must_use]
    pub fn state(&self) -> Option<&StreamState> {
        if !self.inner.is_terminated() {
            return None;
        }

        Some(&self.state)
    }
}

impl Stream for ErrorStream {
    type Item = Bytes;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        self.inner.poll_next_unpin(cx)
    }
}

impl FusedStream for ErrorStream {
    fn is_terminated(&self) -> bool {
        self.inner.is_terminated()
    }
}

#[derive(Debug)]
pub struct ValueStream {
    pub(crate) inner: TerminatedChannelStream<Bytes>,

    pub(crate) state: StreamState,
}

impl ValueStream {
    /// Returns the state of the stream.
    ///
    /// This is used to track (and report) on the state of the underlying stream.
    ///
    /// Only available after the stream has been terminated.
    #[must_use]
    pub fn state(&self) -> Option<&StreamState> {
        if !self.inner.is_terminated() {
            return None;
        }

        Some(&self.state)
    }
}

impl Stream for ValueStream {
    type Item = Bytes;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        self.inner.poll_next_unpin(cx)
    }
}

impl FusedStream for ValueStream {
    fn is_terminated(&self) -> bool {
        self.inner.is_terminated()
    }
}
