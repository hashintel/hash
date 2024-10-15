use core::{
    marker::PhantomData,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::{Buf, BytesMut};
use futures::Stream;
use harpc_codec::{decode::ErrorDecoder, error::kind};
use harpc_types::error_code::ErrorCode;

struct PartialResponseError {
    code: ErrorCode,
    bytes: BytesMut,
}

impl PartialResponseError {
    fn finish<E, D>(self, decoder: D) -> Result<E, D::Error>
    where
        D: ErrorDecoder,
    {
        let mut buffer = self.bytes.freeze();
        let tag = buffer.get_u8();

        let tag = kind::Tag::from_u8(tag).unwrap();
        match tag {
            kind::Tag::NetworkError => decoder.decode_error(buffer),
            kind::Tag::Report => decoder.decode_report(buffer),
            kind::Tag::Recovery => decoder.decode_recovery(buffer),
        }
    }
}

pub struct PackError<B, D, E> {
    body: B,
    decoder: D,
    _marker: PhantomData<fn() -> *const E>,
}

impl<B, D, E> PackError<B, D, E> {
    pub fn new(body: B, decoder: D) -> Self {
        Self {
            body,
            decoder,
            _marker: PhantomData,
        }
    }
}

impl<B, D, E> Stream for PackError<B, D, E> {
    type Item = Result<B, E>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        todo!()
    }
}
