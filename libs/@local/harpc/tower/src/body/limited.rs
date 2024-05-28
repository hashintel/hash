use core::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use bytes::Buf;
use error_stack::Report;

use super::{Body, Frame, SizeHint};

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

    fn is_complete(&self) -> Option<bool> {
        if self.limit_exceeded {
            Some(false)
        } else {
            self.inner.is_complete()
        }
    }

    fn size_hint(&self) -> SizeHint {
        match u64::try_from(self.remaining) {
            Ok(n) => {
                let mut hint = self.inner.size_hint();
                if hint.lower() >= n {
                    hint.set_exact(n)
                } else if let Some(max) = hint.upper() {
                    hint.set_upper(n.min(max))
                } else {
                    hint.set_upper(n)
                }
                hint
            }
            Err(_) => self.inner.size_hint(),
        }
    }
}
