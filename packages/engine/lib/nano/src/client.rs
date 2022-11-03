use core::{fmt, time::Duration};

use error_stack::{report, IntoReport, ResultExt};
use nng::options::{protocol::reqrep::ResendTime, Options, ReconnectMaxTime, ReconnectMinTime};
use tokio::sync::{mpsc, oneshot};

use crate::{spmc, ErrorKind, Result, RECV_EXPECT_MESSAGE, SEND_EXPECT_MESSAGE};

const RESEND_TIME: Duration = Duration::from_secs(1);
const RECONNECT_MIN_TIME: Duration = Duration::from_millis(50);
const RECONNECT_MAX_TIME: Duration = Duration::from_secs(10);

type Request = (nng::Message, oneshot::Sender<Result<()>>);

/// Client represents the request side of the NNG rep/req protocol.
#[derive(Debug)]
pub struct Client {
    workers: Vec<WorkerHandle>,
    sender: spmc::Sender<Request>,
}

struct Worker {
    // We need to keep the socket alive as the NNG context is bound to it.
    _socket: nng::Socket,
    _dialer: nng::Dialer,
    aio: nng::Aio,
    ctx: nng::Context,
    request_rx: spmc::Receiver<Request>,
    reply_rx: mpsc::UnboundedReceiver<Result<()>>,
}

struct WorkerHandle {
    _handle: tokio::task::JoinHandle<()>,
    stop_tx: mpsc::UnboundedSender<()>,
}

impl fmt::Debug for WorkerHandle {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("WorkerHandle { ... }")
    }
}

impl Worker {
    fn new(url: &str, request_rx: spmc::Receiver<Request>) -> Result<Self, nng::Error> {
        let socket = nng::Socket::new(nng::Protocol::Req0)
            .into_report()
            .attach_printable("Could not create nng socket")?;

        let builder = nng::DialerBuilder::new(&socket, url)
            .into_report()
            .attach_printable("Could not create nng dialer")?;
        builder
            .set_opt::<ReconnectMaxTime>(Some(RECONNECT_MAX_TIME))
            .into_report()
            .attach_printable_lazy(|| {
                format!("Could not set maximum reconnection time to {RECONNECT_MAX_TIME:?}")
            })?;
        builder
            .set_opt::<ReconnectMinTime>(Some(RECONNECT_MIN_TIME))
            .into_report()
            .attach_printable_lazy(|| {
                format!("Could not set minimum reconnection time to {RECONNECT_MIN_TIME:?}")
            })?;
        let dialer = builder
            .start(false)
            .map_err(|(_, error)| error)
            .into_report()
            .attach_printable("Could not start nng dialer")?;

        let ctx = nng::Context::new(&socket)
            .into_report()
            .attach_printable("Could not create nng context")?;
        ctx.set_opt::<ResendTime>(Some(RESEND_TIME))
            .into_report()
            .attach_printable_lazy(|| format!("Could not set resend time to {RESEND_TIME:?}"))?;

        // There will only ever be one message in the channel. But, it needs to be
        // unbounded because we can't .await inside an nng::Aio.
        // TODO: we've upgraded tokio, so could use a blocking wait now. Test this
        // to see if it works.
        let (reply_tx, reply_rx) = mpsc::unbounded_channel();

        let ctx_clone = ctx.clone();
        let aio = nng::Aio::new(move |aio, aio_result| match aio_result {
            nng::AioResult::Send(_) => {
                // The message was sent. Wait for the reply to arrive.
                ctx_clone.recv(&aio).expect(RECV_EXPECT_MESSAGE);
            }
            nng::AioResult::Recv(message) => {
                // We received the reply.
                reply_tx
                    .send(
                        message
                            .map(|_| ())
                            .into_report()
                            .change_context(ErrorKind::Receive),
                    )
                    .expect(SEND_EXPECT_MESSAGE);
            }
            nng::AioResult::Sleep(_) => {
                unreachable!("unexpected sleep");
            }
        })
        .into_report()
        .attach_printable("Could not create asynchronous I/O context")?;

        Ok(Self {
            _socket: socket,
            _dialer: dialer,
            aio,
            ctx,
            request_rx,
            reply_rx,
        })
    }

    async fn handle_request(&mut self, (msg, sender): Request) {
        // Send the message to the server
        if let Err(report) = self
            .ctx
            .send(&self.aio, msg)
            .map_err(|(_, error)| report!(error).change_context(ErrorKind::Send))
        {
            sender.send(Err(report)).expect(SEND_EXPECT_MESSAGE);
            return;
        }

        // Wait for a reply from the server
        let recv_result = self.reply_rx.recv().await.expect(RECV_EXPECT_MESSAGE);
        sender.send(recv_result).expect(SEND_EXPECT_MESSAGE);
    }

    async fn run(&mut self, mut stop_rx: mpsc::UnboundedReceiver<()>) {
        loop {
            tokio::select! {
                Some(req) = self.request_rx.recv() => self.handle_request(req).await,
                _ = stop_rx.recv() => break,
            }
        }
    }
}

impl Client {
    /// Create a new `Client` with a given number of background workers.
    ///
    /// Each worker provides one extra concurrent request.
    ///
    /// # Errors
    ///
    /// Creating a `Client` returns [`ErrorKind::ClientCreation`] if
    ///
    /// - a worker could not be created from the provided url.
    pub fn new(url: &str, num_workers: usize) -> Result<Self> {
        let (sender, receiver) = spmc::channel(num_workers);

        let workers = (0..num_workers)
            .map(|_| {
                let mut worker = Worker::new(url, receiver.clone())
                    .attach_printable("Could not create nng worker")
                    .change_context(ErrorKind::ClientCreation)?;
                // let (stop_tx, stop_rx) = mpsc::channel(1);
                let (stop_tx, stop_rx) = mpsc::unbounded_channel();
                let handle = tokio::spawn(async move { worker.run(stop_rx).await });
                Ok(WorkerHandle {
                    _handle: handle,
                    stop_tx,
                })
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(Self { workers, sender })
    }

    /// Sends a JSON-serializable message.
    ///
    /// # Errors
    ///
    /// Sending a message returns an error, if
    ///
    /// - the message could not be serialized to JSON.
    ///
    /// Creating a `Client` returns [`ErrorKind::Send`] if
    ///
    /// - a worker could not be created from the provided url.
    ///
    /// # Panics
    ///
    /// Sending a message panics, if
    ///
    /// - the message could not be sent, or
    /// - the response could not be received
    pub async fn send<T: serde::Serialize + Sync>(&mut self, msg: &T) -> Result<()> {
        let mut nng_msg = nng::Message::new();
        serde_json::to_writer(&mut nng_msg, msg)
            .into_report()
            .attach_printable("Could not serialize message")
            .change_context(ErrorKind::Send)?;

        let (tx, rx) = oneshot::channel();
        self.sender
            .send((nng_msg, tx))
            .await
            .expect(SEND_EXPECT_MESSAGE);
        rx.await
            .expect(RECV_EXPECT_MESSAGE)
            .attach_printable("Could not receive response")
            .change_context(ErrorKind::Send)
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        for worker in &self.workers {
            worker.stop_tx.send(()).expect(SEND_EXPECT_MESSAGE);
        }
    }
}
