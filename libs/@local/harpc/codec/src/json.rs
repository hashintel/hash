use core::{
    error::Error,
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::{Buf, BufMut, Bytes, BytesMut};
use error_stack::Report;
use futures_core::Stream;
use futures_util::stream::StreamExt;
use serde::{de::DeserializeOwned, ser::Error as _};

use crate::{
    decode::{Decoder, ErrorDecoder},
    encode::{Encoder, ErrorEncoder},
    error::{EncodedError, ErrorBuffer, ErrorCode, NetworkError},
};

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
                // TODO: we lose quite a bit of information here, any way to retrieve it?
                Err(_error) => {
                    return Poll::Ready(Some(Err(serde_json::Error::custom(
                        "underlying stream returned an error",
                    ))));
                }
            };

            // look if we found a separator between the offset and the end of the buffer
            if let Some(value) = Self::poll_item(self.as_mut(), offset) {
                return Poll::Ready(Some(value));
            }

            // if not we continue to the next iteration
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct JsonError<T> {
    message: String,
    details: T,
}

impl ErrorEncoder for JsonCodec {
    fn encode_error<E>(self, error: E) -> EncodedError
    where
        E: Error + serde::Serialize,
    {
        let code = error.code();

        let buffer = ErrorBuffer::error();
        let mut writer = buffer.writer();

        if let Err(error) = serde_json::to_writer(&mut writer, &JsonError {
            message: error.to_string(),
            details: error,
        }) {
            let mut buffer = ErrorBuffer::recovery();
            let error = error.to_string();
            buffer.put(error.as_bytes());

            return buffer.finish(ErrorCode::INTERNAL_SERVER_ERROR);
        };

        writer.into_inner().finish(code)
    }

    fn encode_report<C>(self, report: Report<C>) -> EncodedError
    where
        C: error_stack::Context,
    {
        let buffer = ErrorBuffer::error();
        let mut writer = buffer.writer();

        if let Err(error) = serde_json::to_writer(&mut writer, &report) {
            let mut buffer = ErrorBuffer::recovery();
            let error = error.to_string();
            buffer.put(error.as_bytes());

            return buffer.finish(ErrorCode::INTERNAL_SERVER_ERROR);
        };

        let code = report
            .request_ref()
            .next()
            .copied()
            .or_else(|| report.request_value().next())
            .unwrap_or(ErrorCode::INTERNAL_SERVER_ERROR);

        writer.into_inner().finish(code)
    }
}

impl ErrorDecoder for JsonCodec {
    type Error = serde_json::Error;
    type Recovery = Box<str>;

    async fn decode_error<E>(
        self,
        bytes: impl Stream<Item = Bytes> + Send + Sync,
    ) -> Result<E, Self::Error>
    where
        E: serde::de::DeserializeOwned,
    {
        let bytes: BytesMut = bytes.collect().await;
        let bytes = bytes.freeze();

        serde_json::from_slice::<JsonError<E>>(&bytes).map(|error| error.details)
    }

    async fn decode_report<C>(
        self,
        _: impl Stream<Item = Bytes> + Send + Sync,
    ) -> Result<Report<C>, Self::Error>
    where
        C: error_stack::Context,
    {
        unimplemented!("unable to deserialize reports")
    }

    async fn decode_recovery(
        self,
        bytes: impl Stream<Item = Bytes> + Send + Sync,
    ) -> Self::Recovery {
        let bytes: BytesMut = bytes.collect().await;
        let bytes = bytes.freeze();

        Box::from(String::from_utf8_lossy(&bytes))
    }
}

#[cfg(test)]
mod tests {
    use core::future::ready;
    use std::io;

    use bytes::Bytes;
    use futures_util::{StreamExt, stream};
    use serde_json::json;

    use crate::{decode::Decoder, encode::Encoder, json::JsonCodec};

    #[tokio::test]
    async fn decode_multiple_records_in_single_chunk() {
        let input = stream::once(ready(Result::<_, io::Error>::Ok(Bytes::from_static(
            b"{\"key\": \"value1\"}\x1E{\"key\": \"value2\"}\x1E",
        ))));
        let mut decoder = JsonCodec.decode::<serde_json::Value, _, _>(input);

        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value1"})
        );
        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value2"})
        );
        assert!(decoder.next().await.is_none());
    }

    #[tokio::test]
    async fn decode_stream_ends_with_partial_record() {
        let input = stream::once(ready(Result::<_, io::Error>::Ok(Bytes::from_static(
            b"{\"key\": \"value1\"}\x1E{\"key\": \"val",
        ))));
        let mut decoder = JsonCodec.decode::<serde_json::Value, _, _>(input);

        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value1"})
        );
        assert!(decoder.next().await.is_none());
    }

    #[tokio::test]
    async fn decode_stream_ends_with_complete_record() {
        let input = stream::once(ready(Result::<_, io::Error>::Ok(Bytes::from_static(
            b"{\"key\": \"value1\"}\x1E",
        ))));
        let mut decoder = JsonCodec.decode::<serde_json::Value, _, _>(input);

        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value1"})
        );
        assert!(decoder.next().await.is_none());
    }

    #[tokio::test]
    async fn decode_stream_ends_with_multiple_complete_records() {
        let input = stream::once(ready(Result::<_, io::Error>::Ok(Bytes::from_static(
            b"{\"key\": \"value1\"}\x1E{\"key\": \"value2\"}\x1E{\"key\": \"value3\"}\x1E",
        ))));
        let mut decoder = JsonCodec.decode::<serde_json::Value, _, _>(input);

        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value1"})
        );
        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value2"})
        );
        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value3"})
        );
        assert!(decoder.next().await.is_none());
    }

    #[tokio::test]
    async fn decode_partial_record_completed_in_next_chunk() {
        let input = stream::iter([
            Result::<_, io::Error>::Ok(Bytes::from_static(b"{\"key\": \"val")),
            Ok(Bytes::from_static(b"ue1\"}\x1E")),
        ]);
        let mut decoder = JsonCodec.decode::<serde_json::Value, _, _>(input);

        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value1"})
        );
        assert!(decoder.next().await.is_none());
    }

    #[tokio::test]
    async fn decode_partial_record_completed_in_next_chunk_with_another_record_in_it() {
        let input = stream::iter([
            Result::<_, io::Error>::Ok(Bytes::from_static(b"{\"key\": \"val")),
            Ok(Bytes::from_static(b"ue1\"}\x1E{\"key\": \"value2\"}\x1E")),
        ]);
        let mut decoder = JsonCodec.decode::<serde_json::Value, _, _>(input);

        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value1"})
        );
        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value2"})
        );
        assert!(decoder.next().await.is_none());
    }

    #[tokio::test]
    async fn decode_error_in_underlying_stream() {
        let input = stream::iter([
            Ok(Bytes::from_static(b"{\"key\": \"value1\"}\x1E")),
            Err(io::Error::other("o no!")),
        ]);
        let mut decoder = JsonCodec.decode::<serde_json::Value, _, _>(input);

        assert_eq!(
            decoder
                .next()
                .await
                .expect("should have a value")
                .expect("should be Ok"),
            json!({"key": "value1"})
        );

        let error = decoder
            .next()
            .await
            .expect("should have a value")
            .expect_err("should be an error");
        assert_eq!(error.to_string(), "underlying stream returned an error");

        assert!(decoder.next().await.is_none());
    }

    #[tokio::test]
    async fn decode_invalid_json() {
        let input = stream::once(ready(Result::<_, io::Error>::Ok(Bytes::from_static(
            b"{\"key\": \"value1\"\x1E",
        ))));
        let mut decoder = JsonCodec.decode::<serde_json::Value, _, _>(input);

        decoder
            .next()
            .await
            .expect("should have a value")
            .expect_err("should be an error");
        assert!(decoder.next().await.is_none());
    }

    #[tokio::test]
    async fn encode_single_value() {
        let input = stream::once(ready(json!({"key": "value"})));
        let mut encoder_stream = JsonCodec.encode(input);

        let encoded_value = encoder_stream
            .next()
            .await
            .expect("should have a value")
            .expect("should be Ok");

        assert_eq!(
            encoded_value,
            Bytes::from_static(b"{\"key\":\"value\"}\x1E")
        );

        assert!(encoder_stream.next().await.is_none());
    }

    #[tokio::test]
    async fn encode_multiple_values() {
        let input = stream::iter([json!({"key1": "value1"}), json!({"key2": "value2"})]);
        let mut encoder = JsonCodec.encode(input);

        let encoded1 = encoder
            .next()
            .await
            .expect("should have a value")
            .expect("should be Ok");
        assert_eq!(encoded1, Bytes::from_static(b"{\"key1\":\"value1\"}\x1E"));

        let encoded2 = encoder
            .next()
            .await
            .expect("should have a value")
            .expect("should be Ok");
        assert_eq!(encoded2, Bytes::from_static(b"{\"key2\":\"value2\"}\x1E"));

        assert!(encoder.next().await.is_none());
    }
}
