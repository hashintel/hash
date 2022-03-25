use std::{result::Result, sync::Arc};

use tokio::sync::{mpsc, Mutex};

/// Create a new single-producer multi-consumer queue. The `Receiver` end of the queue
/// may be cloned. Each value in the queue will be received by at most one consumer.
/// Internally, consumers acquire a tokio lock on the receiving side of a channel which
/// ensures a fair allocation of messages to consumers based on FIFO locking order.
/// See: <https://tokio-rs.github.io/tokio/doc/tokio/sync/struct.Mutex.html>
pub(crate) fn channel<T>(buffer: usize) -> (Sender<T>, Receiver<T>) {
    let (tx, rx) = mpsc::channel::<T>(buffer);
    let sender = Sender { sender: tx };
    let receiver = Receiver {
        receiver: Arc::new(Mutex::new(rx)),
    };
    (sender, receiver)
}

#[derive(Clone)]
pub(crate) struct Sender<T> {
    sender: mpsc::Sender<T>,
}

impl<T> Sender<T> {
    /// Send a value into the queue. Returns an error if all receive ends of the queue
    /// are dropped.
    pub(crate) async fn send(&mut self, value: T) -> Result<(), mpsc::error::SendError<T>> {
        self.sender.send(value).await
    }
}

pub(crate) struct Receiver<T> {
    receiver: Arc<Mutex<mpsc::Receiver<T>>>,
}

impl<T> Clone for Receiver<T> {
    fn clone(&self) -> Self {
        Receiver {
            receiver: self.receiver.clone(),
        }
    }
}

impl<T> Receiver<T> {
    /// Receive a value from the queue. Returns `None` if the send half is dropped.
    pub(crate) async fn recv(&mut self) -> Option<T> {
        let mut ch = self.receiver.lock().await;
        ch.recv().await
    }
}
