use std::time::Duration;

use nng::options::{protocol::reqrep::ResendTime, Options, ReconnectMaxTime, ReconnectMinTime};
use tokio::sync::{mpsc, oneshot};

use super::{
    error::{Error, Result},
    spmc,
};

lazy_static::lazy_static! {
    // Time after which NNG will try to retry sending a message
    static ref RESEND_TIME: Duration = Duration::from_secs(1);
    // Minimum time to wait before attempting to retry NNG dial
    static ref RECCONNECT_MIN_TIME: Duration = Duration::from_millis(50);
    // Maximum time to wait for an NNG dial to succeed
    static ref RECCONNECT_MAX_TIME: Duration = Duration::from_secs(10);
}

type Request = (nng::Message, oneshot::Sender<Result<()>>);

/// Client represents the request side of the NNG rep/req protocol.
#[allow(
    missing_debug_implementations,
    reason = "WorkerHandle does not implement Debug"
)]
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

impl Worker {
    fn new(url: &str, request_rx: spmc::Receiver<Request>) -> Result<Self> {
        let socket = nng::Socket::new(nng::Protocol::Req0)?;

        let builder = nng::DialerBuilder::new(&socket, url)?;
        builder.set_opt::<ReconnectMaxTime>(Some(*RECCONNECT_MAX_TIME))?;
        builder.set_opt::<ReconnectMinTime>(Some(*RECCONNECT_MIN_TIME))?;
        let dialer = builder.start(false).map_err(|e| e.1)?;

        let ctx = nng::Context::new(&socket)?;
        ctx.set_opt::<ResendTime>(Some(*RESEND_TIME))?;

        // There will only ever be one message in the channel. But, it needs to be
        // unbounded because we can't .await inside an nng::Aio.
        // TODO: we've upgraded tokio, so could use a blocking wait now. Test this
        // to see if it works.
        let (reply_tx, reply_rx) = mpsc::unbounded_channel();

        let ctx_clone = ctx.clone();
        let aio = nng::Aio::new(move |aio, res| match res {
            nng::AioResult::Send(_) => {
                // The message was sent. Wait for the reply to arrive.
                ctx_clone.recv(&aio).unwrap();
            }
            nng::AioResult::Recv(res) => {
                // We received the reply.
                reply_tx.send(res.map(|_| ()).map_err(Error::from)).unwrap();
            }
            nng::AioResult::Sleep(_) => {
                panic!("unexpected sleep");
            }
        })?;

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
        if let Err((_, e)) = self.ctx.send(&self.aio, msg) {
            sender.send(Err(Error::from(e))).unwrap();
            return;
        }

        // Wait for a reply from the server
        let res = self.reply_rx.recv().await.unwrap();
        sender.send(res).unwrap();
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
    /// Create a new `Client` with a given number of background workers. Each worker
    /// provides one extra concurrent request.
    ///
    /// # Errors
    pub fn new(url: &str, num_workers: usize) -> Result<Self> {
        let (sender, receiver) = spmc::channel(num_workers);

        let workers = (0..num_workers)
            .map(|_| {
                let mut worker = Worker::new(url, receiver.clone())?;
                // let (stop_tx, stop_rx) = mpsc::channel(1);
                let (stop_tx, stop_rx) = mpsc::unbounded_channel();
                let handle = tokio::spawn(async move { worker.run(stop_rx).await });
                Ok(WorkerHandle {
                    _handle: handle,
                    stop_tx,
                })
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(Client { workers, sender })
    }

    /// Sends a JSON-serializable message.
    pub async fn send<T: serde::Serialize>(&mut self, msg: &T) -> Result<()> {
        let mut nng_msg = nng::Message::new();
        serde_json::to_writer(&mut nng_msg, msg)?;

        let (tx, rx) = oneshot::channel();
        self.sender.send((nng_msg, tx)).await.unwrap();
        rx.await.unwrap()
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        for worker in self.workers.iter() {
            worker.stop_tx.send(()).unwrap();
        }
    }
}
