use core::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use bytes::Buf;

use super::Body;

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct MapBody<B, F> {
        #[pin]
        inner: B,
        map: F,
    }
}

impl<B, F> MapBody<B, F> {
    pub fn new(body: B, map: F) -> Self {
        Self { inner: body, map }
    }
}

impl<B, F, T> Body for MapBody<B, F>
where
    B: Body,
    F: FnMut(B::Data) -> T,
    T: Buf,
{
    type Data = T;
    type Error = B::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Self::Data, Self::Error>>> {
        let this = self.project();

        match ready!(this.inner.poll_frame(cx)) {
            Some(Ok(data)) => Poll::Ready(Some(Ok((this.map)(data)))),
            Some(Err(err)) => Poll::Ready(Some(Err(err))),
            None => Poll::Ready(None),
        }
    }

    fn is_complete(&self) -> Option<bool> {
        self.inner.is_complete()
    }
}
