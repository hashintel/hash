use std::io::Cursor;

use error_stack::{Report, ResultExt};
use flume::{TryRecvError, TrySendError};
use futures::StreamExt;
use harpc_wire_protocol::{
    codec::Decode,
    request::{codec::DecodeError, Request},
};
use tokio::{select, task::JoinSet};
use tokio_util::{
    bytes::{Bytes, BytesMut},
    codec::Decoder,
    sync::{CancellationToken, DropGuard},
};

type DecoderResult = error_stack::Result<Option<Request>, DecodeError>;

pub(crate) struct WireProtocolRequestDecoder {
    capacity: usize,
    receiver: flume::Receiver<error_stack::Result<Request, DecodeError>>,
    transmit: flume::Sender<Bytes>,

    _drop: DropGuard,
}

impl WireProtocolRequestDecoder {
    fn spawn(capacity: usize) -> Self {
        let (mut tx_req, rx_req) = flume::bounded(capacity);
        let (tx_bytes, rx_bytes) = flume::unbounded();

        let cancel = CancellationToken::new();
        let drop = cancel.clone().drop_guard();

        tokio::spawn(async move {
            let mut tasks = JoinSet::new();
            let mut rx_bytes = rx_bytes.into_stream();

            loop {
                select! {
                        _ = cancel.cancelled() => {
                            // the task was cancelled, we should exit
                            break;
                        }
                        Some(request) = tasks.join_next() => {
                            // this is the task that will be spawned
                            let request = request.change_context(DecodeError).flatten();

                            if let Err(error) = tx_req.send_async(request).await {
                                tracing::error!("receiver has been shutdown");
                                break;
                            }

                        }
                        Some(bytes) = rx_bytes.next() => {
                            // a new request was received
                            let cursor = Cursor::new(bytes);
                            tasks.spawn(Request::decode(cursor, ()));
                        }

                }
            }
        });

        Self {
            capacity,
            receiver: rx_req,
            transmit: tx_bytes,
            _drop: drop,
        }
    }
}

impl WireProtocolRequestDecoder {
    fn next(&mut self) -> DecoderResult {
        match self.receiver.try_recv() {
            Err(TryRecvError::Empty) => Ok(None),
            Err(TryRecvError::Disconnected) => Err(DecodeError::from("receiver has been shutdown")),
            Ok(request) => request.map(Some),
        }
    }
}

impl Decoder for WireProtocolRequestDecoder {
    type Error = Report<DecodeError>;
    type Item = Request;

    fn decode(&mut self, src: &mut BytesMut) -> DecoderResult {
        // TODO: this won't work because requests can be reordered using this technique

        // try to remove any pending requests
        match self.next() {
            Ok(None) => {}
            result => return result,
        }

        if self.transmit.len() > self.capacity {
            return Ok(None);
        }

        // header is always 32 bytes
        if src.len() < 32 {
            return Ok(None);
        }

        // the body length is in bytes 30 and 31
        let length = u16::from_be_bytes([src[30], src[31]]) as usize;

        // check if the body is fully received
        if src.len() < 32 + length {
            // We reserve more space in the buffer. This is not strictly
            // necessary, but is a good idea performance-wise.
            src.reserve(32 + length - src.len());

            return Ok(None);
        }

        let data = src.split_to(32 + length);

        // we have the data, now it is time to decode it, the decode is a fallible operation, that
        // is async, therefore we need to spawn a task
        match self.transmit.try_send(data.freeze()) {
            Err(TrySendError::Full(_)) => unreachable!(),
            Err(TrySendError::Disconnected(_)) => {
                Err(DecodeError::from("receiver has been shutdown").into())
            }
            Ok(()) => self.next(),
        }
    }
}
