use tokio::sync::mpsc;

/// Based on the server example at:
/// https://github.com/nanomsg/nng/blob/708cdf1a8938b0ff128b134dcc2241ff99763209/demo/async/server.c
use super::error::{Error, Result};

// The number of NNG async I/O contexts to run concurrently.
// TODO: experiment with how large we can set this.
const NUM_WORKERS: usize = 4;

type MsgSender = mpsc::UnboundedSender<nng::Message>;
type MsgReceiver = mpsc::UnboundedReceiver<nng::Message>;

#[allow(
    missing_debug_implementations,
    reason = "Worker does not implement Debug"
)]
pub struct Server {
    // We don't use the socket and workers directly once the server is created. But,
    // we need to keep them alive for nng.
    _socket: nng::Socket,
    _workers: Vec<Worker>,
    receiver: MsgReceiver,
}

struct Worker {
    // As in the Server, we need to keep _aio alive.
    _aio: nng::Aio,
}

impl Worker {
    fn new(socket: &nng::Socket, sender: MsgSender, url: &str) -> Result<Self> {
        let ctx_orig = nng::Context::new(socket)?;
        let ctx = ctx_orig.clone();

        let socket_url = url.to_string();
        tracing::debug!("Creating nng worker listening on socket: {}", socket_url);
        // The unwraps in the Aio callback here are fine. If they panic, then it's a logic
        // error, and not something which can be recovered from.
        let aio = nng::Aio::new(move |aio, res| match res {
            nng::AioResult::Send(_) => {
                // Back to the recv state. The client will re-send if the reply failed
                ctx.recv(&aio).unwrap();
            }
            nng::AioResult::Recv(Ok(msg)) => {
                // We've received a message. Now reply back
                ctx.send(&aio, nng::Message::new()).unwrap();
                sender.send(msg).unwrap();
            }
            nng::AioResult::Recv(Err(nng::Error::Closed)) => {
                tracing::debug!("aio context closed for socket listening on: {socket_url}");
            }
            nng::AioResult::Recv(Err(err)) => {
                tracing::error!("aio receive error: {err}");
            }
            nng::AioResult::Sleep(_) => {
                panic!("unexpected sleep");
            }
        })?;

        // Initialize the Aio in the Recv state
        ctx_orig.recv(&aio)?;

        Ok(Worker { _aio: aio })
    }
}

impl Server {
    pub fn new(url: &str) -> Result<Self> {
        let socket = nng::Socket::new(nng::Protocol::Rep0)?;
        socket.listen(url)?;

        let (sender, receiver) = mpsc::unbounded_channel();

        let workers = (0..NUM_WORKERS)
            .map(|_| Worker::new(&socket, sender.clone(), url))
            .collect::<Result<Vec<_>>>()?;

        Ok(Server {
            _socket: socket,
            _workers: workers,
            receiver,
        })
    }

    /// Receive a JSON-serialized message.
    pub async fn recv<T>(&mut self) -> Result<T>
    where
        for<'de> T: serde::Deserialize<'de>,
    {
        let msg = self.receiver.recv().await.unwrap();
        serde_json::from_slice::<T>(msg.as_slice()).map_err(Error::from)
    }
}
