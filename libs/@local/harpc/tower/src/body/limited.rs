use core::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use bytes::Buf;
use error_stack::Report;

use super::{Body, SizeHint};

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
    type Data = B::Data;
    type Error = Report<LimitedError>;

    fn poll_data(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Self::Data, Self::Error>>> {
        let this = self.project();

        let body = match ready!(this.inner.poll_data(cx)) {
            None => None,
            Some(Ok(data)) => {
                if data.remaining() > *this.remaining {
                    *this.remaining = 0;
                    *this.limit_exceeded = true;

                    Some(Err(Report::new(LimitedError::LimitReached {
                        limit: *this.limit,
                    })))
                } else {
                    *this.remaining -= data.remaining();

                    Some(Ok(data))
                }
            }
            Some(Err(error)) => Some(Err(error.change_context(LimitedError::Other))),
        };

        Poll::Ready(body)
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
