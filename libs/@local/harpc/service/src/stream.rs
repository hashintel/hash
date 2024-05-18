use core::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use futures::{prelude::stream::StreamExt, stream::FusedStream, Stream};
use tokio::sync::mpsc;
use tokio_util::sync::DropGuard;

pub(crate) struct ReceiverStreamCancel<T> {
    receiver: mpsc::Receiver<T>,
    _guard: DropGuard,
}

impl<T> ReceiverStreamCancel<T> {
    pub(crate) fn new(receiver: mpsc::Receiver<T>, guard: DropGuard) -> Self {
        Self {
            receiver,
            _guard: guard,
        }
    }
}

impl<T> Stream for ReceiverStreamCancel<T> {
    type Item = T;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.receiver.poll_recv(cx)
    }
}

#[derive(Debug)]
enum TerminatedChannelStreamState<T> {
    Open { sender: tachyonix::Receiver<T> },
    Closed,
}

#[derive(Debug)]
pub struct TerminatedChannelStream<T> {
    state: TerminatedChannelStreamState<T>,
}

impl<T> TerminatedChannelStream<T> {
    pub fn new(sender: tachyonix::Receiver<T>) -> Self {
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
