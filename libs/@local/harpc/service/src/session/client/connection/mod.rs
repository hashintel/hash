mod collection;
mod stream;
#[cfg(test)]
mod test;

use alloc::sync::Arc;

use bytes::Bytes;
use futures::{prelude::future::FutureExt, Sink, Stream, StreamExt};
use harpc_wire_protocol::{
    request::{procedure::ProcedureDescriptor, service::ServiceDescriptor, Request},
    response::Response,
};
use tokio::{io, pin, select, sync::mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use self::{
    collection::{TransactionCollection, TransactionStorage},
    stream::ResponseStream,
};
use super::{config::SessionConfig, transaction::TransactionTask};
use crate::session::gc::ConnectionGarbageCollectorTask;

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

// TODO: we have no concept of when the connection is closed on call, we need to have something like
// a `healthy` meter.

pub(crate) struct ConnectionParts<'a> {
    pub(crate) config: SessionConfig,
    pub(crate) tasks: &'a TaskTracker,
    pub(crate) cancel: CancellationToken,
}

pub struct Connection {
    config: SessionConfig,

    tx: mpsc::Sender<Request>,
    tasks: TaskTracker,

    transactions: TransactionCollection,
}

// TODO: BufferedResponse that will only return the last (valid) response
impl Connection {
    pub(crate) fn spawn<S, T>(
        ConnectionParts {
            config,
            tasks,
            cancel,
        }: ConnectionParts,
        sink: S,
        stream: T,
    ) -> Self
    where
        S: Sink<Request, Error: Send> + Send + 'static,
        T: Stream<Item = error_stack::Result<Response, io::Error>> + Send + 'static,
    {
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
                tx: Arc::clone(this.transactions.storage()),
            }
            .run(cancel.clone()),
        );

        tasks.spawn(
            ConnectionGarbageCollectorTask {
                every: config.per_connection_transaction_garbage_collect_interval,
                index: Arc::clone(this.transactions.storage()),
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
    ) -> ResponseStream {
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
        ResponseStream::new(stream_rx)
    }
}
