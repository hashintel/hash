use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::{Buf, BufMut as _, Bytes, BytesMut};
use error_stack::{Report, ResultExt as _};
use futures_core::{Stream, TryStream};
use futures_util::stream::{self, StreamExt as _};
use serde::de::DeserializeOwned;

use crate::{decode::Decoder, encode::Encoder};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, thiserror::Error)]
pub enum JsonError {
    #[error("unable to encode JSON value")]
    Encode,
    #[error("unable to decode JSON value")]
    Decode,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct JsonCodec;

impl JsonCodec {
    // 1E is the ASCII record separator character, and is invalid in JSON.
    const SEPARATOR: u8 = b'\x1E';
}

impl Encoder for JsonCodec {
    type Buf = Bytes;
    type Error = Report<JsonError>;
    type Output<Input>
        = stream::Map<Input, fn(Input::Item) -> Result<Bytes, Report<JsonError>>>
    where
        Input: Stream + Send;

    fn encode<T, S>(self, input: S) -> Self::Output<S>
    where
        T: serde::Serialize,
        S: Stream<Item = T> + Send,
    {
        input.map(|item| {
            let buf = BytesMut::new();
            let mut writer = buf.writer();

            serde_json::to_writer(&mut writer, &item)
                .map(|()| {
                    let mut buf = writer.into_inner();
                    buf.put_u8(Self::SEPARATOR);
                    buf.freeze()
                })
                .change_context(JsonError::Encode)
        })
    }
}

impl Decoder for JsonCodec {
    type Error = Report<JsonError>;
    type Output<T, Input>
        = JsonDecoderStream<T, Input>
    where
        T: DeserializeOwned,
        Input: TryStream<Ok: Buf> + Send;

    fn decode<T, S>(self, items: S) -> Self::Output<T, S>
    where
        T: serde::de::DeserializeOwned,
        S: TryStream<Ok: Buf> + Send,
    {
        JsonDecoderStream::new(items)
    }
}

pin_project_lite::pin_project! {
    pub struct JsonDecoderStream<T, S> {
        #[pin]
        inner: Option<S>,
        buffer: BytesMut,
        // This PhantomData is used to make the struct covariant over T
        // without imposing unnecessary constraints
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

impl<T, S> Stream for JsonDecoderStream<T, S>
where
    S: TryStream<Ok: Buf>,
    T: DeserializeOwned,
{
    type Item = Result<T, Report<JsonError>>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // check if we have a full message in the buffer, in theory multiple messages could be in
        // the buffer at the same time, this guards against that.
        if let Some(value) = Self::poll_item(self.as_mut(), 0) {
            return Poll::Ready(Some(value.change_context(JsonError::Decode)));
        }

        loop {
            let mut this = self.as_mut().project();
            // We use an option here to avoid repeated polling of the inner stream once it has
            // returned `None`, as that would lead to potentially undefined behavior.
            let inner = this.inner.as_mut().as_pin_mut();

            let Some(inner) = inner else {
                // The underlying stream has already returned `None`, we now only flush the
                // remaining buffer.
                if let Some(value) = Self::poll_item(self.as_mut(), 0) {
                    return Poll::Ready(Some(value.change_context(JsonError::Decode)));
                }

                return Poll::Ready(None);
            };

            let Some(value) = ready!(inner.try_poll_next(cx)) else {
                // drop the inner stream, as we're done with it
                this.inner.set(None);

                // potentially we still have items in the buffer, try to decode them.
                if let Some(value) = Self::poll_item(self.as_mut(), 0) {
                    return Poll::Ready(Some(value.change_context(JsonError::Decode)));
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
                // The problem is that we don't know if the underlying error is a report, **or** if
                // it is a plain error.
                // in **theory** we could do: `impl Into<Report<C>> + Debug + Display`, but then we
                // don't know what `C` should be.
                Err(_error) => {
                    // return Poll::Ready(Some(Err(serde_json::Error::custom(
                    //     "underlying stream returned an error",
                    // ))));
                    return Poll::Ready(Some(Err(Report::new(JsonError::Decode))));
                }
            };

            // look if we found a separator between the offset and the end of the buffer
            if let Some(value) = Self::poll_item(self.as_mut(), offset) {
                return Poll::Ready(Some(value.change_context(JsonError::Decode)));
            }

            // if not we continue to the next iteration
        }
    }
}

#[cfg(test)]
mod tests {
    use core::future::ready;
    use std::io;

    use bytes::Bytes;
    use futures_util::{StreamExt as _, stream};
    use serde_json::json;

    use crate::{decode::Decoder as _, encode::Encoder as _, json::JsonCodec};

    #[tokio::test]
    async fn decode_multiple_records_in_single_chunk() {
        let input = stream::once(ready(Result::<_, io::Error>::Ok(Bytes::from_static(
            b"{\"key\": \"value1\"}\x1E{\"key\": \"value2\"}\x1E",
        ))));
        let mut decoder = JsonCodec.decode::<serde_json::Value, _>(input);

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
        let mut decoder = JsonCodec.decode::<serde_json::Value, _>(input);

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
        let mut decoder = JsonCodec.decode::<serde_json::Value, _>(input);

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
        let mut decoder = JsonCodec.decode::<serde_json::Value, _>(input);

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
        let mut decoder = JsonCodec.decode::<serde_json::Value, _>(input);

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
        let mut decoder = JsonCodec.decode::<serde_json::Value, _>(input);

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
        let mut decoder = JsonCodec.decode::<serde_json::Value, _>(input);

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
        assert_eq!(error.to_string(), "unable to decode JSON value");

        assert!(decoder.next().await.is_none());
    }

    #[tokio::test]
    async fn decode_invalid_json() {
        let input = stream::once(ready(Result::<_, io::Error>::Ok(Bytes::from_static(
            b"{\"key\": \"value1\"\x1E",
        ))));
        let mut decoder = JsonCodec.decode::<serde_json::Value, _>(input);

        let _report = decoder
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
