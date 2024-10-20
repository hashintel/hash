use core::{
    error::Error,
    ops::ControlFlow,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::{Buf, BufMut, Bytes, BytesMut};
use futures::{FutureExt, Stream};
use harpc_codec::error::NetworkError;
use harpc_types::{error_code::ErrorCode, response_kind::ResponseKind};
use tower::{Layer, Service};

use crate::{
    body::{Body, Frame},
    request::Request,
    response::Response,
};

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
#[display("incomplete transaction error returned, message: {bytes:?}")]
struct DecodeTransactionError {
    bytes: Bytes,
}

impl Error for DecodeTransactionError {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::PARTIAL_TRANSACTION_ERROR);
    }
}

struct PartialTransactionError {
    code: ErrorCode,
    bytes: BytesMut,
}

impl PartialTransactionError {
    fn finish(self) -> NetworkError {
        NetworkError::try_from_parts(self.code, self.bytes.freeze()).unwrap_or_else(|error| {
            let error = DecodeTransactionError { bytes: error };

            NetworkError::capture_error(&error)
        })
    }
}

pin_project_lite::pin_project! {
    pub struct Pack<B> {
        #[pin]
        inner: B,
        error: Option<PartialTransactionError>,
        exhausted: bool,
    }
}

impl<B> Pack<B> {
    pub const fn new(inner: B) -> Self {
        Self {
            inner,
            error: None,
            exhausted: false,
        }
    }

    pub fn into_inner(self) -> B {
        self.inner
    }
}

impl<B> Pack<B>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
{
    fn poll(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> ControlFlow<Poll<Option<Result<Bytes, NetworkError>>>> {
        let this = self.project();
        let Poll::Ready(next) = this.inner.poll_frame(cx) else {
            // simple propagation
            return ControlFlow::Break(Poll::Pending);
        };

        match next {
            None => {
                let error = this.error.take();
                *this.exhausted = true;

                ControlFlow::Break(Poll::Ready(
                    error.map(PartialTransactionError::finish).map(Err),
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
                                    ControlFlow::Break(Poll::Ready(Some(Err(active.finish()))))
                                },
                            )
                    }
                    ResponseKind::Ok => {
                        // take the old error and return it (if it exists), otherwise pending
                        // if we wouldn't do that we would concatenate valid values to the error
                        this.error.take().map_or_else(
                            || ControlFlow::Continue(()),
                            |error| ControlFlow::Break(Poll::Ready(Some(Err(error.finish())))),
                        )
                    }
                }
            }
        }
    }
}

impl<B> Stream for Pack<B>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
{
    type Item = Result<Bytes, NetworkError>;

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

pub struct PackLayer {
    _private: (),
}

impl PackLayer {
    #[expect(
        clippy::new_without_default,
        reason = "layer construction should be explicit and we might add fields in the future"
    )]
    #[must_use]
    pub const fn new() -> Self {
        Self { _private: () }
    }
}

impl<S> Layer<S> for PackLayer {
    type Service = PackService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        PackService { inner }
    }
}

pub struct PackService<S> {
    inner: S,
}

impl<S, ReqBody, ResBody> Service<Request<ReqBody>> for PackService<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>>,
{
    type Error = S::Error;
    type Response = Pack<ResBody>;

    type Future = impl Future<Output = Result<Self::Response, S::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        self.inner
            .call(req)
            .map(|result| result.map(|response| Pack::new(response.into_body())))
    }
}

#[cfg(test)]
mod test {
    use alloc::borrow::Cow;
    use core::error::Error;

    use bytes::{BufMut, Bytes};
    use futures::{StreamExt, stream};
    use harpc_codec::{error::NetworkError, json::JsonCodec};
    use harpc_types::{error_code::ErrorCode, response_kind::ResponseKind};

    use crate::{
        body::{Frame, stream::StreamBody},
        net::pack::Pack,
    };

    #[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
    #[display("{message}")]
    struct ExampleError {
        message: Cow<'static, str>,
        code: ErrorCode,
    }

    impl Error for ExampleError {
        fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
            request.provide_value(self.code);
        }
    }

    #[tokio::test]
    async fn trailing_error() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Ok)),
            Ok(Frame::Data(Bytes::from_static(b"hello" as &[_]))),
            Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(
                b"\x00\x00\x00\x05world" as &[_],
            ))),
        ]);

        let pack = Pack::new(StreamBody::new(iter));
        let values = pack.collect::<Vec<_>>().await;

        let error = NetworkError::capture_error(&ExampleError {
            message: Cow::Borrowed(&"world"),
            code: ErrorCode::INTERNAL_SERVER_ERROR,
        });

        assert_eq!(values, [
            Ok(Bytes::from_static(b"hello" as &[_])),
            Err(error),
        ]);
    }

    #[tokio::test]
    async fn invalid_error_too_short() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter));
        let values = pack.collect::<Vec<_>>().await;

        let error = JsonCodec.encode_error(InvalidTagError);

        assert_eq!(values, [Err(error)]);
    }

    #[tokio::test]
    async fn invalid_error_too_long() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter));
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
            Ok(Frame::Data(Bytes::from_static(
                b"\x00\x00\x00\x0Bhello " as &[_],
            ))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter));
        let values = pack.collect::<Vec<_>>().await;

        let error = NetworkError::capture_error(&ExampleError {
            message: Cow::Borrowed(&"hello world"),
            code: ErrorCode::INTERNAL_SERVER_ERROR,
        });

        assert_eq!(values, [Err(error)]);
    }

    #[tokio::test]
    async fn no_kind() {
        let iter = stream::iter([Result::<_, !>::Ok(Frame::<_, ResponseKind>::Data(
            Bytes::from_static(b"hello" as &[_]),
        ))]);

        let pack = Pack::new(StreamBody::new(iter));
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

        let pack = Pack::new(StreamBody::new(iter));
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

        let pack = Pack::new(StreamBody::new(iter));
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

        let pack = Pack::new(StreamBody::new(iter));
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

        let pack = Pack::new(StreamBody::new(iter));
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

        let pack = Pack::new(StreamBody::new(iter));
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

        let pack = Pack::new(StreamBody::new(iter));
        let values = pack.collect::<Vec<_>>().await;

        let error = JsonCodec.encode_error(InvalidTagError);

        assert_eq!(values, [Err(error)]);
    }
}
