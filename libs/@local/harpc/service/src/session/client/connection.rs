use alloc::sync::Arc;

use bytes::Bytes;
use futures::{prelude::future::FutureExt, Sink, Stream, StreamExt};
use harpc_wire_protocol::{
    request::{
        id::{RequestId, RequestIdProducer},
        procedure::ProcedureDescriptor,
        service::ServiceDescriptor,
        Request,
    },
    response::Response,
};
use scc::{ebr::Guard, hash_index::Entry, HashIndex};
use tokio::{io, pin, select, sync::mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use super::{
    config::SessionConfig,
    transaction::{ErrorStream, Permit, TransactionTask, ValueStream},
};
use crate::{
    session::gc::{Cancellable, ConnectionGarbageCollectorTask},
    transport::connection::OutgoingConnection,
};

#[derive(Debug, Clone)]
struct TransactionState {
    sender: tachyonix::Sender<Response>,
    cancel: CancellationToken,
}

impl Cancellable for TransactionState {
    fn is_cancelled(&self) -> bool {
        self.cancel.is_cancelled()
    }
}

type TransactionStorage = Arc<HashIndex<RequestId, TransactionState>>;

pub(crate) struct TransactionCollection {
    config: SessionConfig,
    producer: RequestIdProducer,

    cancel: CancellationToken,
    storage: TransactionStorage,
}

impl TransactionCollection {
    pub(crate) fn new(config: SessionConfig, cancel: CancellationToken) -> Self {
        let storage = Arc::new(HashIndex::new());

        Self {
            config,
            producer: RequestIdProducer::new(),

            cancel,
            storage,
        }
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

    pub(crate) fn cancel_all(&self) {
        let guard = Guard::new();
        for (_, state) in self.storage.iter(&guard) {
            state.cancel.cancel();
        }
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

pub(crate) struct TransactionPermit {
    id: RequestId,

    storage: TransactionStorage,

    cancel: CancellationToken,
}

impl TransactionPermit {
    fn new(collection: &TransactionCollection, cancel: CancellationToken) -> Arc<Self> {
        let id = collection.producer.produce();

        Arc::new(Self {
            id,
            storage: Arc::clone(&collection.storage),
            cancel,
        })
    }
}

impl Permit for TransactionPermit {
    fn id(&self) -> RequestId {
        self.id
    }

    fn cancellation_token(&self) -> CancellationToken {
        self.cancel.clone()
    }
}

impl Drop for TransactionPermit {
    fn drop(&mut self) {
        let id = self.id;

        let storage = Arc::clone(&self.storage);

        tokio::spawn(async move {
            storage.remove_async(&id).await;
        });
    }
}

/// Delegate requests to the respective transaction
///
/// This is a 1-n task, which takes requests from the individual transactions and forwards them to
/// the connection.
struct ConnectionRequestDelegateTask<S> {
    sink: S,
    rx: mpsc::Receiver<Request>,
}

impl<S> ConnectionRequestDelegateTask<S>
where
    S: Sink<Request> + Send,
{
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    async fn run(self, cancel: CancellationToken) -> Result<(), S::Error> {
        let sink = self.sink;
        pin!(sink);

        let forward = ReceiverStream::new(self.rx).map(Ok).forward(sink).fuse();

        select! {
            result = forward => result,
            () = cancel.cancelled() => Ok(()),
        }
    }
}

/// Delgate responses to the respective transaction
///
/// Takes into account the [`RequestId`] to route the response to the correct transaction
struct ConnectionResponseDelegateTask<S> {
    stream: S,

    tx: TransactionStorage,
}

impl<S> ConnectionResponseDelegateTask<S>
where
    S: Stream<Item = error_stack::Result<Response, io::Error>> + Send,
{
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    async fn run(self, cancel: CancellationToken) {
        let stream = self.stream;
        pin!(stream);

        loop {
            let response = select! {
                response = stream.next().fuse() => response,
                () = cancel.cancelled() => break,
            };

            let Some(response) = response else {
                // The stream has ended, meaning the connection has been terminated
                break;
            };

            let response = match response {
                Ok(response) => response,
                Err(error) => {
                    tracing::error!(?error, "malformed response received, ignoring...");
                    continue;
                }
            };

            let id = response.header.request_id;

            let Some(entry) = self.tx.get_async(&id).await else {
                tracing::debug!(?id, "response for unknown transaction, ignoring...");
                continue;
            };

            if let Err(error) = entry.sender.send(response).await {
                tracing::debug!(
                    ?id,
                    ?error,
                    "unable to forward response to transaction, ignoring..."
                );

                // the item will be removed implicitely if the transaction is dropped
            }
        }
    }
}

pub struct Connection {
    config: SessionConfig,

    tx: mpsc::Sender<Request>,
    tasks: TaskTracker,

    transactions: TransactionCollection,
}

// TODO: BufferedResponse that will only return the last (valid) response
impl Connection {
    pub(crate) fn spawn(
        config: SessionConfig,
        OutgoingConnection { sink, stream, .. }: OutgoingConnection,
        tasks: &TaskTracker,
        cancel: CancellationToken,
    ) -> Self {
        let (tx, rx) = mpsc::channel(config.per_connection_request_buffer_size.get());

        let this = Self {
            config,

            tx,
            tasks: tasks.clone(),

            transactions: TransactionCollection::new(config, cancel.clone()),
        };

        tasks.spawn(ConnectionRequestDelegateTask { sink, rx }.run(cancel.clone()));

        tasks.spawn(
            ConnectionResponseDelegateTask {
                stream,
                tx: Arc::clone(&this.transactions.storage),
            }
            .run(cancel.clone()),
        );

        tasks.spawn(
            ConnectionGarbageCollectorTask {
                every: config.per_connection_transaction_garbage_collect_interval,
                index: Arc::clone(&this.transactions.storage),
            }
            .run(cancel),
        );

        this
    }

    pub async fn call(
        &self,
        service: ServiceDescriptor,
        procedure: ProcedureDescriptor,
        payload: impl Stream<Item = Bytes> + Send + 'static,
    ) -> impl Stream<Item = Result<ValueStream, ErrorStream>> + Send + Sync + 'static {
        let (permit, response_rx) = self.transactions.acquire().await;

        let (stream_tx, stream_rx) = mpsc::channel(1);

        let task = TransactionTask {
            config: self.config,
            permit,
            service,
            procedure,
            response_rx,
            response_tx: stream_tx,
            request_rx: payload,
            request_tx: self.tx.clone(),
        };

        task.spawn(&self.tasks);

        // we don't need to cancel the transaction here, it will be done automatically, if the
        // stream is dropped, responses will no longer be received, which shuts down the task
        // associated with it.
        // The only task that will survive is the one that sends the request, this one will be
        // terminated once the payload stream is exhausted.
        // This means we can allow scenarios in which the response does not matter and we only want
        // to send a request.
        // TODOs: consider actually stoping the task if this is dropped, as we don't have full
        // control of the payload stream?
        ReceiverStream::new(stream_rx)
    }
}
