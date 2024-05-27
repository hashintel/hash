use core::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use bytes::Buf;
use error_stack::Report;

use super::Body;

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
    #[derive(Debug)]
    pub struct Limited<B> {
        limit: usize,
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
            remaining: limit,
            inner,
        }
    }
}

impl<B, C> Body for Limited<B>
where
    B: Body<Error = Report<C>>,
{
    type Data = B::Data;
    type Error = Report<LimitedError>;

    fn poll_data(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Self::Data, Self::Error>>> {
        let this = self.project();

        let body = match ready!(this.inner.poll_data(cx)) {
            None => None,
            Some(Ok(buffer)) => {
                if buffer.remaining() > *this.remaining {
                    *this.remaining = 0;

                    Some(Err(Report::new(LimitedError::LimitReached {
                        limit: *this.limit,
                    })))
                } else {
                    *this.remaining -= buffer.remaining();
                    Some(Ok(buffer))
                }
            }
            Some(Err(error)) => Some(Err(error.change_context(LimitedError::Other))),
        };

        Poll::Ready(body)
    }

    fn is_end_stream(&self) -> bool {
        self.inner.is_end_stream()
    }
}
