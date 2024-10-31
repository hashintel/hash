use core::{
    error::Error,
    fmt::Debug,
    ops::ControlFlow,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::{BufMut, Bytes, BytesMut};
use futures::Stream;
use harpc_codec::error::NetworkError;
use harpc_types::{error_code::ErrorCode, response_kind::ResponseKind};

use crate::body::{Body, Frame};

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
#[display("incomplete network error returned, message: {bytes:?}")]
struct DecodeNetworkError {
    bytes: Bytes,
}

impl Error for DecodeNetworkError {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::PARTIAL_NETWORK_ERROR);
    }
}

struct PartialResponseError {
    code: ErrorCode,
    bytes: BytesMut,
}

impl PartialResponseError {
    fn finish(self) -> NetworkError {
        let buffer = self.bytes.freeze();

        let error = NetworkError::try_from_parts(self.code, buffer);
        match error {
            Ok(error) => error,
            Err(bytes) => {
                let error = DecodeNetworkError { bytes };

                NetworkError::capture_error(&error)
            }
        }
    }
}

pin_project_lite::pin_project! {
    pub struct PackError<B> {
        #[pin]
        body: B,
        error: Option<PartialResponseError>,
        exhausted: bool,
    }
}

impl<B> PackError<B> {
    pub const fn new(body: B) -> Self {
        Self {
            body,
            error: None,
            exhausted: false,
        }
    }
}

impl<B> PackError<B>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
{
    #[expect(clippy::type_complexity, reason = "type is complex due to polling")]
    fn poll(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> ControlFlow<Poll<Option<Result<B::Data, NetworkError>>>> {
        let this = self.project();
        let Poll::Ready(next) = this.body.poll_frame(cx) else {
            // simple propagation
            return ControlFlow::Break(Poll::Pending);
        };

        match next {
            None => {
                // finished, decode the error if there is any
                let error = this.error.take();
                *this.exhausted = true;

                let Some(error) = error else {
                    return ControlFlow::Break(Poll::Ready(None));
                };

                let error = error.finish();
                ControlFlow::Break(Poll::Ready(Some(Err(error))))
            }
            Some(Ok(Frame::Data(data))) => {
                if let Some(error) = this.error.as_mut() {
                    error.bytes.put(data);
                    ControlFlow::Continue(())
                } else {
                    ControlFlow::Break(Poll::Ready(Some(Ok(data))))
                }
            }
            Some(Ok(Frame::Control(control))) => {
                let kind = *control.as_ref();

                match kind {
                    ResponseKind::Err(code) => {
                        // if we have a previous error, finish said error and return it, otherwise
                        // wait for the next frame to populate it
                        let error = this.error.replace(PartialResponseError {
                            code,
                            bytes: BytesMut::new(),
                        });

                        let Some(error) = error else {
                            return ControlFlow::Continue(());
                        };

                        let error = error.finish();

                        ControlFlow::Break(Poll::Ready(Some(Err(error))))
                    }
                    ResponseKind::Ok => {
                        // take the old error and return it (if it exists), otherwise pending
                        // if we wouldn't do that we would concatenate valid values to the error
                        let error = this.error.take();

                        let Some(error) = error else {
                            return ControlFlow::Continue(());
                        };

                        let error = error.finish();

                        ControlFlow::Break(Poll::Ready(Some(Err(error))))
                    }
                }
            }
        }
    }
}

impl<B> Stream for PackError<B>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
{
    type Item = Result<B::Data, NetworkError>;

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

// TODO: test
