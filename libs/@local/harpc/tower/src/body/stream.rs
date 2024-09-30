use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::Buf;
use futures::Stream;

use super::{Body, BodyState, Frame};

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct StreamBody<S> {
        #[pin]
        stream: Option<S>,

    }
}

impl<S> StreamBody<S> {
    pub const fn new(stream: S) -> Self {
        Self {
            stream: Some(stream),
        }
    }
}

impl<S, D, C, E> Body for StreamBody<S>
where
    S: Stream<Item = Result<Frame<D, C>, E>>,
    D: Buf,
{
    type Control = C;
    type Data = D;
    type Error = E;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<super::BodyFrameResult<Self>>> {
        let mut this = self.project();

        let Some(stream) = this.stream.as_mut().as_pin_mut() else {
            return Poll::Ready(None);
        };

        let value = ready!(stream.poll_next(cx));

        if value.is_none() {
            this.stream.set(None);
        }

        Poll::Ready(value)
    }

    fn state(&self) -> Option<BodyState> {
        self.stream.is_none().then_some(BodyState::Complete)
    }
}

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct BodyStream<B> {
        #[pin]
        inner: B,
    }
}

impl<B> BodyStream<B> {
    pub const fn new(inner: B) -> Self {
        Self { inner }
    }

    pub fn into_data_stream(self) -> BodyDataStream<B> {
        BodyDataStream { inner: self.inner }
    }

    pub fn into_control_stream(self) -> BodyControlStream<B> {
        BodyControlStream { inner: self.inner }
    }
}

impl<B> Stream for BodyStream<B>
where
    B: Body,
{
    type Item = Result<Frame<B::Data, B::Control>, B::Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.project().inner.poll_frame(cx)
    }
}

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct BodyDataStream<B> {
        #[pin]
        inner: B,
    }
}

impl<B> Stream for BodyDataStream<B>
where
    B: Body,
{
    type Item = Result<B::Data, B::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        loop {
            return match ready!(self.as_mut().project().inner.poll_frame(cx)) {
                Some(Ok(frame)) => match frame.into_data() {
                    Ok(data) => Poll::Ready(Some(Ok(data))),
                    Err(_) => continue,
                },
                Some(Err(err)) => Poll::Ready(Some(Err(err))),
                None => Poll::Ready(None),
            };
        }
    }
}

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct BodyControlStream<B> {
        #[pin]
        inner: B,
    }
}

impl<B> Stream for BodyControlStream<B>
where
    B: Body,
{
    type Item = Result<B::Control, B::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        loop {
            return match ready!(self.as_mut().project().inner.poll_frame(cx)) {
                Some(Ok(frame)) => match frame.into_control() {
                    Ok(control) => Poll::Ready(Some(Ok(control))),
                    Err(_) => continue,
                },
                Some(Err(err)) => Poll::Ready(Some(Err(err))),
                None => Poll::Ready(None),
            };
        }
    }
}

#[cfg(test)]
mod test {
    use core::task::Poll;

    use bytes::Bytes;
    use futures::stream;

    use super::{BodyStream, StreamBody};
    use crate::body::{
        Body, BodyState, Frame,
        test::{poll_frame_unpin, poll_stream_unpin},
    };

    const VAL_A: &[u8] = b"hello";
    const VAL_B: &[u8] = b"world";
    const VAL_C: &[u8] = b"!";

    #[test]
    fn body_from_stream() {
        let stream = stream::iter([
            Ok(Frame::Data(Bytes::from_static(VAL_A))),
            Ok(Frame::Data(Bytes::from_static(VAL_B))),
            Ok(Frame::Data(Bytes::from_static(VAL_C))),
        ] as [Result<Frame<_, !>, !>; 3]);
        let mut body = StreamBody::new(stream);

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(
            frame,
            Poll::Ready(Some(Ok(Frame::Data(Bytes::from_static(VAL_A)))))
        );
        assert_eq!(body.state(), None);

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(
            frame,
            Poll::Ready(Some(Ok(Frame::Data(Bytes::from_static(VAL_B)))))
        );
        assert_eq!(body.state(), None);

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(
            frame,
            Poll::Ready(Some(Ok(Frame::Data(Bytes::from_static(VAL_C)))))
        );
        assert_eq!(body.state(), None);

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(frame, Poll::Ready(None));
        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[test]
    fn stream_from_body() {
        let stream = stream::iter([
            Ok(Frame::Data(Bytes::from_static(VAL_A))),
            Ok(Frame::Data(Bytes::from_static(VAL_B))),
            Ok(Frame::Data(Bytes::from_static(VAL_C))),
        ] as [Result<Frame<_, !>, !>; 3]);
        let body = StreamBody::new(stream);
        let mut stream = BodyStream::new(body);

        assert_eq!(
            poll_stream_unpin(&mut stream),
            Poll::Ready(Some(Ok(Frame::Data(Bytes::from_static(VAL_A)))))
        );

        assert_eq!(
            poll_stream_unpin(&mut stream),
            Poll::Ready(Some(Ok(Frame::Data(Bytes::from_static(VAL_B)))))
        );

        assert_eq!(
            poll_stream_unpin(&mut stream),
            Poll::Ready(Some(Ok(Frame::Data(Bytes::from_static(VAL_C)))))
        );

        assert_eq!(poll_stream_unpin(&mut stream), Poll::Ready(None));
    }
}
