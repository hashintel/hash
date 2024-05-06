use alloc::sync::Arc;

use bytes::Bytes;
use futures::{Sink, Stream, StreamExt};
use harpc_wire_protocol::{
    request::{
        id::{RequestId, RequestIdProducer},
        procedure::ProcedureDescriptor,
        service::ServiceDescriptor,
        Request,
    },
    response::Response,
};
use scc::HashIndex;
use tokio::{pin, sync::mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::task::TaskTracker;

use super::transaction::{ErrorStream, TransactionReceiveTask, ValueStream};

const RESPONSE_BUFFER_SIZE: usize = 32;
const BYTE_STREAM_BUFFER_SIZE: usize = 32;

struct ConnectionRequestDelegateTask<S> {
    sink: S,
    rx: mpsc::Receiver<Request>,
}

impl<S> ConnectionRequestDelegateTask<S>
where
    S: Sink<Request> + Send + Sync + 'static,
{
    async fn run(self) -> Result<(), S::Error> {
        let sink = self.sink;
        pin!(sink);

        ReceiverStream::new(self.rx).map(Ok).forward(sink).await
    }
}

struct ConnectionResponseDelegateTask<S> {
    stream: S,

    tx: Arc<HashIndex<RequestId, mpsc::Sender<Response>>>,
}

impl<S> ConnectionResponseDelegateTask<S>
where
    S: Stream<Item = Response> + Send + Sync + 'static,
{
    async fn run(self) {
        let stream = self.stream;
        pin!(stream);

        while let Some(response) = stream.next().await {
            let id = response.header.request_id;

            let Some(sender) = self.tx.get_async(&id).await else {
                tracing::debug!(?id, "rogue response received, dropping...");
                continue;
            };

            if let Err(_) = sender.send(response).await {
                tracing::debug!(?id, "receiver dropped, dropping...");
                self.tx.remove_async(&id).await;
            }
        }
    }
}

pub struct Connection {
    id: RequestIdProducer,

    tx: mpsc::Sender<Request>,
    tracker: TaskTracker,

    receivers: Arc<HashIndex<RequestId, mpsc::Sender<Response>>>,
}

impl Connection {
    pub async fn call(
        &self,
        service: ServiceDescriptor,
        produce: ProcedureDescriptor,
        payload: impl Stream<Item = Bytes> + Send + Sync + 'static,
    ) -> impl Stream<Item = Result<ValueStream, ErrorStream>> + Send + Sync + 'static {
        let id = self.id.produce();

        let (tx, rx) = mpsc::channel(RESPONSE_BUFFER_SIZE);

        self.receivers.insert_async(id, tx).await;

        // TODO: RequestWriter (in separate task)

        let (stream_tx, stream_rx) = mpsc::channel(1);

        self.tracker
            .spawn(TransactionReceiveTask { rx, tx: stream_tx }.run());

        ReceiverStream::new(stream_rx)
    }
}
