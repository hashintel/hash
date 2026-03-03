use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::Buf as _;
use error_stack::Report;

use super::{Body, BodyState, Frame, SizeHint};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[non_exhaustive]
pub enum LimitedError {
    #[error("the length limit of {limit} has been reached")]
    LimitReached { limit: usize },
    #[error("the underlying body has errored")]
    Other,
}

pin_project_lite::pin_project! {
    /// A body that limits the amount of data that can be read.
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct Limited<B> {
        limit: usize,
        limit_exceeded: bool,
        remaining: usize,

        #[pin]
        inner: B,
    }
}

impl<B> Limited<B> {
    /// Create a new `Limited` body.
    pub const fn new(inner: B, limit: usize) -> Self {
        Self {
            limit,
            limit_exceeded: false,

            remaining: limit,
            inner,
        }
    }
}

impl<B, C> Body for Limited<B>
where
    B: Body<Error = Report<C>>,
{
    type Control = B::Control;
    type Data = B::Data;
    type Error = Report<LimitedError>;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        let this = self.project();

        let Some(result) = ready!(this.inner.poll_frame(cx)) else {
            return Poll::Ready(None);
        };

        let data = match result {
            Ok(frame) => match frame.into_data() {
                Ok(data) => data,
                Err(frame) => return Poll::Ready(Some(Ok(frame))),
            },
            Err(error) => return Poll::Ready(Some(Err(error.change_context(LimitedError::Other)))),
        };

        let body = if data.remaining() > *this.remaining {
            *this.remaining = 0;
            *this.limit_exceeded = true;

            Err(Report::new(LimitedError::LimitReached {
                limit: *this.limit,
            }))
        } else {
            *this.remaining -= data.remaining();

            Ok(Frame::new_data(data))
        };

        Poll::Ready(Some(body))
    }

    fn state(&self) -> Option<BodyState> {
        if self.limit_exceeded {
            Some(BodyState::Incomplete)
        } else {
            self.inner.state()
        }
    }

    fn size_hint(&self) -> SizeHint {
        u64::try_from(self.remaining).map_or_else(
            |_| self.inner.size_hint(),
            |n| {
                let mut hint = self.inner.size_hint();
                if hint.lower() >= n {
                    hint.set_exact(n);
                } else if let Some(max) = hint.upper() {
                    hint.set_upper(n.min(max));
                } else {
                    hint.set_upper(n);
                }
                hint
            },
        )
    }
}

#[cfg(test)]
mod test {

    use core::{assert_matches, task::Poll};

    use bytes::Bytes;
    use error_stack::Report;
    use futures::stream;

    use super::Limited;
    use crate::body::{
        Body, BodyExt as _, BodyState, Frame, SizeHint, full::Full, limited::LimitedError,
        stream::StreamBody, test::poll_frame_unpin,
    };

    const EXPECTED: &[u8] = b"hello, world";

    #[test]
    fn poll_under_limit() {
        let bytes = Bytes::from_static(EXPECTED);

        let full = Full::new(bytes).map_err::<_, Report<!>>(|error| match error {});
        let mut body = Limited::new(full, 15);

        assert_eq!(
            body.size_hint(),
            SizeHint::with_exact(EXPECTED.len() as u64)
        );

        let frame = poll_frame_unpin(&mut body);
        assert_matches!(frame, Poll::Ready(Some(Ok(Frame::Data(data)))) if data.as_ref() == EXPECTED);

        assert_eq!(body.size_hint(), SizeHint::with_exact(0));
    }

    #[test]
    fn poll_over_limit() {
        let bytes = Bytes::from_static(EXPECTED);

        let full = Full::new(bytes).map_err::<_, Report<!>>(|error| match error {});
        let mut body = Limited::new(full, 5);

        // we set the upper limit to 5, and therefore also the lower limit!
        assert_eq!(body.size_hint(), SizeHint::with_exact(5));

        let frame = poll_frame_unpin(&mut body);
        assert_matches!(frame, Poll::Ready(Some(Err(error))) if *error.current_context() == LimitedError::LimitReached { limit: 5 });

        assert_eq!(body.state(), Some(BodyState::Incomplete));
    }

    fn iter_body<I>(iter: I) -> impl Body<Data = Bytes, Control = !, Error = Report<!>>
    where
        I: IntoIterator<Item: Into<Bytes>>,
    {
        StreamBody::new(stream::iter(
            iter.into_iter().map(Into::into).map(Frame::Data).map(Ok),
        ))
    }

    #[test]
    fn poll_over_limit_second_chunk() {
        let mut body = Limited::new(iter_body([b"hello" as &[_], b", world"]), 5);

        assert_eq!(body.size_hint().upper(), Some(5));

        let frame = poll_frame_unpin(&mut body);
        assert_matches!(frame, Poll::Ready(Some(Ok(Frame::Data(data)))) if data.as_ref() == b"hello");

        assert_eq!(body.size_hint().upper(), Some(0));

        let frame = poll_frame_unpin(&mut body);
        assert_matches!(frame, Poll::Ready(Some(Err(err))) if *err.current_context() == LimitedError::LimitReached { limit: 5 });

        assert_eq!(body.size_hint().upper(), Some(0));
        assert_eq!(body.state(), Some(BodyState::Incomplete));
    }

    #[test]
    fn poll_over_limit_first_chunk() {
        let mut body = Limited::new(iter_body([b"hello" as &[_], b", world"]), 1);
        assert_eq!(body.size_hint().upper(), Some(1));

        let frame = poll_frame_unpin(&mut body);
        assert_matches!(frame, Poll::Ready(Some(Err(err))) if *err.current_context() == LimitedError::LimitReached { limit: 1 });

        assert_eq!(body.size_hint().upper(), Some(0));
        assert_eq!(body.state(), Some(BodyState::Incomplete));

        // second poll should continue to return error
        let frame = poll_frame_unpin(&mut body);
        assert_matches!(frame, Poll::Ready(Some(Err(err))) if *err.current_context() == LimitedError::LimitReached { limit: 1 });

        assert_eq!(body.size_hint().upper(), Some(0));
        assert_eq!(body.state(), Some(BodyState::Incomplete));
    }

    #[test]
    fn poll_chunked_body_okay() {
        let mut body = Limited::new(iter_body([b"hello" as &[_], b", world"]), 100);
        assert_eq!(body.size_hint().upper(), Some(100));

        let frame = poll_frame_unpin(&mut body);
        assert_matches!(frame, Poll::Ready(Some(Ok(Frame::Data(data)))) if data.as_ref() == b"hello");

        assert_eq!(body.size_hint().upper(), Some(100 - 5));

        let frame = poll_frame_unpin(&mut body);
        assert_matches!(frame, Poll::Ready(Some(Ok(Frame::Data(data)))) if data.as_ref() == b", world");

        assert_eq!(body.size_hint().upper(), Some(100 - 5 - 7));
        assert_eq!(body.state(), None);

        let frame = poll_frame_unpin(&mut body);
        assert_matches!(frame, Poll::Ready(None));

        assert_eq!(body.size_hint().upper(), Some(100 - 5 - 7));
        assert_eq!(body.state(), Some(BodyState::Complete));
    }
}
