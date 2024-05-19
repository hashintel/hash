use core::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use futures::{prelude::stream::FusedStream, Stream};
use tokio::sync::mpsc;

use crate::session::client::{ErrorStream, ValueStream};

pub struct ResponseStream {
    inner: mpsc::Receiver<Result<ValueStream, ErrorStream>>,

    terminated: bool,
}

impl ResponseStream {
    pub(crate) const fn new(inner: mpsc::Receiver<Result<ValueStream, ErrorStream>>) -> Self {
        Self {
            inner,
            terminated: false,
        }
    }
}

impl Stream for ResponseStream {
    type Item = Result<ValueStream, ErrorStream>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.terminated {
            return Poll::Ready(None);
        }

        let value = ready!(self.inner.poll_recv(cx));

        if value.is_none() {
            self.terminated = true;
        }

        Poll::Ready(value)
    }
}

impl FusedStream for ResponseStream {
    fn is_terminated(&self) -> bool {
        self.terminated
    }
}
