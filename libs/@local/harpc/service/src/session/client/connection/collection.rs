use alloc::sync::Arc;

use harpc_wire_protocol::{
    request::id::{RequestId, RequestIdProducer},
    response::Response,
};
use scc::{hash_index::Entry, HashIndex};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

use crate::session::{
    client::{config::SessionConfig, transaction::ClientTransactionPermit},
    gc::Cancellable,
};

#[derive(Debug, Clone)]
pub(crate) struct TransactionState {
    pub(crate) sender: tachyonix::Sender<Response>,
    pub(crate) cancel: CancellationToken,
}

impl Cancellable for TransactionState {
    fn is_cancelled(&self) -> bool {
        self.cancel.is_cancelled()
    }
}

pub(crate) type TransactionStorage = Arc<HashIndex<RequestId, TransactionState>>;

pub(crate) struct TransactionCollection {
    config: SessionConfig,
    producer: RequestIdProducer,

    cancel: CancellationToken,
    storage: TransactionStorage,

    notify: Arc<Notify>,
}

impl TransactionCollection {
    pub(crate) fn new(config: SessionConfig, cancel: CancellationToken) -> Self {
        let storage = Arc::new(HashIndex::new());

        Self {
            config,
            producer: RequestIdProducer::new(),

            cancel,
            storage,

            notify: Arc::new(Notify::new()),
        }
    }

    pub(crate) const fn storage(&self) -> &TransactionStorage {
        &self.storage
    }

    pub(crate) const fn notify(&self) -> &Arc<Notify> {
        &self.notify
    }

    pub(crate) async fn acquire(&self) -> (Arc<TransactionPermit>, tachyonix::Receiver<Response>) {
        let cancel = self.cancel.child_token();
        let permit = TransactionPermit::new(self, cancel.clone());

        let (tx, rx) = tachyonix::channel(self.config.per_transaction_response_buffer_size.get());

        let state = TransactionState { sender: tx, cancel };

        match self.storage.entry_async(permit.id).await {
            Entry::Vacant(entry) => {
                entry.insert_entry(state);
            }
            Entry::Occupied(entry) => {
                // This should never happen, as the permit is unique and should not be shared
                // between multiple transactions.
                // This can only happen in the case that we overflow the u32 RequestId and we have a
                // connection that never terminated
                // This is **highly** unlikely, in case it happens we cancel the old task and
                // replace it with the new one.
                tracing::warn!("Transaction ID collision detected, cancelling old transaction");

                entry.sender.close();
                entry.cancel.cancel();

                entry.update(state);
            }
        }

        (permit, rx)
    }
}

// We cannot cancel all tasks when we drop the collection, as transactions might still be running,
// this is in contrast to the server, where we can cancel all of them, as the drop is not initiated
// by the user, but only happens if the connection itself is dropped and any remaining transactions
// are not relevant anymore.

pub(crate) struct TransactionPermit {
    id: RequestId,

    storage: TransactionStorage,

    cancel: CancellationToken,
    notify: Arc<Notify>,
}

impl TransactionPermit {
    fn new(collection: &TransactionCollection, cancel: CancellationToken) -> Arc<Self> {
        let id = collection.producer.produce();

        Arc::new(Self {
            id,
            storage: Arc::clone(&collection.storage),
            cancel,
            notify: Arc::clone(&collection.notify),
        })
    }
}

impl ClientTransactionPermit for TransactionPermit {
    fn id(&self) -> RequestId {
        self.id
    }

    fn cancellation_token(&self) -> &CancellationToken {
        &self.cancel
    }
}

impl Drop for TransactionPermit {
    fn drop(&mut self) {
        let id = self.id;

        let storage = Arc::clone(&self.storage);
        let notify = Arc::clone(&self.notify);

        tokio::spawn(async move {
            let removed = storage.remove_async(&id).await;

            if removed && storage.is_empty() {
                // Notify the session that all transactions have been completed
                notify.notify_one();
            }
        });
    }
}
