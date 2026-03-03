use alloc::sync::Arc;
use core::sync::atomic::{AtomicU8, Ordering};

use bytes::Bytes;
use futures::{Stream, StreamExt as _, stream::FusedStream};
use harpc_types::error_code::ErrorCode;

use crate::stream::TerminatedChannelStream;

pub trait TransactionStream {
    /// Returns the state of the stream.
    ///
    /// This is used to track (and report) on the state of the underlying stream.
    ///
    /// Only available after the stream has been terminated.
    #[must_use]
    fn state(&self) -> Option<&StreamState>;
}

/// The state of a stream.
///
/// This is used to track (and report) on the state of the underlying stream.
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
    code: ErrorCode,
    inner: TerminatedChannelStream<Bytes>,

    state: StreamState,
}

impl ErrorStream {
    #[must_use]
    pub(crate) const fn new(
        code: ErrorCode,
        inner: TerminatedChannelStream<Bytes>,
        state: StreamState,
    ) -> Self {
        Self { code, inner, state }
    }

    #[must_use]
    pub const fn code(&self) -> ErrorCode {
        self.code
    }
}

impl TransactionStream for ErrorStream {
    fn state(&self) -> Option<&StreamState> {
        if !self.inner.is_terminated() {
            return None;
        }

        Some(&self.state)
    }
}

impl Stream for ErrorStream {
    type Item = Bytes;

    fn poll_next(
        mut self: core::pin::Pin<&mut Self>,
        cx: &mut core::task::Context<'_>,
    ) -> core::task::Poll<Option<Self::Item>> {
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
    inner: TerminatedChannelStream<Bytes>,

    state: StreamState,
}

impl ValueStream {
    #[must_use]
    pub(crate) const fn new(inner: TerminatedChannelStream<Bytes>, state: StreamState) -> Self {
        Self { inner, state }
    }
}

impl TransactionStream for ValueStream {
    fn state(&self) -> Option<&StreamState> {
        if !self.inner.is_terminated() {
            return None;
        }

        Some(&self.state)
    }
}

impl Stream for ValueStream {
    type Item = Bytes;

    fn poll_next(
        mut self: core::pin::Pin<&mut Self>,
        cx: &mut core::task::Context<'_>,
    ) -> core::task::Poll<Option<Self::Item>> {
        self.inner.poll_next_unpin(cx)
    }
}

impl FusedStream for ValueStream {
    fn is_terminated(&self) -> bool {
        self.inner.is_terminated()
    }
}
