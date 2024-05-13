use core::{
    pin::Pin,
    task::{Context, Poll},
};

use futures::{
    prelude::stream::StreamExt,
    ready,
    stream::{SplitSink, SplitStream},
    Stream,
};
use harpc_wire_protocol::response::Response;
use libp2p::PeerId;
use tokio::io::BufStream;
use tokio_util::{
    codec::Framed,
    compat::{Compat, FuturesAsyncReadCompatExt},
};

use super::server::ServerCodec;

type InternalDuplex = Framed<BufStream<Compat<libp2p::Stream>>, ServerCodec>;

type ResponseSink = SplitSink<InternalDuplex, Response>;
type RequestStream = SplitStream<InternalDuplex>;

pub struct IncomingConnection {
    pub peer_id: PeerId,

    pub sink: ResponseSink,
    pub stream: RequestStream,
}

pin_project_lite::pin_project! {
    pub struct IncomingConnections {
        #[pin]
        pub(crate) inner: libp2p_stream::IncomingStreams
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
