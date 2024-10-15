use core::{
    fmt::Debug,
    marker::PhantomData,
    ops::ControlFlow,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::{Buf, BufMut, BytesMut};
use futures::Stream;
use harpc_codec::{decode::ErrorDecoder, error::kind};
use harpc_types::{error_code::ErrorCode, response_kind::ResponseKind};

use crate::body::{Body, Frame};

struct PartialResponseError {
    _code: ErrorCode,
    bytes: BytesMut,
}

impl PartialResponseError {
    fn finish<E, D>(self, decoder: D) -> E
    where
        E: serde::de::DeserializeOwned,
        D: ErrorDecoder<Error: Debug> + Send,
    {
        let mut buffer = self.bytes.freeze();
        let tag = buffer.get_u8();

        let tag = kind::Tag::from_u8(tag).expect("should have a correct tag");
        match tag {
            kind::Tag::NetworkError => decoder
                .decode_error(buffer)
                .expect("should be able to decode error"),
            kind::Tag::Report => {
                unimplemented!("to be reworked");
            }
            kind::Tag::Recovery => {
                unimplemented!("to be reworked");
            }
        }
    }
}

pin_project_lite::pin_project! {
    pub struct PackError<B, D, E> {
        #[pin]
        body: B,
        decoder: D,
        error: Option<PartialResponseError>,
        exhausted: bool,
        _marker: PhantomData<fn() -> *const E>,
    }
}

impl<B, D, E> PackError<B, D, E> {
    pub fn new(body: B, decoder: D) -> Self {
        Self {
            body,
            decoder,
            error: None,
            exhausted: false,
            _marker: PhantomData,
        }
    }
}

impl<B, D, E> PackError<B, D, E>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
    D: ErrorDecoder<Error: Debug> + Clone + Send,
    E: serde::de::DeserializeOwned,
{
    fn poll(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> ControlFlow<Poll<Option<Result<B::Data, E>>>> {
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

                let decoder = this.decoder.clone();
                let error = error.finish::<E, _>(decoder);
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
                            _code: code,
                            bytes: BytesMut::new(),
                        });

                        let Some(error) = error else {
                            return ControlFlow::Continue(());
                        };

                        let decoder = this.decoder.clone();
                        let error = error.finish::<E, _>(decoder);

                        ControlFlow::Break(Poll::Ready(Some(Err(error))))
                    }
                    ResponseKind::Ok => {
                        // take the old error and return it (if it exists), otherwise pending
                        // if we wouldn't do that we would concatenate valid values to the error
                        let error = this.error.take();

                        let Some(error) = error else {
                            return ControlFlow::Continue(());
                        };

                        let decoder = this.decoder.clone();
                        let error = error.finish::<E, _>(decoder);

                        ControlFlow::Break(Poll::Ready(Some(Err(error))))
                    }
                }
            }
        }
    }
}

impl<B, D, E> Stream for PackError<B, D, E>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
    D: ErrorDecoder<Error: Debug> + Clone + Send,
    E: serde::de::DeserializeOwned,
{
    type Item = Result<B::Data, E>;

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
