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
    transaction::{ErrorStream, TransactionReceiveTask, TransactionSendTask, ValueStream},
};
use crate::{stream::ReceiverStreamCancel, transport::connection::OutgoingConnection};

#[derive(Debug, Clone)]
struct TransactionState {
    sender: tachyonix::Sender<Response>,
    cancel: CancellationToken,
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

struct ConnectionResponseDelegateTask<S> {
    stream: S,

    // TODO: what about permits and such?!
    tx: Arc<HashIndex<RequestId, mpsc::Sender<Response>>>,
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
                    tracing::error!(?error, "malformed response received, dropping...");
                    continue;
                }
            };

            let id = response.header.request_id;

            let Some(sender) = self.tx.get_async(&id).await else {
                tracing::debug!(?id, "rogue response received, dropping...");
                continue;
            };

            if let Err(error) = sender.send(response).await {
                tracing::debug!(?id, ?error, "receiver dropped, dropping...");
                self.tx.remove_async(&id).await;
            }
        }
    }
}

// TODO: DropGuard on connection drop (via the collection)

pub struct Connection {
    config: SessionConfig,
    id: RequestIdProducer,

    tx: mpsc::Sender<Request>,
    tasks: TaskTracker,
    cancel: CancellationToken,

    receivers: Arc<HashIndex<RequestId, mpsc::Sender<Response>>>,
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
            id: RequestIdProducer::new(),

            tx,
            tasks: tasks.clone(),
            cancel: cancel.clone(),

            receivers: Arc::new(HashIndex::new()),
        };

        tasks.spawn(ConnectionRequestDelegateTask { sink, rx }.run(cancel.clone()));

        tasks.spawn(
            ConnectionResponseDelegateTask {
                stream,
                tx: Arc::clone(&this.receivers),
            }
            .run(cancel),
        );

        // TODO: gc receivers

        this
    }

    pub async fn call(
        &self,
        service: ServiceDescriptor,
        procedure: ProcedureDescriptor,
        payload: impl Stream<Item = Bytes> + Send + 'static,
    ) -> impl Stream<Item = Result<ValueStream, ErrorStream>> + Send + Sync + 'static {
        let id = self.id.produce();

        let (tx, rx) = mpsc::channel(self.config.per_transaction_response_buffer_size.get());

        let entry = self.receivers.entry_async(id).await;

        // TODO: should error out if we have that already!
        match entry {
            Entry::Occupied(entry) => {
                tracing::warn!(?id, "occupied entry used"); // this should never happen
                entry.update(tx);
            }
            Entry::Vacant(entry) => {
                entry.insert_entry(tx);
            }
        }

        let cancel = self.cancel.child_token();

        let (stream_tx, stream_rx) = mpsc::channel(1);

        self.tasks.spawn(
            TransactionSendTask {
                config: self.config,
                id,
                service,
                procedure,
                rx: payload,
                tx: self.tx.clone(),
            }
            .run(cancel.clone()),
        );

        self.tasks.spawn(
            TransactionReceiveTask {
                config: self.config,
                rx,
                tx: stream_tx,
            }
            .run(cancel.clone()),
        );

        // TODO: do we want to drop them?
        // TODO: no use permit here (like the server)
        ReceiverStreamCancel::new(stream_rx, cancel.drop_guard())
    }
}
