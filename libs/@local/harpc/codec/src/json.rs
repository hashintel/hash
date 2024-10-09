use core::{
    error::Error,
    fmt::Display,
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::{Buf, BufMut, Bytes, BytesMut};
use futures_core::Stream;
use futures_util::stream::StreamExt;
use serde::{de::DeserializeOwned, ser::Error as _};

use crate::{decode::Decoder, encode::Encoder};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct JsonCodec;

impl JsonCodec {
    // 1E is the ASCII record separator character, and is invalid in JSON.
    const SEPARATOR: u8 = b'\x1E';
}

impl Encoder for JsonCodec {
    type Buf = Bytes;
    type Error = serde_json::Error;

    fn encode<T>(
        self,
        input: impl Stream<Item = T> + Send + Sync,
    ) -> impl Stream<Item = Result<Self::Buf, Self::Error>> + Send + Sync
    where
        T: serde::Serialize,
    {
        input.map(|item| {
            let buf = BytesMut::new();
            let mut writer = buf.writer();

            serde_json::to_writer(&mut writer, &item).map(|()| {
                let mut buf = writer.into_inner();
                buf.put_u8(Self::SEPARATOR);
                buf.freeze()
            })
        })
    }
}

impl Decoder for JsonCodec {
    type Error = serde_json::Error;

    fn decode<T, B, E>(
        self,
        items: impl Stream<Item = Result<B, E>> + Send + Sync,
    ) -> impl Stream<Item = Result<T, Self::Error>> + Send + Sync
    where
        T: serde::de::DeserializeOwned,
        B: Buf,
        E: Error,
    {
        JsonDecoderStream::new(items)
    }
}

pin_project_lite::pin_project! {
    pub struct JsonDecoderStream<T, S> {
        #[pin]
        inner: Option<S>,
        buffer: BytesMut,
        _marker: core::marker::PhantomData<fn() -> *const T>,
    }
}

impl<T, S> JsonDecoderStream<T, S> {
    pub fn new(inner: S) -> Self {
        Self {
            inner: Some(inner),
            buffer: BytesMut::new(),
            _marker: core::marker::PhantomData,
        }
    }

    fn poll_item(mut self: Pin<&mut Self>, offset: usize) -> Option<Result<T, serde_json::Error>>
    where
        T: DeserializeOwned,
    {
        let this = self.as_mut().project();

        let index = memchr::memchr(JsonCodec::SEPARATOR, &this.buffer[offset..])?;

        let mut message = this.buffer.split_to(offset + index + 1);
        // remove the last byte, which is the separator
        message.truncate(message.len() - 1);

        Some(serde_json::from_slice(&message))
    }
}

impl<T, S, B, E> Stream for JsonDecoderStream<T, S>
where
    S: Stream<Item = Result<B, E>>,
    B: Buf,
    T: DeserializeOwned,
    E: Display,
{
    type Item = Result<T, serde_json::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // check if we have a full message in the buffer, in theory multiple messages could be in
        // the buffer at the same time, this guards against that.
        if let Some(value) = Self::poll_item(self.as_mut(), 0) {
            return Poll::Ready(Some(value));
        }

        loop {
            let mut this = self.as_mut().project();
            // we use an option here to avoid repeated polling of the inner stream once it has
            // returned `None`, as that would lead to potentially undefined behavior.
            let inner = this.inner.as_mut().as_pin_mut();

            let Some(inner) = inner else {
                // the underlying stream has already returned `None`, we now only flush the
                // remaining buffer.
                if let Some(value) = Self::poll_item(self.as_mut(), 0) {
                    return Poll::Ready(Some(value));
                }

                return Poll::Ready(None);
            };

            let Some(value) = ready!(inner.poll_next(cx)) else {
                // drop the inner stream, as we're done with it
                this.inner.set(None);

                // potentially we still have items in the buffer, try to decode them.
                if let Some(value) = Self::poll_item(self.as_mut(), 0) {
                    return Poll::Ready(Some(value));
                }

                return Poll::Ready(None);
            };

            let offset = match value {
                Ok(buf) => {
                    let offset = this.buffer.len();
                    this.buffer.put(buf);
                    offset
                }
                Err(error) => return Poll::Ready(Some(Err(serde_json::Error::custom(error)))),
            };

            // look if we found a separator between the offset and the end of the buffer
            if let Some(value) = Self::poll_item(self.as_mut(), offset) {
                return Poll::Ready(Some(value));
            }

            // if not we continue to the next iteration
        }
    }
}
