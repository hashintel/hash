use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use futures::{Stream, prelude::stream::StreamExt as _, stream::FusedStream};

#[derive(Debug)]
enum TerminatedChannelStreamState<T> {
    Open { sender: tachyonix::Receiver<T> },
    Closed,
}

#[derive(Debug)]
pub(crate) struct TerminatedChannelStream<T> {
    state: TerminatedChannelStreamState<T>,
}

impl<T> TerminatedChannelStream<T> {
    pub(crate) const fn new(sender: tachyonix::Receiver<T>) -> Self {
        Self {
            state: TerminatedChannelStreamState::Open { sender },
        }
    }
}

impl<T> Stream for TerminatedChannelStream<T> {
    type Item = T;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let TerminatedChannelStreamState::Open { sender } = &mut self.state else {
            return Poll::Ready(None);
        };

        let Some(item) = ready!(sender.poll_next_unpin(cx)) else {
            self.state = TerminatedChannelStreamState::Closed;
            return Poll::Ready(None);
        };

        Poll::Ready(Some(item))
    }
}

impl<T> FusedStream for TerminatedChannelStream<T> {
    fn is_terminated(&self) -> bool {
        matches!(self.state, TerminatedChannelStreamState::Closed)
    }
}
