use core::{
    error::Error,
    ops::ControlFlow,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::{Buf, BufMut, Bytes, BytesMut};
use futures::Stream;
use harpc_codec::{encode::ErrorEncoder, error::EncodedError};
use harpc_types::{error_code::ErrorCode, response_kind::ResponseKind};

use crate::body::{Body, Frame};

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    derive_more::Display,
    serde::Serialize,
    serde::Deserialize,
)]
#[display("invalid error tag")]
struct InvalidTagError;

impl Error for InvalidTagError {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::PACK_INVALID_ERROR_TAG);
    }
}

struct PartialTransactionError {
    code: ErrorCode,
    bytes: BytesMut,
}

impl PartialTransactionError {
    fn finish(self, encoder: impl ErrorEncoder) -> EncodedError {
        EncodedError::new(self.code, self.bytes.freeze())
            .map_or_else(|| encoder.encode_error(InvalidTagError), |error| error)
    }
}

pin_project_lite::pin_project! {
    pub struct Pack<B, E> {
        #[pin]
        inner: B,
        encoder: E,
        error: Option<PartialTransactionError>,
        exhausted: bool,
    }
}

impl<B, E> Pack<B, E>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
    E: ErrorEncoder,
{
    pub const fn new(inner: B, encoder: E) -> Self {
        Self {
            inner,
            encoder,
            error: None,
            exhausted: false,
        }
    }

    pub fn into_inner(self) -> B {
        self.inner
    }
}

impl<B, E> Pack<B, E>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
    E: ErrorEncoder + Clone,
{
    fn poll(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> ControlFlow<Poll<Option<Result<Bytes, EncodedError>>>> {
        let this = self.project();
        let Poll::Ready(next) = this.inner.poll_frame(cx) else {
            // simple propagation
            return ControlFlow::Break(Poll::Pending);
        };

        match next {
            None => {
                let error = this.error.take();
                *this.exhausted = true;

                let encoder = this.encoder.clone();

                ControlFlow::Break(Poll::Ready(
                    error.map(|error| error.finish(encoder)).map(Err),
                ))
            }
            Some(Ok(Frame::Data(data))) => {
                if let Some(error) = this.error.as_mut() {
                    // errors need to be sent to the stream as a single frame, so we accumulate
                    error.bytes.put(data);

                    ControlFlow::Continue(())
                } else {
                    let mut bytes = BytesMut::with_capacity(data.remaining());
                    bytes.put(data);
                    let bytes = bytes.freeze();

                    ControlFlow::Break(Poll::Ready(Some(Ok(bytes))))
                }
            }
            Some(Ok(Frame::Control(control))) => {
                let kind = *control.as_ref();
                let encoder = this.encoder.clone();

                match kind {
                    ResponseKind::Err(code) => {
                        // if we have a previous error, finish said error and return it, otherwise
                        // wait for the next frame to populate it
                        this.error
                            .replace(PartialTransactionError {
                                code,
                                bytes: BytesMut::new(),
                            })
                            .map_or_else(
                                || ControlFlow::Continue(()),
                                |active| {
                                    ControlFlow::Break(Poll::Ready(Some(Err(
                                        active.finish(encoder)
                                    ))))
                                },
                            )
                    }
                    ResponseKind::Ok => {
                        // take the old error and return it (if it exists), otherwise pending
                        // if we wouldn't do that we would concatenate valid values to the error
                        this.error.take().map_or_else(
                            || ControlFlow::Continue(()),
                            |error| {
                                ControlFlow::Break(Poll::Ready(Some(Err(error.finish(encoder)))))
                            },
                        )
                    }
                }
            }
        }
    }
}

impl<B, E> Stream for Pack<B, E>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
    E: ErrorEncoder + Clone,
{
    type Item = Result<Bytes, EncodedError>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.exhausted {
            return Poll::Ready(None);
        }

        loop {
            if let Some(result) = self.as_mut().poll(cx).break_value() {
                return result;
            }
        }
    }
}

#[cfg(test)]
mod test {
    use bytes::{BufMut, Bytes};
    use futures::{StreamExt, stream};
    use harpc_codec::{encode::ErrorEncoder, error::ErrorBuffer, json::JsonCodec};
    use harpc_types::{error_code::ErrorCode, response_kind::ResponseKind};

    use crate::{
        body::{Frame, stream::StreamBody},
        net::pack::{InvalidTagError, Pack},
    };

    #[tokio::test]
    async fn trailing_error() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Ok)),
            Ok(Frame::Data(Bytes::from_static(b"hello" as &[_]))),
            Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"\x01world" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter), JsonCodec);
        let values = pack.collect::<Vec<_>>().await;

        let mut buffer = ErrorBuffer::error();
        buffer.put_slice(b"world");
        let error = buffer.finish(ErrorCode::INTERNAL_SERVER_ERROR);

        assert_eq!(values, [
            Ok(Bytes::from_static(b"hello" as &[_])),
            Err(error),
        ]);
    }

    #[tokio::test]
    async fn invalid_error_tag() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter), JsonCodec);
        let values = pack.collect::<Vec<_>>().await;

        let error = JsonCodec.encode_error(InvalidTagError);

        assert_eq!(values, [Err(error)]);
    }

    #[tokio::test]
    async fn error_accumulate() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"\x01hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter), JsonCodec);
        let values = pack.collect::<Vec<_>>().await;

        let mut buffer = ErrorBuffer::error();
        buffer.put_slice(b"hello world");
        let error = buffer.finish(ErrorCode::INTERNAL_SERVER_ERROR);

        assert_eq!(values, [Err(error)]);
    }

    #[tokio::test]
    async fn no_kind() {
        let iter = stream::iter([Result::<_, !>::Ok(Frame::<_, ResponseKind>::Data(
            Bytes::from_static(b"hello" as &[_]),
        ))]);

        let pack = Pack::new(StreamBody::new(iter), JsonCodec);
        let values = pack.collect::<Vec<_>>().await;

        assert_eq!(values, [Ok(Bytes::from_static(b"hello" as &[_]))]);
    }

    #[tokio::test]
    async fn ok_passthrough() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Ok)),
            Ok(Frame::Data(Bytes::from_static(b"hello" as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter), JsonCodec);
        let values = pack.collect::<Vec<_>>().await;

        assert_eq!(values, [
            Ok(Bytes::from_static(b"hello" as &[_])),
            Ok(Bytes::from_static(b"world" as &[_])),
        ]);
    }

    #[tokio::test]
    async fn error_after_error() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"\x01hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
            Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"\x01steven" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter), JsonCodec);
        let values = pack.collect::<Vec<_>>().await;

        let mut buffer = ErrorBuffer::error();
        buffer.put_slice(b"hello world");
        let error1 = buffer.finish(ErrorCode::INTERNAL_SERVER_ERROR);

        let mut buffer = ErrorBuffer::error();
        buffer.put_slice(b"steven");
        let error2 = buffer.finish(ErrorCode::INTERNAL_SERVER_ERROR);

        assert_eq!(values, [Err(error1), Err(error2)]);
    }

    #[tokio::test]
    async fn ok_after_ok() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Ok)),
            Ok(Frame::Data(Bytes::from_static(b"hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
            Ok(Frame::Control(ResponseKind::Ok)),
            Ok(Frame::Data(Bytes::from_static(b"steven" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter), JsonCodec);
        let values = pack.collect::<Vec<_>>().await;

        assert_eq!(values, [
            Ok(Bytes::from_static(b"hello " as &[_])),
            Ok(Bytes::from_static(b"world" as &[_])),
            Ok(Bytes::from_static(b"steven" as &[_])),
        ]);
    }

    #[tokio::test]
    async fn error_after_ok() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Ok)),
            Ok(Frame::Data(Bytes::from_static(b"hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
            Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"\x01steven" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter), JsonCodec);
        let values = pack.collect::<Vec<_>>().await;

        let mut buffer = ErrorBuffer::error();
        buffer.put_slice(b"steven");
        let error = buffer.finish(ErrorCode::INTERNAL_SERVER_ERROR);

        assert_eq!(values, [
            Ok(Bytes::from_static(b"hello " as &[_])),
            Ok(Bytes::from_static(b"world" as &[_])),
            Err(error),
        ]);
    }

    #[tokio::test]
    async fn ok_after_error() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"\x01hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
            Ok(Frame::Control(ResponseKind::Ok)),
            Ok(Frame::Data(Bytes::from_static(b"steven" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter), JsonCodec);
        let values = pack.collect::<Vec<_>>().await;

        let mut buffer = ErrorBuffer::error();
        buffer.put_slice(b"hello world");
        let error = buffer.finish(ErrorCode::INTERNAL_SERVER_ERROR);

        assert_eq!(values, [
            Err(error),
            Ok(Bytes::from_static(b"steven" as &[_])),
        ]);
    }

    #[tokio::test]
    async fn error_no_bytes() {
        let iter = stream::iter([Result::<_, !>::Ok(Frame::<Bytes, _>::Control(
            ResponseKind::Err(ErrorCode::INTERNAL_SERVER_ERROR),
        ))]);

        let pack = Pack::new(StreamBody::new(iter), JsonCodec);
        let values = pack.collect::<Vec<_>>().await;

        let error = JsonCodec.encode_error(InvalidTagError);

        assert_eq!(values, [Err(error)]);
    }
}
