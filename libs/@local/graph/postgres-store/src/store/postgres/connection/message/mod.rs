#[cfg(test)]
mod tests;

use core::{
    pin::Pin,
    task::{Context, Poll},
};

use futures::{Stream, stream::FusedStream};

/// Drops the message source after its first error or end-of-stream.
///
/// Both outcomes are terminal for [`tokio_postgres::Connection::poll_message`].
pub(super) struct MessageStream<S> {
    source: Option<S>,
}

impl<S> MessageStream<S> {
    pub(super) const fn new(source: S) -> Self {
        Self {
            source: Some(source),
        }
    }
}

impl<S, Message, Error> Stream for MessageStream<S>
where
    S: Stream<Item = Result<Message, Error>> + Unpin,
{
    type Item = Result<Message, Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        let Some(source) = this.source.as_mut() else {
            return Poll::Ready(None);
        };

        let message = Pin::new(source).poll_next(cx);
        if matches!(message, Poll::Ready(None | Some(Err(_)))) {
            this.source = None;
        }
        message
    }
}

impl<S, Message, Error> FusedStream for MessageStream<S>
where
    S: Stream<Item = Result<Message, Error>> + Unpin,
{
    fn is_terminated(&self) -> bool {
        self.source.is_none()
    }
}
