use core::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

use super::{Body, BodyState, Frame, SizeHint};

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct Full<D> {
        data: Option<D>,
    }
}

impl<D> Full<D>
where
    D: Buf,
{
    pub fn new(body: D) -> Self {
        if body.has_remaining() {
            Self { data: Some(body) }
        } else {
            Self { data: None }
        }
    }
}

impl<D> Body for Full<D>
where
    D: Buf,
{
    type Control = !;
    type Data = D;
    type Error = !;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        _: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        Poll::Ready(self.data.take().map(Frame::new_data).map(Ok))
    }

    fn state(&self) -> Option<BodyState> {
        if self.data.is_some() {
            None
        } else {
            Some(BodyState::Complete)
        }
    }

    fn size_hint(&self) -> SizeHint {
        self.data.as_ref().map_or_else(
            || SizeHint::with_exact(0),
            |data| SizeHint::with_exact(data.remaining() as u64),
        )
    }
}

#[cfg(test)]
mod test {
    use core::task::Poll;

    use bytes::Bytes;

    use crate::body::{full::Full, test::poll_frame_unpin, Body, BodyState, Frame, SizeHint};

    #[test]
    fn poll_frame() {
        let bytes = Bytes::from("hello");

        let mut body = Full::new(bytes.clone());

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(frame, Poll::Ready(Some(Ok(Frame::Data(bytes)))));

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(frame, Poll::Ready(None));

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(frame, Poll::Ready(None));
    }

    #[test]
    fn poll_frame_empty_returns_none() {
        let bytes = Bytes::new();

        let mut body = Full::new(bytes);

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(frame, Poll::Ready(None));
    }

    #[test]
    fn is_complete() {
        let bytes = Bytes::from("hello");

        let mut body = Full::new(bytes.clone());
        assert_eq!(body.state(), None);

        assert_eq!(
            poll_frame_unpin(&mut body),
            Poll::Ready(Some(Ok(Frame::Data(bytes))))
        );
        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[test]
    fn size_hint() {
        let bytes = Bytes::from("hello");

        let mut body = Full::new(bytes.clone());
        assert_eq!(body.size_hint(), SizeHint::with_exact(5));

        assert_eq!(
            poll_frame_unpin(&mut body),
            Poll::Ready(Some(Ok(Frame::Data(bytes))))
        );
        assert_eq!(body.size_hint(), SizeHint::with_exact(0));
    }
}
