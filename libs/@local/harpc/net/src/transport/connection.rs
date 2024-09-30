use core::{
    pin::Pin,
    task::{Context, Poll},
};

use futures::{
    Stream,
    prelude::stream::StreamExt as _,
    ready,
    stream::{SplitSink, SplitStream},
};
use harpc_wire_protocol::{request::Request, response::Response};
use libp2p::PeerId;
use tokio::io::BufStream;
use tokio_util::{
    codec::Framed,
    compat::{Compat, FuturesAsyncReadCompatExt as _},
};

use super::{client::ClientCodec, server::ServerCodec};

type IncomingDuplex = Framed<BufStream<Compat<libp2p::Stream>>, ServerCodec>;
type IncomingSink = SplitSink<IncomingDuplex, Response>;
type IncomingStream = SplitStream<IncomingDuplex>;

pub struct IncomingConnection {
    pub peer_id: PeerId,

    pub sink: IncomingSink,
    pub stream: IncomingStream,
}

pin_project_lite::pin_project! {
    pub struct IncomingConnections {
        #[pin]
        inner: libp2p_stream::IncomingStreams
    }
}

impl IncomingConnections {
    #[must_use]
    pub(crate) const fn new(inner: libp2p_stream::IncomingStreams) -> Self {
        Self { inner }
    }
}

impl Stream for IncomingConnections {
    type Item = IncomingConnection;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.project();
        let Some((peer_id, stream)) = ready!(this.inner.poll_next(cx)) else {
            return Poll::Ready(None);
        };

        let stream = stream.compat();
        let stream = BufStream::new(stream);
        let stream = Framed::new(stream, ServerCodec::new());

        let (sink, stream) = stream.split();

        Poll::Ready(Some(IncomingConnection {
            peer_id,

            sink,
            stream,
        }))
    }
}

type OutgoingDuplex = Framed<BufStream<Compat<libp2p::Stream>>, ClientCodec>;
type OutgoingSink = SplitSink<OutgoingDuplex, Request>;
type OutgoingStream = SplitStream<OutgoingDuplex>;

#[derive(Debug)]
pub struct OutgoingConnection {
    pub peer_id: PeerId,

    pub sink: OutgoingSink,
    pub stream: OutgoingStream,
}
