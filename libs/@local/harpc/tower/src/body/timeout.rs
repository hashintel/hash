use core::{
    pin::Pin,
    task::{Context, Poll},
    time::Duration,
};

use error_stack::Report;
use tokio::time::{Instant, Sleep};

use super::{Body, BodyState, Frame, SizeHint};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[non_exhaustive]
pub enum TimeoutError {
    #[error("the deadline of {timeout:?} between packets has been exceeded")]
    DeadlineExceeded { timeout: Duration },
    #[error("the underlying body has errored")]
    Other,
}

pin_project_lite::pin_project! {
    /// A body that limits the amount of time between packets.
    #[derive(Debug)]
    pub struct FrameTimeout<B> {
        timeout: Duration,
        timeout_exceeded: bool,

        #[pin]
        delay: Sleep,

        #[pin]
        inner: B,
    }
}

impl<B> FrameTimeout<B> {
    /// Create a new `Timeout` body.
    pub fn new(inner: B, timeout: Duration) -> Self {
        Self {
            timeout,
            timeout_exceeded: false,

            delay: tokio::time::sleep(timeout),
            inner,
        }
    }
}

impl<B, C> Body for FrameTimeout<B>
where
    B: Body<Error = Report<C>>,
{
    type Control = B::Control;
    type Data = B::Data;
    type Error = Report<TimeoutError>;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        let this = self.project();

        if *this.timeout_exceeded {
            return Poll::Ready(Some(Err(Report::new(TimeoutError::DeadlineExceeded {
                timeout: *this.timeout,
            }))));
        }

        // first try polling the future, this gives the future the chance to yield a value one last
        // time
        if let Poll::Ready(value) = this.inner.poll_frame(cx) {
            // reset the timer if we got a value
            this.delay.reset(Instant::now() + *this.timeout);

            return Poll::Ready(
                value.map(|value| value.map_err(|error| error.change_context(TimeoutError::Other))),
            );
        }

        // then try polling the timer
        if this.delay.poll(cx) == Poll::Ready(()) {
            // do not re-poll if we have already exceeded the deadline
            *this.timeout_exceeded = true;

            return Poll::Ready(Some(Err(Report::new(TimeoutError::DeadlineExceeded {
                timeout: *this.timeout,
            }))));
        }

        Poll::Pending
    }

    fn state(&self) -> Option<BodyState> {
        if self.timeout_exceeded {
            Some(BodyState::Incomplete)
        } else {
            self.inner.state()
        }
    }

    fn size_hint(&self) -> SizeHint {
        self.inner.size_hint()
    }
}

#[cfg(test)]
mod test {
    use core::{assert_matches, time::Duration};

    use bytes::Bytes;
    use error_stack::Report;
    use futures::{StreamExt as _, stream};
    use tokio::pin;
    use tokio_util::time::{DelayQueue, delay_queue::Expired};

    use super::FrameTimeout;
    use crate::body::{
        Body as _, BodyExt as _, BodyState, Frame, full::Full, stream::StreamBody,
        timeout::TimeoutError,
    };

    const HELLO: &[u8] = b"hello";
    const WORLD: &[u8] = b"world";

    #[tokio::test]
    async fn single_item() {
        let body = FrameTimeout::new(
            Full::new(Bytes::from_static(HELLO)).map_err::<_, Report<!>>(|error| match error {}),
            Duration::from_secs(1),
        );
        pin!(body);

        let value = body.frame().await;
        assert_matches!(
            value,
            Some(Ok(Frame::Data(data))) if data.as_ref() == HELLO
        );

        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[tokio::test]
    async fn single_item_immediate_resolve() {
        let body = FrameTimeout::new(
            Full::new(Bytes::from_static(HELLO)).map_err::<_, Report<!>>(|error| match error {}),
            Duration::from_millis(10),
        );
        pin!(body);

        tokio::time::sleep(Duration::from_millis(50)).await;

        // this works because we (just like tokio timeout) first give the item one last chance to
        // resolve as to not to create any race conditions.
        let value = body.frame().await;
        assert_matches!(value, Some(Ok(Frame::Data(data))) if data.as_ref() == HELLO);
        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[tokio::test]
    async fn single_itme_delayed() {
        let mut queue = DelayQueue::new();
        queue.insert(
            Result::<_, Report<!>>::Ok(Frame::<_, !>::Data(Bytes::from_static(HELLO))),
            Duration::from_millis(10),
        );

        let body = FrameTimeout::new(
            StreamBody::new(queue.map(Expired::into_inner)),
            Duration::from_millis(50),
        );
        pin!(body);

        let value = body.frame().await;
        assert_matches!(
            value,
            Some(Ok(Frame::Data(data))) if data.as_ref() == HELLO
        );

        let value = body.frame().await;
        assert_matches!(value, None);
        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[tokio::test]
    async fn single_item_timeout() {
        let mut queue = DelayQueue::new();
        queue.insert(
            Result::<_, Report<!>>::Ok(Frame::<_, !>::Data(Bytes::from_static(HELLO))),
            Duration::from_millis(50),
        );

        let body = FrameTimeout::new(
            StreamBody::new(queue.map(Expired::into_inner)),
            Duration::from_millis(10),
        );
        pin!(body);

        let value = body.frame().await;
        assert_matches!(value, Some(Err(error)) if *error.current_context() == TimeoutError::DeadlineExceeded {timeout: Duration::from_millis(10)});
        assert_eq!(body.state(), Some(BodyState::Incomplete));
    }

    #[tokio::test]
    async fn multiple_items() {
        let body = FrameTimeout::new(
            StreamBody::new(stream::iter(vec![
                Result::<_, Report<!>>::Ok(Frame::<_, !>::Data(Bytes::from_static(HELLO))),
                Ok(Frame::Data(Bytes::from_static(WORLD))),
            ])),
            Duration::from_secs(1),
        );

        pin!(body);

        let value = body.frame().await;
        assert_matches!(
            value,
            Some(Ok(Frame::Data(data))) if data.as_ref() == HELLO
        );

        let value = body.frame().await;
        assert_matches!(
            value,
            Some(Ok(Frame::Data(data))) if data.as_ref() == WORLD
        );

        let value = body.frame().await;
        assert_matches!(value, None);

        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[tokio::test]
    async fn multiple_items_delayed() {
        let mut queue = DelayQueue::new();
        queue.insert(
            Result::<_, Report<!>>::Ok(Frame::<_, !>::Data(Bytes::from_static(HELLO))),
            Duration::from_millis(10),
        );
        queue.insert(
            Ok(Frame::Data(Bytes::from_static(WORLD))),
            Duration::from_millis(20),
        );

        let body = FrameTimeout::new(
            StreamBody::new(queue.map(Expired::into_inner)),
            Duration::from_millis(50),
        );

        pin!(body);

        let value = body.frame().await;
        assert_matches!(
            value,
            Some(Ok(Frame::Data(data))) if data.as_ref() == HELLO
        );

        let value = body.frame().await;
        assert_matches!(
            value,
            Some(Ok(Frame::Data(data))) if data.as_ref() == WORLD
        );

        let value = body.frame().await;
        assert_matches!(value, None);

        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[tokio::test]
    async fn multiple_items_timeout() {
        let mut queue = DelayQueue::new();
        queue.insert(
            Result::<_, Report<!>>::Ok(Frame::<_, !>::Data(Bytes::from_static(HELLO))),
            Duration::from_millis(10),
        );
        queue.insert(
            Ok(Frame::Data(Bytes::from_static(WORLD))),
            Duration::from_millis(40),
        );

        let body = FrameTimeout::new(
            StreamBody::new(queue.map(Expired::into_inner)),
            Duration::from_millis(20),
        );

        pin!(body);

        let value = body.frame().await;
        assert_matches!(
            value,
            Some(Ok(Frame::Data(data))) if data.as_ref() == HELLO
        );

        let value = body.frame().await;
        assert_matches!(value, Some(Err(error)) if *error.current_context() == TimeoutError::DeadlineExceeded {timeout: Duration::from_millis(20)});

        assert_eq!(body.state(), Some(BodyState::Incomplete));
    }
}
