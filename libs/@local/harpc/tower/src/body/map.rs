use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::Buf;

use super::{Body, BodyState, Frame, SizeHint};

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct MapData<B, F> {
        #[pin]
        inner: B,
        map: F,
    }
}

impl<B, F> MapData<B, F> {
    pub const fn new(inner: B, map: F) -> Self {
        Self { inner, map }
    }
}

impl<B, F, T> Body for MapData<B, F>
where
    B: Body,
    F: FnMut(B::Data) -> T,
    T: Buf,
{
    type Control = B::Control;
    type Data = T;
    type Error = B::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        let this = self.project();

        let Some(result) = ready!(this.inner.poll_frame(cx)) else {
            return Poll::Ready(None);
        };

        let body = match result {
            Ok(frame) => frame.map_data(this.map),
            Err(err) => return Poll::Ready(Some(Err(err))),
        };

        Poll::Ready(Some(Ok(body)))
    }

    fn state(&self) -> Option<BodyState> {
        self.inner.state()
    }

    fn size_hint(&self) -> SizeHint {
        self.inner.size_hint()
    }
}

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct MapControl<B, F> {
        #[pin]
        inner: B,
        map: F,
    }
}

impl<B, F> MapControl<B, F> {
    pub const fn new(inner: B, map: F) -> Self {
        Self { inner, map }
    }
}

impl<B, F, T> Body for MapControl<B, F>
where
    B: Body,
    F: FnMut(B::Control) -> T,
    T: Buf,
{
    type Control = T;
    type Data = B::Data;
    type Error = B::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        let this = self.project();

        let Some(result) = ready!(this.inner.poll_frame(cx)) else {
            return Poll::Ready(None);
        };

        let body = match result {
            Ok(frame) => frame.map_control(this.map),
            Err(err) => return Poll::Ready(Some(Err(err))),
        };

        Poll::Ready(Some(Ok(body)))
    }

    fn state(&self) -> Option<BodyState> {
        self.inner.state()
    }

    fn size_hint(&self) -> SizeHint {
        self.inner.size_hint()
    }
}

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct MapError<B, F> {
        #[pin]
        inner: B,
        map: F,
    }
}

impl<B, F> MapError<B, F> {
    pub const fn new(body: B, map: F) -> Self {
        Self { inner: body, map }
    }
}

impl<B, F, E> Body for MapError<B, F>
where
    B: Body,
    F: FnMut(B::Error) -> E,
{
    type Control = B::Control;
    type Data = B::Data;
    type Error = E;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        let this = self.project();

        let Some(result) = ready!(this.inner.poll_frame(cx)) else {
            return Poll::Ready(None);
        };

        Poll::Ready(Some(result.map_err(this.map)))
    }

    fn state(&self) -> Option<BodyState> {
        self.inner.state()
    }

    fn size_hint(&self) -> SizeHint {
        self.inner.size_hint()
    }
}
