use core::{
    pin::Pin,
    task::{Context, Poll},
};

use futures::Stream;
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
