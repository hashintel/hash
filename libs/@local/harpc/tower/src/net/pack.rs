use core::{
    ops::ControlFlow,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::{Buf as _, BufMut as _, Bytes, BytesMut};
use futures::Stream;
use harpc_net::session::error::TransactionError;
use harpc_wire_protocol::response::kind::{ErrorCode, ResponseKind};

use crate::body::{Body, Frame};

struct PartialTransactionError {
    code: ErrorCode,
    bytes: BytesMut,
}

impl From<PartialTransactionError> for TransactionError {
    fn from(error: PartialTransactionError) -> Self {
        Self {
            code: error.code,
            bytes: error.bytes.freeze(),
        }
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

impl<B> Pack<B>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
{
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
    ) -> ControlFlow<Poll<Option<Result<Bytes, TransactionError>>>> {
        let this = self.project();
        let Poll::Ready(next) = this.inner.poll_frame(cx) else {
            // simple propagation
            return ControlFlow::Break(Poll::Pending);
        };

        match next {
            None => {
                let error = this.error.take();
                *this.exhausted = true;

                ControlFlow::Break(Poll::Ready(error.map(TransactionError::from).map(Err)))
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
                                |active| ControlFlow::Break(Poll::Ready(Some(Err(active.into())))),
                            )
                    }
                    ResponseKind::Ok => {
                        // take the old error and return it (if it exists), otherwise pending
                        // if we wouldn't do that we would concatenate valid values to the error
                        this.error.take().map_or_else(
                            || ControlFlow::Continue(()),
                            |error| ControlFlow::Break(Poll::Ready(Some(Err(error.into())))),
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
    type Item = Result<Bytes, TransactionError>;

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
    use bytes::Bytes;
    use futures::{StreamExt as _, stream};
    use harpc_net::session::error::TransactionError;
    use harpc_wire_protocol::response::kind::{ErrorCode, ResponseKind};

    use crate::{
        body::{Frame, stream::StreamBody},
        net::pack::Pack,
    };

    #[tokio::test]
    async fn trailing_error() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Ok)),
            Ok(Frame::Data(Bytes::from_static(b"hello" as &[_]))),
            Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter));
        let values = pack.collect::<Vec<_>>().await;

        assert_eq!(values, [
            Ok(Bytes::from_static(b"hello" as &[_])),
            Err(TransactionError {
                code: ErrorCode::INTERNAL_SERVER_ERROR,
                bytes: Bytes::from_static(b"world" as &[_]),
            }),
        ]);
    }

    #[tokio::test]
    async fn error_accumulate() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter));
        let values = pack.collect::<Vec<_>>().await;

        assert_eq!(values, [Err(TransactionError {
            code: ErrorCode::INTERNAL_SERVER_ERROR,
            bytes: Bytes::from_static(b"hello world" as &[_]),
        })]);
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
            Ok(Frame::Data(Bytes::from_static(b"hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
            Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"steven" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter));
        let values = pack.collect::<Vec<_>>().await;

        assert_eq!(values, [
            Err(TransactionError {
                code: ErrorCode::INTERNAL_SERVER_ERROR,
                bytes: Bytes::from_static(b"hello world" as &[_]),
            }),
            Err(TransactionError {
                code: ErrorCode::INTERNAL_SERVER_ERROR,
                bytes: Bytes::from_static(b"steven" as &[_]),
            }),
        ]);
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
            Ok(Frame::Data(Bytes::from_static(b"steven" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter));
        let values = pack.collect::<Vec<_>>().await;

        assert_eq!(values, [
            Ok(Bytes::from_static(b"hello " as &[_])),
            Ok(Bytes::from_static(b"world" as &[_])),
            Err(TransactionError {
                code: ErrorCode::INTERNAL_SERVER_ERROR,
                bytes: Bytes::from_static(b"steven" as &[_]),
            }),
        ]);
    }

    #[tokio::test]
    async fn ok_after_error() {
        let iter = stream::iter([
            Result::<_, !>::Ok(Frame::Control(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR,
            ))),
            Ok(Frame::Data(Bytes::from_static(b"hello " as &[_]))),
            Ok(Frame::Data(Bytes::from_static(b"world" as &[_]))),
            Ok(Frame::Control(ResponseKind::Ok)),
            Ok(Frame::Data(Bytes::from_static(b"steven" as &[_]))),
        ]);

        let pack = Pack::new(StreamBody::new(iter));
        let values = pack.collect::<Vec<_>>().await;

        assert_eq!(values, [
            Err(TransactionError {
                code: ErrorCode::INTERNAL_SERVER_ERROR,
                bytes: Bytes::from_static(b"hello world" as &[_]),
            }),
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

        assert_eq!(values, [Err(TransactionError {
            code: ErrorCode::INTERNAL_SERVER_ERROR,
            bytes: Bytes::new(),
        })]);
    }
}
