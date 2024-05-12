use alloc::sync::Arc;
use core::{
    fmt::Debug,
    ops::ControlFlow,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use std::io;

use futures::{FutureExt, Sink, Stream, StreamExt};
use harpc_wire_protocol::{
    request::{body::RequestBody, id::RequestId, Request},
    response::Response,
};
use libp2p::PeerId;
use scc::{ebr::Guard, hash_index::Entry, HashIndex};
use tokio::{
    pin, select,
    sync::{
        broadcast,
        mpsc::{self, error::SendTimeoutError},
        OwnedSemaphorePermit, Semaphore,
    },
};
use tokio_stream::{wrappers::ReceiverStream, StreamNotifyClose};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use super::{
    session_id::SessionId,
    transaction::{Transaction, TransactionParts},
    write::ResponseWriter,
    SessionConfig, SessionEvent,
};
use crate::{
    codec::{ErrorEncoder, PlainError},
    session::error::{
        ConnectionTransactionLimitReachedError, InstanceTransactionLimitReachedError,
        TransactionError, TransactionLaggingError,
    },
};

struct ConnectionDelegateTask<T> {
    rx: mpsc::Receiver<Response>,

    sink: T,
}

impl<T> ConnectionDelegateTask<T>
where
    T: Sink<Response, Error: Debug> + Send,
{
    #[allow(clippy::integer_division_remainder_used)]
    async fn run(self, cancel: CancellationToken) -> Result<(), T::Error> {
        let sink = self.sink;
        pin!(sink);

        let forward = ReceiverStream::new(self.rx).map(Ok).forward(sink).fuse();

        // redirect the receiver stream to the sink, needs an extra task to drive both
        select! {
            result = forward => result,
            () = cancel.cancelled() => Ok(()),
        }
    }
}

struct ConnectionGarbageCollectorTask {
    every: Duration,
    transactions: TransactionStorage,
}

impl ConnectionGarbageCollectorTask {
    #[allow(clippy::integer_division_remainder_used)]
    async fn run(self, cancel: CancellationToken) {
        let mut interval = tokio::time::interval(self.every);

        loop {
            select! {
                _ = interval.tick() => {}
                () = cancel.cancelled() => break,
            }

            tracing::debug!("running garbage collector");

            let mut removed = 0_usize;
            self.transactions
                .retain_async(|_, TransactionState { cancel, .. }| {
                    if cancel.is_cancelled() {
                        removed += 1;
                        false
                    } else {
                        true
                    }
                })
                .await;

            if removed > 0 {
                // this should never really happen, but it's good to know if it does
                tracing::info!(removed, "garbage collector removed stale transactions");
            }
        }
    }
}

#[derive(Debug)]
struct ConcurrencyPermit {
    _permit: OwnedSemaphorePermit,
}

#[derive(Debug, Clone)]
struct ConcurrencyLimit {
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
struct TransactionState {
    generation: u64,

    sender: tachyonix::Sender<Request>,
    cancel: CancellationToken,
}

type TransactionStorage = Arc<HashIndex<RequestId, TransactionState>>;

pub(crate) struct TransactionCollection {
    config: SessionConfig,

    generation: AtomicU64,
    cancel: CancellationToken,
    storage: TransactionStorage,
    limit: ConcurrencyLimit,
}

impl TransactionCollection {
    pub(crate) fn new(config: SessionConfig, cancel: CancellationToken) -> Self {
        let storage = Arc::new(HashIndex::new());
        let limit = ConcurrencyLimit::new(config.per_connection_concurrent_transaction_limit);

        Self {
            generation: AtomicU64::new(0),
            config,
            cancel,
            storage,
            limit,
        }
    }

    async fn acquire(
        &self,
        id: RequestId,
    ) -> Result<
        (
            Arc<TransactionPermit>,
            tachyonix::Sender<Request>,
            tachyonix::Receiver<Request>,
        ),
        ConnectionTransactionLimitReachedError,
    > {
        let cancel = self.cancel.child_token();

        let handle = TransactionPermit::new(self, id, cancel.clone())?;

        let (tx, rx) = tachyonix::channel(self.config.per_transaction_request_buffer_size.get());

        let state = TransactionState {
            generation: handle.generation,
            sender: tx.clone(),
            cancel,
        };

        let entry = self.storage.entry_async(id).await;
        match entry {
            Entry::Occupied(entry) => {
                // evict the old one by cancelling it, it's still active, so we do not decrease the
                // counter
                entry.cancel.cancel();

                entry.update(state);
            }
            Entry::Vacant(entry) => {
                entry.insert_entry(state);
            }
        }

        Ok((handle, tx, rx))
    }

    async fn release(&self, id: RequestId) {
        let entry = self.storage.entry_async(id).await;

        match entry {
            Entry::Occupied(entry) => {
                entry.cancel.cancel();
                entry.remove_entry();
            }
            Entry::Vacant(_) => {}
        }
    }

    fn shutdown_senders(&self) {
        let guard = Guard::new();
        for (_, state) in self.storage.iter(&guard) {
            state.sender.close();
        }
    }

    async fn shutdown_sender(&self, id: RequestId) {
        if let Some(state) = self.storage.get_async(&id).await {
            state.sender.close();
        }
    }

    fn cancel_all(&self) {
        let guard = Guard::new();
        for (_, state) in self.storage.iter(&guard) {
            state.cancel.cancel();
        }
    }

    async fn send(&self, request: Request) -> Result<(), TransactionLaggingError> {
        let id = request.header.request_id;

        let Some(entry) = self.storage.get(&id) else {
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
        let result = tokio::time::timeout(
            self.config.request_delivery_deadline,
            entry.sender.send(request),
        )
        .await;

        // This only happens in the case of a full buffer, which only happens if during
        // buffering in an upper layer we are not able to process
        // the data fast enough. This is also a mechanism to prevent
        // a single transaction from blocking the whole session,
        // and to prevent packet flooding.
        match result {
            Ok(Ok(())) => {
                // everything is fine, continue by early returning
                return Ok(());
            }
            Ok(Err(_)) => {
                tracing::info!("transaction sender has been closed, dropping packet");

                // the channel has already been closed, the upper layer must notify
                // the sender that the transaction is (potentially) incomplete.
                //
                // Otherwise this could also be a packet that is simply out of order or rogue
                // in that case notifing the client would be confusing anyway.
                return Ok(());
            }
            Err(_) => {
                tracing::warn!("transaction buffer is too slow, dropping transaction");

                // we've missed the deadline, therefore we can no longer send data to the
                // transaction without risking the integrity of the transaction.
                self.shutdown_sender(id).await;

                return Err(TransactionLaggingError);
            }
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

    _permit: ConcurrencyPermit,
}

impl TransactionPermit {
    fn new(
        collection: &TransactionCollection,
        id: RequestId,
        cancel: CancellationToken,
    ) -> Result<Arc<Self>, ConnectionTransactionLimitReachedError> {
        let permit = collection.limit.acquire()?;
        let storage = Arc::clone(&collection.storage);

        // we only need to increment the generation counter, when we are successful in acquiring a
        // permit.
        let generation = collection.generation.fetch_add(1, Ordering::AcqRel);

        Ok(Arc::new(Self {
            id,
            storage,
            generation,
            _permit: permit,
            cancel,
        }))
    }

    pub(crate) fn cancellation_token(&self) -> CancellationToken {
        self.cancel.clone()
    }
}

impl Drop for TransactionPermit {
    fn drop(&mut self) {
        self.storage
            .remove_if(&self.id, |state| state.generation == self.generation);
    }
}

pub(crate) struct ConnectionTask<E> {
    pub(crate) peer: PeerId,
    pub(crate) session: SessionId,

    pub(crate) active: TransactionCollection,
    pub(crate) output: mpsc::Sender<Transaction>,
    pub(crate) events: broadcast::Sender<SessionEvent>,

    pub(crate) config: SessionConfig,
    pub(crate) encoder: Arc<E>,
    pub(crate) _permit: OwnedSemaphorePermit,
}

impl<E> ConnectionTask<E>
where
    E: ErrorEncoder + Send + Sync + 'static,
{
    async fn respond_error<T>(
        &self,
        id: RequestId,
        error: T,
        tx: &mpsc::Sender<Response>,
    ) -> ControlFlow<()>
    where
        T: PlainError + Send + Sync,
    {
        let TransactionError { code, bytes } = self.encoder.encode_error(error).await;

        let mut writer = ResponseWriter::new_error(id, code, tx);
        writer.push(bytes);

        if writer.flush().await.is_err() {
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    }

    async fn handle_request(
        &self,
        tx: mpsc::Sender<Response>,
        tasks: &TaskTracker,
        request: Request,
    ) -> ControlFlow<()> {
        // check if this is a `Begin` request, in that case we need to create a new transaction,
        // otherwise, this is already a transaction and we need to forward it, or log out if it is a
        // rogue request
        let request_id = request.header.request_id;

        // these transactions then need to be propagated to the main session layer via an mpsc
        // channel, which drops a transaction if there's too many.
        match &request.body {
            RequestBody::Begin(begin) => {
                #[expect(
                    clippy::significant_drop_in_scrutinee,
                    reason = "This simply returns a drop guard, that is carried through the \
                              transaction lifetime."
                )]
                let (permit, request_tx, request_rx) = match self.active.acquire(request_id).await {
                    Ok((permit, tx, rx)) => (permit, tx, rx),
                    Err(error) => {
                        tracing::info!("transaction limit reached, dropping transaction");

                        return self.respond_error(request_id, error, &tx).await;
                    }
                };

                let (transaction, task) = Transaction::from_request(
                    request.header,
                    begin,
                    TransactionParts {
                        peer: self.peer,
                        session: self.session,
                        config: self.config,
                        rx: request_rx,
                        tx: tx.clone(),
                    },
                );

                // we put it in the buffer, so will resolve immediately
                request_tx
                    .try_send(request)
                    .expect("infallible; buffer should be large enough to hold the request");

                task.start(tasks, permit);

                // creates implicit backpressure, if the session can not accept more transactions,
                // we will wait until we can, this means that we will not be able to
                // accept any more request packets until we can.
                let result = self
                    .output
                    .send_timeout(transaction, self.config.transaction_delivery_deadline)
                    .await;

                // This only happens in case of a full buffer, in that case we will drop the
                // transaction, because we can assume that the upper layer is unable to keep up with
                // the incoming requests, it also helps us to prevent a DoS attack.
                if let Err(error) = result {
                    match error {
                        SendTimeoutError::Timeout(_) => {
                            tracing::warn!("transaction delivery timed out, dropping transaction");
                            self.active.release(request_id).await;

                            return self
                                .respond_error(
                                    request_id,
                                    InstanceTransactionLimitReachedError,
                                    &tx,
                                )
                                .await;
                        }
                        SendTimeoutError::Closed(_) => {
                            // other end has been dropped, we can stop processing
                            return ControlFlow::Break(());
                        }
                    }
                }
            }
            RequestBody::Frame(_) => {
                if let Err(error) = self.active.send(request).await {
                    return self.respond_error(request_id, error, &tx).await;
                }
            }
        }

        // TODO: forced gc on timeout in upper layer

        // we do not need to check for `EndOfRequest` here and forcefully close the channel, as the
        // task is already doing this for us.

        ControlFlow::Continue(())
    }

    #[allow(clippy::integer_division_remainder_used)]
    pub(crate) async fn run<T, U>(
        self,
        sink: T,
        stream: U,
        tasks: TaskTracker,
        cancel: CancellationToken,
    ) where
        T: Sink<Response, Error: Debug + Send> + Send + 'static,
        U: Stream<Item = error_stack::Result<Request, io::Error>> + Send,
    {
        let stream = StreamNotifyClose::new(stream.fuse());

        pin!(stream);

        let finished = Semaphore::new(0);

        let cancel_gc = cancel.child_token();
        tasks.spawn(
            ConnectionGarbageCollectorTask {
                every: self
                    .config
                    .per_connection_transaction_garbage_collect_interval,
                transactions: Arc::clone(&self.active.storage),
            }
            .run(cancel_gc.clone()),
        );
        let _drop_gc = cancel_gc.drop_guard();

        // if we break out of the loop the `ConnectionDelegateTask` automatically stops itself, even
        // *if* it is still running, this is because `tx` is dropped, which closes the
        // channel, meaning that `ConnectionDelegateTask` will stop itself.
        // ^ this is true in theory, but we only drop `tx` if task has been finished, which is a
        // problem, this has the potential of creating a task that just never stops. Which we do NOT
        // want.
        // We solve this by dropping the `tx` once the stream has finished, because we know that we
        // won't be able to create any more transactions.
        let (tx, rx) = mpsc::channel(self.config.per_connection_response_buffer_size.get());
        let mut handle = tasks
            .spawn(ConnectionDelegateTask { rx, sink }.run(cancel.clone()))
            .fuse();
        let mut tx = Some(tx);

        loop {
            select! {
                // we use `StreamNotifyClose` here (and the double `Option<Option<T>>`), so that we don't add too many permits at once
                // `StreamNotifyClose` is guaranteed to end once the stream is closed, and we won't poll again.
                Some(request) = stream.next() => {
                    match request {
                        None => {
                            // stream has finished
                            finished.add_permits(1);

                            // shutdown the senders, as they can't be used anymore, this indicates to the delegate tasks that they should stop
                            // we don't cancel them, because they might still respond to the requests,
                            // they'll cancel themselves once the handle has finished
                            self.active.shutdown_senders();

                            // drop the sender (as we no longer can use it anyway)
                            // this will also stop the delegate task, once all transactions have finished
                            tx.take();
                        }
                        Some(Ok(request)) => {
                            let tx = tx.clone().expect("infallible; sender is only unavailble once the stream is exhausted");

                            if self.handle_request(tx.clone(), &tasks, request).await.is_break() {
                                tracing::info!("supervisor has been shut down");

                                break;
                            }
                        },
                        Some(Err(error)) => {
                            tracing::info!(?error, "malformed request");
                        }
                    }
                },
                result = &mut handle => {
                    match result {
                        Ok(Ok(())) => {},
                        Ok(Err(error)) => {
                            tracing::warn!(?error, "connection prematurely closed");
                        },
                        Err(error) => {
                            tracing::warn!(?error, "unable to join connection delegate task");
                        }
                    }

                    finished.add_permits(1);
                }
                _ = finished.acquire_many(2) => {
                    // both the stream and the sink have finished, we can terminate
                    // both the stream and sink have finished, so we don't need to shutdown the senders, they'll shutdown by themselves
                    break;
                }
                () = cancel.cancelled() => {
                    // cancel propagates down, so we don't need to shutdown the senders
                    break;
                }
            }
        }

        if let Err(error) = self
            .events
            .send(SessionEvent::SessionDropped { id: self.session })
        {
            tracing::debug!(?error, "no receivers connected");
        };
    }
}

#[cfg(test)]
mod test {
    use alloc::sync::Arc;
    use core::{future::ready, time::Duration};
    use std::io;

    use bytes::Bytes;
    use futures::prelude::sink::SinkExt;
    use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};
    use harpc_wire_protocol::{
        flags::BitFlagsOp,
        payload::Payload,
        protocol::{Protocol, ProtocolVersion},
        request::{
            begin::RequestBegin, body::RequestBody, flags::RequestFlags, frame::RequestFrame,
            header::RequestHeader, id::RequestId, procedure::ProcedureDescriptor,
            service::ServiceDescriptor, Request,
        },
        response::{
            begin::ResponseBegin,
            body::ResponseBody,
            flags::ResponseFlags,
            frame::ResponseFrame,
            header::ResponseHeader,
            kind::{ErrorCode, ResponseKind},
            Response,
        },
    };
    use libp2p::PeerId;
    use tokio::{
        sync::{broadcast, mpsc, Semaphore},
        task::JoinHandle,
    };
    use tokio_stream::wrappers::ReceiverStream;
    use tokio_util::{
        sync::{CancellationToken, PollSender},
        task::TaskTracker,
    };

    use super::{ConcurrencyLimit, ConnectionTask};
    use crate::{
        codec::ErrorEncoder,
        session::{
            error::TransactionError,
            server::{
                connection::{ConnectionDelegateTask, TransactionCollection},
                SessionConfig, SessionEvent, SessionId, Transaction,
            },
        },
    };

    struct StringEncoder;

    impl ErrorEncoder for StringEncoder {
        fn encode_error<E>(
            &self,
            error: E,
        ) -> impl Future<Output = crate::session::error::TransactionError> + Send
        where
            E: crate::codec::PlainError,
        {
            ready(TransactionError {
                code: error.code(),
                bytes: error.to_string().into_bytes().into(),
            })
        }

        fn encode_report<C>(
            &self,
            report: error_stack::Report<C>,
        ) -> impl Future<Output = crate::session::error::TransactionError> + Send {
            let code = report
                .request_ref::<ErrorCode>()
                .next()
                .copied()
                .unwrap_or(ErrorCode::INTERNAL_SERVER_ERROR);

            ready(TransactionError {
                code,
                bytes: report.to_string().into_bytes().into(),
            })
        }
    }

    struct Setup {
        output: mpsc::Receiver<Transaction>,
        events: broadcast::Receiver<SessionEvent>,

        stream: mpsc::Sender<error_stack::Result<Request, io::Error>>,
        sink: mpsc::Receiver<Response>,

        handle: JoinHandle<()>,
    }

    impl Setup {
        #[expect(clippy::significant_drop_tightening, reason = "False positive")]
        fn new(config: SessionConfig) -> Self {
            let cancel = CancellationToken::new();

            let (output_tx, output_rx) = mpsc::channel(8);
            let (events_tx, events_rx) = broadcast::channel(8);

            let (stream_tx, stream_rx) = mpsc::channel(8);
            let (sink_tx, sink_rx) = mpsc::channel(8);

            let permit = Arc::new(Semaphore::new(1))
                .try_acquire_owned()
                .expect("infallible");

            let task = ConnectionTask {
                peer: PeerId::random(),
                session: SessionId::new_unchecked(0x00),
                active: TransactionCollection::new(config, cancel.clone()),
                output: output_tx,
                events: events_tx,
                config,
                encoder: Arc::new(StringEncoder),
                _permit: permit,
            };

            let handle = tokio::spawn(task.run(
                PollSender::new(sink_tx),
                ReceiverStream::new(stream_rx),
                TaskTracker::new(),
                cancel,
            ));

            Self {
                output: output_rx,
                events: events_rx,
                stream: stream_tx,
                sink: sink_rx,
                handle,
            }
        }
    }

    fn make_request_header(flags: impl Into<RequestFlags>) -> RequestHeader {
        RequestHeader {
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: RequestId::new_unchecked(0x01),
            flags: flags.into(),
        }
    }

    fn make_request_begin(flags: impl Into<RequestFlags>, payload: impl Into<Bytes>) -> Request {
        Request {
            header: make_request_header(flags),
            body: RequestBody::Begin(RequestBegin {
                service: ServiceDescriptor {
                    id: ServiceId::new(0x01),
                    version: Version {
                        major: 0x00,
                        minor: 0x01,
                    },
                },
                procedure: ProcedureDescriptor {
                    id: ProcedureId::new(0x01),
                },
                payload: Payload::new(payload),
            }),
        }
    }

    fn make_request_frame(flags: impl Into<RequestFlags>, payload: impl Into<Bytes>) -> Request {
        Request {
            header: make_request_header(flags),
            body: RequestBody::Frame(RequestFrame {
                payload: Payload::new(payload),
            }),
        }
    }

    #[tokio::test]
    async fn stream_closed_does_not_stop_task() {
        let Setup {
            mut output,
            events: _events,
            stream,
            mut sink,
            handle,
        } = Setup::new(SessionConfig {
            no_delay: true,
            ..SessionConfig::default()
        });

        stream
            .send(Ok(make_request_begin(
                RequestFlags::EMPTY,
                b"hello" as &[_],
            )))
            .await
            .expect("should be able to send message");

        drop(stream);

        // we should get a transaction handle
        let transaction = output.recv().await.expect("should receive transaction");
        let mut transaction_sink = transaction.into_sink();

        // to verify that the task hasn't stopped yet we can simply send a message to the sink.
        transaction_sink
            .send(Ok(Bytes::from_static(b"world")))
            .await
            .expect("should be able to send message");

        // if we would drop the sink, the task would automatically stop

        // response should be received
        let response = sink.recv().await.expect("should receive response");
        assert_eq!(
            response.body,
            ResponseBody::Begin(ResponseBegin {
                kind: ResponseKind::Ok,
                payload: Payload::new(b"world" as &[_]),
            })
        );

        // the handle should still be alive
        assert!(!handle.is_finished());
    }

    #[tokio::test]
    async fn stream_closed_last_transaction_dropped_stops_task() {
        let Setup {
            mut output,
            events: _events,
            stream,
            mut sink,
            handle,
        } = Setup::new(SessionConfig::default());

        stream
            .send(Ok(make_request_begin(
                RequestFlags::EMPTY,
                b"hello" as &[_],
            )))
            .await
            .expect("should be able to send message");

        drop(stream);

        // we should get a transaction handle
        let transaction = output.recv().await.expect("should receive transaction");
        let mut transaction_sink = transaction.into_sink();

        // to verify that the task hasn't stopped yet we can simply send a message to the sink.
        transaction_sink
            .send(Ok(Bytes::from_static(b"world")))
            .await
            .expect("should be able to send message");

        // last transaction, means task will shutdown gracefully.
        drop(transaction_sink);

        // response should be received
        let response = sink.recv().await.expect("should receive response");
        assert_eq!(
            response.body,
            ResponseBody::Begin(ResponseBegin {
                kind: ResponseKind::Ok,
                payload: Payload::new(b"world" as &[_]),
            })
        );

        assert!(handle.is_finished());
    }

    #[tokio::test]
    #[ignore]
    async fn sink_closed_does_not_stop_task() {}

    #[tokio::test]
    async fn connection_closed() {
        let Setup {
            output: _output,
            events: _events,
            stream,
            sink,
            handle,
        } = Setup::new(SessionConfig::default());

        drop(stream);
        drop(sink);

        tokio::time::timeout(Duration::from_secs(1), handle)
            .await
            .expect("should finish within timeout")
            .expect("should not panic");
    }

    #[tokio::test]
    #[ignore]
    async fn transaction_limit_reached() {}

    #[tokio::test]
    #[ignore]
    async fn transaction_replace() {}

    #[tokio::test]
    #[ignore]
    async fn transaction() {}

    #[tokio::test]
    #[ignore]
    async fn transaction_multiple() {}

    #[tokio::test]
    #[ignore]
    async fn transaction_send_request_timeout() {}

    #[tokio::test]
    #[ignore]
    async fn transaction_send_output_timeout() {}

    #[tokio::test]
    #[ignore]
    async fn transaction_send_output_closed() {}

    #[tokio::test]
    #[ignore]
    async fn transaction_reclamation() {}

    #[tokio::test]
    #[ignore]
    async fn graceful_shutdown() {}

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

    #[tokio::test]
    async fn transaction_collection_acquire() {
        let collection =
            TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

        let (_permit, ..) = collection
            .acquire(RequestId::new_unchecked(0x01))
            .await
            .expect("should be able to acquire permit");

        assert_eq!(collection.storage.len(), 1);
    }

    #[tokio::test]
    async fn transaction_collection_acquire_override() {
        let collection =
            TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

        let (permit, ..) = collection
            .acquire(RequestId::new_unchecked(0x01))
            .await
            .expect("should be able to acquire permit");

        let cancel = permit.cancellation_token();

        let (_permit, ..) = collection
            .acquire(RequestId::new_unchecked(0x01))
            .await
            .expect("should be able to acquire permit");

        assert!(cancel.is_cancelled());
    }

    #[tokio::test]
    async fn transaction_collection_acquire_override_no_capacity() {
        // if we override and our capacity has no capacity left we won't be able to acquire a permit
        // this is a limitation of the current implementation, but also simplifies the logic quite a
        // bit.
        let collection = TransactionCollection::new(
            SessionConfig {
                per_connection_concurrent_transaction_limit: 1,
                ..SessionConfig::default()
            },
            CancellationToken::new(),
        );

        let (_permit, ..) = collection
            .acquire(RequestId::new_unchecked(0x01))
            .await
            .expect("should be able to acquire permit");

        collection
            .acquire(RequestId::new_unchecked(0x01))
            .await
            .expect_err("should not be able to acquire permit");
    }

    #[tokio::test]
    async fn transaction_collection_release() {
        let collection =
            TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

        let (_permit, ..) = collection
            .acquire(RequestId::new_unchecked(0x01))
            .await
            .expect("should be able to acquire permit");

        // release does nothing if the transaction is not in the collection
        collection.release(RequestId::new_unchecked(0x02)).await;
    }

    #[tokio::test]
    async fn transaction_collection_acquire_full_no_insert() {
        let collection = TransactionCollection::new(
            SessionConfig {
                per_connection_concurrent_transaction_limit: 0,
                ..SessionConfig::default()
            },
            CancellationToken::new(),
        );

        collection
            .acquire(RequestId::new_unchecked(0x01))
            .await
            .expect_err("should not be able to acquire permit");

        assert_eq!(collection.storage.len(), 0);
    }

    #[tokio::test]
    async fn transaction_permit_reclaim() {
        let collection =
            TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

        let (permit, ..) = collection
            .acquire(RequestId::new_unchecked(0x01))
            .await
            .expect("should be able to acquire permit");

        assert_eq!(collection.storage.len(), 1);

        drop(permit);

        assert_eq!(collection.storage.len(), 0);
    }

    #[tokio::test]
    async fn transaction_permit_reclaim_override() {
        let collection =
            TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

        let (permit_a, ..) = collection
            .acquire(RequestId::new_unchecked(0x01))
            .await
            .expect("should be able to acquire permit");

        assert_eq!(collection.storage.len(), 1);

        let (permit_b, ..) = collection
            .acquire(RequestId::new_unchecked(0x01))
            .await
            .expect("should be able to acquire permit");

        assert!(permit_a.cancellation_token().is_cancelled());
        assert_eq!(collection.storage.len(), 1);

        drop(permit_a);

        assert_eq!(collection.storage.len(), 1);

        drop(permit_b);

        assert_eq!(collection.storage.len(), 0);
    }

    static EXAMPLE_RESPONSE: Response = Response {
        header: ResponseHeader {
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: RequestId::new_unchecked(0x01),
            flags: ResponseFlags::EMPTY,
        },
        body: ResponseBody::Frame(ResponseFrame {
            payload: Payload::from_static(b"hello"),
        }),
    };

    #[tokio::test]
    async fn delegate() {
        let (tx, rx) = mpsc::channel::<Response>(8);
        let (sink, mut stream) = mpsc::channel::<Response>(8);

        let delegate = ConnectionDelegateTask {
            rx,
            sink: PollSender::new(sink),
        };

        let cancel = CancellationToken::new();

        let handle = tokio::spawn(delegate.run(cancel.clone()));

        tx.send(EXAMPLE_RESPONSE.clone())
            .await
            .expect("should be open");

        // stream should immediately receive the response
        let response = stream.recv().await.expect("should be open");
        assert_eq!(response, EXAMPLE_RESPONSE);

        cancel.cancel();

        tokio::time::timeout(Duration::from_secs(1), handle)
            .await
            .expect("should finish within timeout")
            .expect("should not panic")
            .expect("should not error");
    }

    #[tokio::test]
    async fn delegate_drop_stream() {
        let (tx, rx) = mpsc::channel::<Response>(8);
        let (sink, stream) = mpsc::channel::<Response>(8);

        let delegate = ConnectionDelegateTask {
            rx,
            sink: PollSender::new(sink),
        };

        let handle = tokio::spawn(delegate.run(CancellationToken::new()));

        drop(stream);

        tx.send(EXAMPLE_RESPONSE.clone())
            .await
            .expect("should be open");

        tokio::time::timeout(Duration::from_secs(1), handle)
            .await
            .expect("should finish within timeout")
            .expect("should not panic")
            .expect_err("should be unable to send to sink");
    }

    #[tokio::test]
    async fn delegate_drop_tx() {
        let (tx, rx) = mpsc::channel::<Response>(8);
        let (sink, _stream) = mpsc::channel::<Response>(8);

        let delegate = ConnectionDelegateTask {
            rx,
            sink: PollSender::new(sink),
        };

        let handle = tokio::spawn(delegate.run(CancellationToken::new()));

        drop(tx);

        tokio::time::timeout(Duration::from_secs(1), handle)
            .await
            .expect("should finish within timeout")
            .expect("should not panic")
            .expect("should not error");
    }
}
