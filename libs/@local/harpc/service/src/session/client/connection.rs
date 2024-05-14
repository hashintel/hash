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
use scc::{hash_index::Entry, HashIndex};
use tokio::{io, pin, select, sync::mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use super::transaction::{ErrorStream, TransactionReceiveTask, TransactionSendTask, ValueStream};
use crate::stream::ReceiverStreamCancel;

const REQUEST_BUFFER_SIZE: usize = 32;
const RESPONSE_BUFFER_SIZE: usize = 32;

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

pub struct Connection {
    id: RequestIdProducer,

    tx: mpsc::Sender<Request>,
    tracker: TaskTracker,
    cancel: CancellationToken,

    receivers: Arc<HashIndex<RequestId, mpsc::Sender<Response>>>,
}

// TODO: BufferedResponse that will only return the last (valid) response
impl Connection {
    pub(crate) fn start(
        sink: impl Sink<Request, Error: Send> + Send + 'static,
        stream: impl Stream<Item = error_stack::Result<Response, io::Error>> + Send + 'static,
        cancel: CancellationToken,
    ) -> Self {
        let (tx, rx) = mpsc::channel(REQUEST_BUFFER_SIZE);

        let this = Self {
            id: RequestIdProducer::new(),

            tx,
            tracker: TaskTracker::new(),
            cancel: cancel.clone(),

            receivers: Arc::new(HashIndex::new()),
        };

        this.tracker
            .spawn(ConnectionRequestDelegateTask { sink, rx }.run(cancel.clone()));

        this.tracker.spawn(
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

        let (tx, rx) = mpsc::channel(RESPONSE_BUFFER_SIZE);

        let entry = self.receivers.entry_async(id).await;
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

        self.tracker.spawn(
            TransactionSendTask {
                id,
                service,
                procedure,
                rx: payload,
                tx: self.tx.clone(),
            }
            .run(cancel.clone()),
        );

        self.tracker
            .spawn(TransactionReceiveTask { rx, tx: stream_tx }.run(cancel.clone()));

        ReceiverStreamCancel::new(stream_rx, cancel.drop_guard())
    }
}
