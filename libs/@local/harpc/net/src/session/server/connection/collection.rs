use alloc::sync::Arc;
use core::sync::atomic::{AtomicU64, Ordering};

use harpc_wire_protocol::request::{id::RequestId, Request};
use scc::{ebr::Guard, hash_index::Entry, HashIndex};
use tachyonix::SendTimeoutError;
use tokio::sync::{Notify, OwnedSemaphorePermit, Semaphore};
use tokio_util::sync::CancellationToken;

use crate::session::{
    error::{ConnectionTransactionLimitReachedError, TransactionLaggingError},
    gc::IsCancelled,
    server::{transaction::ServerTransactionPermit, SessionConfig},
};

#[derive(Debug)]
struct ConcurrencyPermit {
    _permit: OwnedSemaphorePermit,
}

#[derive(Debug, Clone)]
pub(crate) struct ConcurrencyLimit {
    limit: usize,
    current: Arc<Semaphore>,
}

impl ConcurrencyLimit {
    fn new(limit: usize) -> Self {
        Self {
            limit,
            current: Arc::new(Semaphore::new(limit)),
        }
    }

    fn acquire(&self) -> Result<ConcurrencyPermit, ConnectionTransactionLimitReachedError> {
        Arc::clone(&self.current).try_acquire_owned().map_or_else(
            |_error| Err(ConnectionTransactionLimitReachedError { limit: self.limit }),
            |permit| Ok(ConcurrencyPermit { _permit: permit }),
        )
    }
}

#[derive(Debug, Clone)]
pub(crate) struct TransactionState {
    generation: u64,

    pub sender: tachyonix::Sender<Request>,
    pub cancel: CancellationToken,
}

impl IsCancelled for TransactionState {
    fn is_cancelled(&self) -> bool {
        self.cancel.is_cancelled()
    }
}

pub(crate) type TransactionStorage = Arc<HashIndex<RequestId, TransactionState>>;

pub(crate) struct TransactionCollection {
    config: SessionConfig,

    generation: AtomicU64,
    notify: Arc<Notify>,

    cancel: CancellationToken,
    storage: TransactionStorage,
    limit: ConcurrencyLimit,
}

impl TransactionCollection {
    pub(crate) fn new(config: SessionConfig, cancel: CancellationToken) -> Self {
        let storage = Arc::new(HashIndex::new());
        let limit = ConcurrencyLimit::new(config.per_connection_concurrent_transaction_limit);
        let notify = Arc::new(Notify::new());

        Self {
            generation: AtomicU64::new(0),
            notify,
            config,
            cancel,
            storage,
            limit,
        }
    }

    pub(crate) const fn notify(&self) -> &Arc<Notify> {
        &self.notify
    }

    pub(crate) const fn storage(&self) -> &TransactionStorage {
        &self.storage
    }

    pub(crate) async fn acquire(
        &self,
        id: RequestId,
    ) -> Result<
        (
            TransactionPermit,
            tachyonix::Sender<Request>,
            tachyonix::Receiver<Request>,
        ),
        ConnectionTransactionLimitReachedError,
    > {
        let cancel = self.cancel.child_token();

        let permit = TransactionPermit::new(self, id, cancel.clone())?;

        let (tx, rx) = tachyonix::channel(self.config.per_transaction_request_buffer_size.get());

        let state = TransactionState {
            generation: permit.generation,
            sender: tx.clone(),
            cancel,
        };

        let entry = self.storage.entry_async(id).await;
        match entry {
            Entry::Occupied(entry) => {
                // We need to cancel the previous transaction immediately, as we have received
                // another request for the same transaction id, if we would drop the handle, instead
                // of cancelling it, we would send an error that transmission was incomplete.
                entry.cancel.cancel();

                entry.update(state);
            }
            Entry::Vacant(entry) => {
                entry.insert_entry(state);
            }
        }

        Ok((permit, tx, rx))
    }

    pub(crate) async fn release(&self, id: RequestId) {
        let Some(entry) = self.storage.get_async(&id).await else {
            return;
        };

        entry.cancel.cancel();
        entry.remove_entry();
    }

    pub(crate) fn shutdown_senders(&self) {
        let guard = Guard::new();
        for (_, state) in self.storage.iter(&guard) {
            state.sender.close();
        }
    }

    fn cancel_all(&self) {
        let guard = Guard::new();
        for (_, state) in self.storage.iter(&guard) {
            state.cancel.cancel();
        }
    }

    fn cancel(&self, id: RequestId) {
        let guard = Guard::new();
        let Some(state) = self.storage.peek(&id, &guard) else {
            return;
        };
        state.cancel.cancel();
    }

    pub(crate) async fn send(&self, request: Request) -> Result<(), TransactionLaggingError> {
        let id = request.header.request_id;

        // `Clone` is perferred here instead of acquiring the entry, as we don't need to block, and
        // we just increment an `Arc`.
        let Some(sender) = self
            .storage
            .peek_with(&id, |_, TransactionState { sender, .. }| sender.clone())
        else {
            tracing::info!(
                ?id,
                "rogue packet received that isn't part of a transaction, dropping"
            );

            return Ok(());
        };

        // this creates implicit backpressure, if the transaction cannot accept more
        // requests, we will wait a short amount (specified via the deadline), if we
        // haven't processed the data until then, we will drop the
        // transaction.
        let result = sender
            .send_timeout(
                request,
                tokio::time::sleep(self.config.request_delivery_deadline),
            )
            .await;

        // This only happens in the case of a full buffer, which only happens if during
        // buffering in an upper layer we are not able to process
        // the data fast enough. This is also a mechanism to prevent
        // a single transaction from blocking the whole session,
        // and to prevent packet flooding.
        match result {
            Ok(()) => {
                // everything is fine
                Ok(())
            }
            Err(SendTimeoutError::Closed(_)) => {
                tracing::info!("transaction request channel has been closed, dropping packet");

                // the channel has already been closed, the upper layer must notify
                // the sender that the transaction is (potentially) incomplete.
                //
                // Otherwise this could also be a packet that is simply out of order or rogue
                // in that case notifing the client would be confusing anyway.
                Ok(())
            }
            Err(SendTimeoutError::Timeout(_)) => {
                tracing::warn!("transaction buffer is too slow, dropping transaction");

                // we've missed the deadline, therefore we can no longer send data to the
                // transaction without risking the integrity of the transaction.
                // we also send our own error to the client, so we need to cancel any existing
                // transaction, so that we do not send any auxilirary data.
                // Whenever we cancel a task, we do not flush, so no `EndOfResponse` is accidentally
                // sent.
                sender.close();

                // TODO: is this behaviour we want, or do we want a more graceful approach?
                // peek is not linearizable, so we need to peek again.
                self.cancel(id);

                Err(TransactionLaggingError)
            }
        }
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.storage.is_empty()
    }
}

impl Drop for TransactionCollection {
    fn drop(&mut self) {
        // Dropping the transaction collection indicates that the session is shutting down, this
        // means no supervisor is there to send or recv data, so we can just go ahead and cancel any
        // pending transactions.
        // These should have been cancelled already implicitly, but just to be sure we do it again
        // explicitely here, as to not leave any dangling tasks.
        self.cancel_all();
    }
}

#[derive(Debug)]
pub(crate) struct TransactionPermit {
    id: RequestId,
    // adding an overflowing generation counter helps to prevent us from accidentally
    // removing requests in the case that we're overriding them.
    // If we override, we *could* have the case where w/ the following code:
    //
    // 1. TransactionCollection::acquire()
    //    - create a new permit
    //    - cancel the old permit (this one)
    //    - replace old state (this one is bound to) with new state
    // 2. TransactionPermit::drop() (old)
    //    - remove the state from the storage
    //
    // without the generation, we would, in that case, remove the new state, which is not
    // what we want.
    //
    // Also known as the ABA problem.
    generation: u64,

    storage: TransactionStorage,

    cancel: CancellationToken,
    notify: Arc<Notify>,

    _permit: ConcurrencyPermit,
}

impl TransactionPermit {
    fn new(
        collection: &TransactionCollection,
        id: RequestId,
        cancel: CancellationToken,
    ) -> Result<Self, ConnectionTransactionLimitReachedError> {
        let permit = collection.limit.acquire()?;
        let storage = Arc::clone(&collection.storage);
        let notify = Arc::clone(&collection.notify);

        // we only need to increment the generation counter, when we are successful in acquiring a
        // permit.
        // Relaxed ordering is fine here, as we only ever increment the value and we do not care
        // about the order of those increments.
        let generation = collection.generation.fetch_add(1, Ordering::Relaxed);

        Ok(Self {
            id,
            storage,
            generation,
            notify,
            _permit: permit,
            cancel,
        })
    }
}

impl ServerTransactionPermit for TransactionPermit {
    fn cancellation_token(&self) -> &CancellationToken {
        &self.cancel
    }

    fn id(&self) -> RequestId {
        self.id
    }
}

impl Drop for TransactionPermit {
    fn drop(&mut self) {
        // using async and sync methods can lead to deadlocks, so we spawn a new task to remove the
        // state from the storage (it's also just cleaner this way), as `remove_if` might block.
        let storage = Arc::clone(&self.storage);
        let notify = Arc::clone(&self.notify);

        let id = self.id;
        let generation = self.generation;

        // We need to spawn a task here, because `remove_if` might block, there's a blocking
        // equivalent, but if an `Entry` is used across an await point, there's the possibility of a
        // deadlock. To prevent this from even accidentally happening, we spawn a new task.
        // (We tried to use the blocking methods previously, which was too easy to accidentally
        // deadlock)
        tokio::spawn(async move {
            let has_removed = storage
                .remove_if_async(&id, |state| state.generation == generation)
                .await;

            // we only need to check if empty, if we have removed something
            if has_removed && storage.is_empty() {
                notify.notify_one();
            }
        });
    }
}

#[cfg(test)]
mod test {
    use crate::session::server::connection::collection::ConcurrencyLimit;

    #[test]
    fn concurrency_limit() {
        let limit = ConcurrencyLimit::new(2);
        assert_eq!(limit.current.available_permits(), 2);

        let _permit = limit.acquire().expect("should be able to acquire permit");
        assert_eq!(limit.current.available_permits(), 1);

        let _permit2 = limit.acquire().expect("should be able to acquire permit");
        assert_eq!(limit.current.available_permits(), 0);
    }

    #[test]
    fn concurrency_limit_reached() {
        let limit = ConcurrencyLimit::new(1);
        assert_eq!(limit.current.available_permits(), 1);

        let permit = limit.acquire().expect("should be able to acquire permit");
        assert_eq!(limit.current.available_permits(), 0);

        limit
            .acquire()
            .expect_err("should be unable to acquire permit");

        drop(permit);
        assert_eq!(limit.current.available_permits(), 1);

        let _permit = limit.acquire().expect("should be able to acquire permit");
        assert_eq!(limit.current.available_permits(), 0);
    }

    #[test]
    fn concurrency_limit_reached_permit_reclaim() {
        let limit = ConcurrencyLimit::new(1);
        assert_eq!(limit.current.available_permits(), 1);

        let permit = limit.acquire().expect("should be able to acquire permit");
        assert_eq!(limit.current.available_permits(), 0);

        drop(permit);
        assert_eq!(limit.current.available_permits(), 1);
    }
}
