mod behaviour;
mod client;
mod error;
mod server;
mod task;

use std::io;

use error_stack::{Result, ResultExt};
use futures::{prelude::stream::StreamExt, Sink, Stream};
use harpc_wire_protocol::{request::Request, response::Response};
use libp2p::{PeerId, StreamProtocol};
use libp2p_stream::Control;
use tokio::{
    io::BufStream,
    sync::{mpsc, oneshot},
};
use tokio_util::{codec::Framed, compat::FuturesAsyncReadCompatExt, sync::CancellationToken};

use self::{
    client::ClientCodec,
    error::{OpenStreamError, TransportError},
    server::ServerCodec,
    task::Task,
};
use crate::config::Config;

const PROTOCOL_NAME: StreamProtocol = StreamProtocol::new("/harpc/1.0.0");

pub struct TransportLayer {
    tx: mpsc::Sender<self::task::Command>,

    cancel: CancellationToken,
}

impl TransportLayer {
    pub fn start(
        config: Config,
        transport: impl self::task::Transport,
    ) -> Result<Self, TransportError> {
        let task = Task::new(config, transport)?;
        let cancel = CancellationToken::new();
        let tx = task.sender();

        tokio::spawn(task.run(cancel.clone()));

        Ok(Self { tx, cancel })
    }

    fn cancellation_token(&self) -> CancellationToken {
        self.cancel.clone()
    }

    async fn control(&self) -> Result<Control, TransportError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(self::task::Command::IssueControl { tx })
            .await
            .change_context(TransportError)?;

        rx.await.change_context(TransportError)
    }

    pub(crate) async fn listen(
        &self,
    ) -> Result<
        impl futures::Stream<
            Item = (
                PeerId,
                impl Sink<Response>,
                impl Stream<Item = Result<Request, io::Error>>,
            ),
        >,
        TransportError,
    > {
        let mut control = self.control().await?;

        let incoming = control
            .accept(PROTOCOL_NAME)
            .change_context(TransportError)?;

        Ok(incoming.map(|(peer, stream)| {
            let stream = stream.compat();
            let stream = BufStream::new(stream);
            let stream = Framed::new(stream, ServerCodec::new());

            let (sink, stream) = stream.split();

            (peer, sink, stream)
        }))
    }

    pub(crate) async fn dial(
        &self,
        peer: PeerId,
    ) -> Result<
        (
            impl Sink<Request>,
            impl Stream<Item = Result<Response, io::Error>>,
        ),
        TransportError,
    > {
        let mut control = self.control().await?;

        let stream = control
            .open_stream(peer, PROTOCOL_NAME)
            .await
            .map_err(OpenStreamError::new)
            .change_context(TransportError)?;

        let stream = stream.compat();
        let stream = BufStream::new(stream);
        let stream = Framed::new(stream, ClientCodec::new());

        let (sink, stream) = stream.split();

        Ok((sink, stream))
    }
}
