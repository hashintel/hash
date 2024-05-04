use bytes::{Buf, Bytes, BytesMut};
use bytes_utils::SegmentedBuf;
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::{
        flags::{RequestFlag, RequestFlags},
        id::RequestId,
        Request,
    },
    response::{header::ResponseHeader, Response},
};
use libp2p::PeerId;
use tokio::{select, sync::mpsc};
use tokio_util::sync::CancellationToken;

use super::session::Session;

struct Transaction {
    peer: PeerId,
    id: RequestId,
    session: Session,

    sink: mpsc::Sender<Bytes>,
    stream: mpsc::Receiver<Bytes>,
}

struct TransactionSendDelegateTask {
    id: RequestId,

    tx: mpsc::Sender<Response>,
    rx: mpsc::Receiver<Bytes>,
}

impl TransactionSendDelegateTask {
    async fn run(mut self, cancel: CancellationToken) {
        // we cannot simply forward here, because we want to be able to send the end of request and
        // buffer the response into the least amount of packages possible
        let mut buffer = SegmentedBuf::new();

        loop {
            let bytes = select! {
                bytes = self.rx.recv() => bytes,
                () = cancel.cancelled() => {
                    break;
                },
            };

            let Some(bytes) = bytes else {
                // todo: send the rest of the buffer (segmented) with the last having the
                // `EndOfResponse` flag
                break;
            };

            buffer.push(bytes);

            while buffer.remaining() > Payload::MAX_SIZE {
                let payload = buffer.copy_to_bytes(Payload::MAX_SIZE);

                // TODO: if this is the first? mhh this doesn't track with begin vs. error really
                // how about a second channel? nah that kinda seems like a waste
                // maybe the sink should be `Result<Bytes, ServiceError>`, and then on error we just
                // serialize and send the error, the problem tho: we're dependent on the
                // serialization of the `ServiceError` that way and we really shouldn't. Then again,
                // it is quite elegant? The problem is just the serialization of the error. Should
                // we have a trait that does that, that we then just simply attach, but it feels
                // wrong to do that on this layer. What if instead we have `Result<Bytes, Error>`
                // where Error {code: ErrorCode, bytes: Bytes}, sure that means no error streaming,
                // but that should be fine.
                let response = Response {
                    header: ResponseHeader {
                        protocol: Protocol {
                            version: ProtocolVersion::V1,
                        },
                        request_id: self.id,
                        flags: RequestFlags::empty(),
                    },
                    body: todo!(),
                };
            }
        }
    }
}

struct TransactionRecvDelegateTask {
    id: RequestId,

    tx: mpsc::Sender<Bytes>,
    rx: mpsc::Receiver<Request>,
}

impl TransactionRecvDelegateTask {
    async fn run(mut self, cancel: CancellationToken) {
        // TODO: timeout is done at a later layer, not here, this just delegates.

        loop {
            let request = select! {
                Some(request) = self.rx.recv() => request,
                () = cancel.cancelled() => {
                    break;
                },
            };

            // send bytes to the other end, and close if we're at the end
            let is_end = request.header.flags.contains(RequestFlag::EndOfRequest);
            let bytes = request.body.into_payload().into_bytes();

            let result = self.tx.send(bytes).await;

            if is_end {
                // TODO: close pipe to indicate request has finished
            }

            if let Err(error) = result {
                // TODO: the upper layer is responsible for notifying the other end as to why the
                // connection was closed.
                tracing::error!(?error, "connection has been prematurely closed");

                break;
            }
        }
    }
}

// we essentially need two tasks per transaction/connection/session, one that delegates recv and one
// that delegates send

pub(crate) struct TransactionTask {
    request: mpsc::Receiver<Request>,
    response: mpsc::Sender<Response>,

    recv: mpsc::Receiver<Bytes>,
    send: mpsc::Sender<Bytes>,
}

impl TransactionTask {
    fn run(mut self, cancel: CancellationToken) {
        // Not necessary, but protects us from canceling other adjacent tasks if we are canceled.
        let cancel = cancel.child_token();

        let cancel_recv = cancel.child_token();
        let cancel_send = cancel.child_token();

        tokio::spawn(async move {
            loop {
                let request = select! {
                    Some(request) = self.request.recv() => {
                        // send bytes to the other end
                        request
                    },
                    () = cancel_recv.cancelled() => {
                        break;
                    }
                };

                // send bytes to the other end
                let Err(error) = self
                    .send
                    .send(request.body.into_payload().into_bytes())
                    .await
                else {
                    // we haven't failed so can safely continue
                    continue;
                };

                // if we failed we can also bail out of the recv, send task because the connection
                // has been closed either way. before we do we send a response
                cancel.cancel();
            }
        });

        tokio::spawn(async move {
            let mut buffer = BytesMut::new();

            loop {
                let response = select! {
                    bytes = self.recv.recv() => bytes,
                    () = cancel_send.cancelled() => {
                        break;
                    }
                };

                // if `None` then we're at the end of the stream
            }
        });
    }
}
