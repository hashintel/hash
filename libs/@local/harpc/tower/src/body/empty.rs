use core::{
    fmt::Debug,
    marker::PhantomData,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

use super::{Body, BodyState, Frame, SizeHint};

pub struct Empty<B> {
    _marker: PhantomData<fn() -> B>,
}

impl<B> Empty<B> {
    #[must_use]
    pub fn new() -> Self {
        Self {
            _marker: PhantomData,
        }
    }
}

impl<B> Body for Empty<B>
where
    B: Buf,
{
    type Control = !;
    type Data = B;
    type Error = !;

    fn poll_frame(
        self: Pin<&mut Self>,
        _: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        Poll::Ready(None)
    }

    fn state(&self) -> Option<BodyState> {
        Some(BodyState::Complete)
    }

    fn size_hint(&self) -> SizeHint {
        SizeHint::with_exact(0)
    }
}

impl<B> Default for Empty<B> {
    fn default() -> Self {
        Self::new()
    }
}

impl<B> Debug for Empty<B> {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.debug_struct("Empty").finish()
    }
}

impl<B> Clone for Empty<B> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<B> Copy for Empty<B> {}
