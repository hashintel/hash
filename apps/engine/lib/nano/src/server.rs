//! Based on the server example at:
//! <https://github.com/nanomsg/nng/blob/708cdf1a8938b0ff128b134dcc2241ff99763209/demo/async/server.c>

use core::fmt;

use error_stack::{IntoReport, ResultExt};
use tokio::sync::mpsc;

use crate::{ErrorKind, Result, RECV_EXPECT_MESSAGE, SEND_EXPECT_MESSAGE};

// The number of NNG async I/O contexts to run concurrently.
// TODO: experiment with how large we can set this.
const NUM_WORKERS: usize = 4;

type MsgSender = mpsc::UnboundedSender<nng::Message>;
type MsgReceiver = mpsc::UnboundedReceiver<nng::Message>;

pub struct Server {
    // We don't use the socket and workers directly once the server is created. But,
    // we need to keep them alive for nng.
    _socket: nng::Socket,
    _workers: Vec<Worker>,
    receiver: MsgReceiver,
}

impl fmt::Debug for Server {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Server")
            .field("receiver", &self.receiver)
            .finish()
    }
}

struct Worker {
    // As in the Server, we need to keep _aio alive.
    _aio: nng::Aio,
}

impl Worker {
    /// Creates a new nano `Worker` at the give `socket` with the specified `sender` at the given
    /// `url`.
    ///
    /// # Errors
    ///
    /// Creating a `Worker` returns an error, if
    ///
    /// - the [`nng::Context`] could not be created.
    ///
    /// # Panics
    ///
    /// Creating a `Worker` may panic, if
    ///
    /// - a message could not be sent or received, or
    /// - a [`Sleep`] message occurred.
    ///
    /// [`Sleep`]: nng::AioResult::Sleep
    fn new(socket: &nng::Socket, sender: MsgSender, url: &str) -> Result<Self, nng::Error> {
        let ctx_orig = nng::Context::new(socket)
            .into_report()
            .attach_printable("Could not create context")?;
        let ctx = ctx_orig.clone();

        let socket_url = url.to_owned();
        tracing::debug!(%socket_url, "Creating nng worker listening on socket");
        // The unwraps in the Aio callback here are fine. If they panic, then it's a logic
        // error, and not something which can be recovered from.
        let aio = nng::Aio::new(move |aio, result| match result {
            nng::AioResult::Send(_) => {
                // Back to the recv state. The client will re-send if the reply failed
                ctx.recv(&aio).expect(RECV_EXPECT_MESSAGE);
            }
            nng::AioResult::Recv(Ok(msg)) => {
                // We've received a message. Now reply back
                ctx.send(&aio, nng::Message::new())
                    .expect(SEND_EXPECT_MESSAGE);
                sender.send(msg).expect(SEND_EXPECT_MESSAGE);
            }
            nng::AioResult::Recv(Err(nng::Error::Closed)) => {
                tracing::debug!(%socket_url, "aio context closed for socket listening");
            }
            nng::AioResult::Recv(Err(error)) => {
                tracing::error!(%error, "aio received an error");
            }
            nng::AioResult::Sleep(_) => {
                unreachable!("unexpected sleep");
            }
        })?;

        // Initialize the Aio in the Recv state
        ctx_orig
            .recv(&aio)
            .into_report()
            .attach_printable("Could not receive message from context")?;

        Ok(Self { _aio: aio })
    }
}

impl Server {
    /// Creates a new nano `Server` from the given `url`.
    ///
    /// # Errors
    ///
    /// Creating a `Server` returns [`ErrorKind::ServerCreation`], if
    ///
    /// - the nng socket could not be created, or
    /// - the worker could not be created from the provided `url`.
    pub fn new(url: &str) -> Result<Self> {
        let socket = nng::Socket::new(nng::Protocol::Rep0)
            .into_report()
            .attach_printable("Could not create socket")
            .change_context(ErrorKind::ServerCreation)?;
        socket
            .listen(url)
            .into_report()
            .attach_printable("Could not listen on socket")
            .change_context(ErrorKind::ServerCreation)?;

        let (sender, receiver) = mpsc::unbounded_channel();

        let workers = (0..NUM_WORKERS)
            .map(|_| {
                Worker::new(&socket, sender.clone(), url)
                    .attach_printable("Could not create worker")
                    .change_context(ErrorKind::ServerCreation)
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(Self {
            _socket: socket,
            _workers: workers,
            receiver,
        })
    }

    /// Receive a JSON-serialized message.
    ///
    /// # Errors
    ///
    /// Receiving a message returns [`ErrorKind::Receive`], if
    ///
    /// - the message could not be deserialized from JSON.
    ///
    /// # Panics
    ///
    /// Receiving a message panics, if
    ///
    /// - the message could not be received.
    pub async fn recv<T>(&mut self) -> Result<T>
    where
        for<'de> T: serde::Deserialize<'de>,
    {
        let msg = self.receiver.recv().await.expect(RECV_EXPECT_MESSAGE);
        serde_json::from_slice::<T>(msg.as_slice())
            .into_report()
            .attach_printable("Could not convert message from JSON")
            .change_context(ErrorKind::Receive)
    }
}
