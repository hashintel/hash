use core::{
    marker::PhantomData,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

use super::{Body, Frame, SizeHint};

pub struct Empty<B> {
    _marker: PhantomData<B>,
}

impl<B> Empty<B> {
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

    fn is_complete(&self) -> Option<bool> {
        Some(true)
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
