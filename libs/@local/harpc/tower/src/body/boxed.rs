use core::{
    fmt::{self, Debug, Formatter},
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

use super::{Body, BodyState, Frame, empty::Empty};

/// Boxed Body.
///
/// This is a wrapper around a `Body` that erases the type of the body using a trait object.
///
/// This is a helper struct that can be used instead of using trait objects directly, to keep the
/// type signature of functions and methods more readable.
///
/// # Implementation Note
///
/// This isn't a type alias to enable future changes to the underlying type without breaking
/// compatibility.
pub struct BoxBody<D, C, E> {
    inner: Pin<Box<dyn Body<Data = D, Control = C, Error = E> + Send + Sync + 'static>>,
}

impl<D, C, E> BoxBody<D, C, E> {
    pub fn new<B>(body: B) -> Self
    where
        B: Body<Data = D, Control = C, Error = E> + Send + Sync + 'static,
        D: Buf,
    {
        Self {
            inner: Box::pin(body),
        }
    }
}

impl<D, C, E> Debug for BoxBody<D, C, E> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("BoxBody").finish_non_exhaustive()
    }
}

impl<D, C, E> Body for BoxBody<D, C, E>
where
    D: Buf,
{
    type Control = C;
    type Data = D;
    type Error = E;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        self.inner.as_mut().poll_frame(cx)
    }

    fn state(&self) -> Option<BodyState> {
        self.inner.state()
    }

    fn size_hint(&self) -> super::SizeHint {
        self.inner.size_hint()
    }
}

impl<D> Default for BoxBody<D, !, !>
where
    D: Buf + 'static,
{
    fn default() -> Self {
        Self::new(Empty::new())
    }
}

/// Boxed Body that is not Sync.
///
/// This is a wrapper around a `Body` that erases the type of the body using a trait object.
///
/// This is a helper struct that can be used instead of using trait objects directly, to keep the
/// type signature of functions and methods more readable.
///
/// This is useful when the body is not Sync, and `BoxBody` cannot be used.
///
/// # Implementation Note
///
/// This isn't a type alias to enable future changes to the underlying type without breaking
/// compatibility.
pub struct UnsyncBoxBody<D, C, E> {
    inner: Pin<Box<dyn Body<Data = D, Control = C, Error = E> + Send + 'static>>,
}

impl<D, C, E> UnsyncBoxBody<D, C, E> {
    pub fn new<B>(body: B) -> Self
    where
        B: Body<Data = D, Control = C, Error = E> + Send + 'static,
        D: Buf,
    {
        Self {
            inner: Box::pin(body),
        }
    }
}

impl<D, C, E> Debug for UnsyncBoxBody<D, C, E> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("UnsyncBoxBody").finish_non_exhaustive()
    }
}

impl<D, C, E> Body for UnsyncBoxBody<D, C, E>
where
    D: Buf,
{
    type Control = C;
    type Data = D;
    type Error = E;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        self.inner.as_mut().poll_frame(cx)
    }

    fn state(&self) -> Option<BodyState> {
        self.inner.state()
    }

    fn size_hint(&self) -> super::SizeHint {
        self.inner.size_hint()
    }
}

impl<D> Default for UnsyncBoxBody<D, !, !>
where
    D: Buf + 'static,
{
    fn default() -> Self {
        Self::new(Empty::new())
    }
}
