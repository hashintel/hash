use core::{
    pin::Pin,
    task::{Context, Poll},
    time::Duration,
};

use error_stack::Report;
use tokio::time::{Instant, Sleep};

use super::Body;

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
    pub struct Timeout<B> {
        timeout: Duration,
        timeout_exceeded: bool,

        #[pin]
        delay: Sleep,

        #[pin]
        inner: B,
    }
}

impl<B> Timeout<B> {
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

impl<B, C> Body for Timeout<B>
where
    B: Body<Error = Report<C>>,
{
    type Data = B::Data;
    type Error = Report<TimeoutError>;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Self::Data, Self::Error>>> {
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

    fn is_complete(&self) -> Option<bool> {
        if self.timeout_exceeded {
            Some(false)
        } else {
            self.inner.is_complete()
        }
    }
}
