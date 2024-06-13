use core::task::ready;
use std::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::{Buf, BufMut, Bytes, BytesMut};
use futures::{Stream, StreamExt};
use harpc_net::session::{
    client::{ErrorStream, ResponseStream, ValueStream},
    error::TransactionError,
    server::transaction::TransactionStream,
};
use harpc_wire_protocol::response::kind::{ErrorCode, ResponseKind};

use crate::body::{Body, BodyFrameResult, Frame};

pub struct RequestBody {
    inner: TransactionStream,
}

impl Body for RequestBody {
    type Control = !;
    type Data = Bytes;
    type Error = !;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<BodyFrameResult<Self>>> {
        self.inner
            .poll_next_unpin(cx)
            .map(Ok)
            .map(Result::transpose)
            .map_ok(Frame::new_data)
    }

    fn is_complete(&self) -> Option<bool> {
        self.inner.is_incomplete().map(|incomplete| !incomplete)
    }
}

struct TransactionErrorMut {
    code: ErrorCode,
    bytes: BytesMut,
}

impl From<TransactionErrorMut> for TransactionError {
    fn from(error: TransactionErrorMut) -> Self {
        TransactionError {
            code: error.code,
            bytes: error.bytes.freeze(),
        }
    }
}

// problem: pack cannot be a body, because it converts it to a stream, not a body
pin_project_lite::pin_project! {
    pub struct Pack<B> {
        #[pin]
        inner: B,
        error: Option<TransactionErrorMut>,
        exhausted: bool,
    }
}

impl<B> Stream for Pack<B>
where
    B: Body<Control: AsRef<ResponseKind>, Error = !>,
{
    type Item = Result<Bytes, TransactionError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.exhausted {
            return Poll::Ready(None);
        }

        let this = self.project();

        let next = ready!(this.inner.poll_frame(cx));

        match next {
            None => {
                let error = this.error.take();
                *this.exhausted = true;

                Poll::Ready(error.map(TransactionError::from).map(Err))
            }
            Some(Ok(Frame::Data(data))) => {
                if let Some(error) = this.error.as_mut() {
                    // errors need to be sent to the stream as a single frame, so we accumulate
                    error.bytes.put(data);

                    Poll::Pending
                } else {
                    let mut bytes = BytesMut::with_capacity(data.remaining());
                    bytes.put(data);
                    let bytes = bytes.freeze();

                    Poll::Ready(Some(Ok(bytes)))
                }
            }
            Some(Ok(Frame::Control(control))) => {
                let kind = *control.as_ref();

                match kind {
                    ResponseKind::Err(code) => {
                        // if we have a previous error, finish said error and return it, otherwise
                        // wait for the next frame to populate it
                        let active = this.error.replace(TransactionErrorMut {
                            code,
                            bytes: BytesMut::new(),
                        });

                        if let Some(active) = active {
                            Poll::Ready(Some(Err(active.into())))
                        } else {
                            Poll::Pending
                        }
                    }
                    ResponseKind::Ok => {
                        // take the old error and return it (if it exists), otherwise pending
                        // if we wouldn't do that we would concatenate valid values to the error
                        let error = this.error.take();

                        if let Some(error) = error {
                            Poll::Ready(Some(Err(error.into())))
                        } else {
                            Poll::Pending
                        }
                    }
                }
            }
        }
    }
}

// TODO: Unpack (for client), that's then a body! TODO: a single result value (layer which takes the
// stream!)

enum UnpackState {
    Empty,
    Running {
        stream: Result<ValueStream, ErrorStream>,
    },
    Finished {
        complete: bool,
    },
}

pub struct Unpack {
    inner: ResponseStream,

    state: UnpackState,
}

impl Body for Unpack {
    type Control = ResponseKind;
    type Data = Bytes;
    type Error = !;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<BodyFrameResult<Self>>> {
        let next = match &mut self.state {
            UnpackState::Empty => {
                // get a new value from stream, as we're currently no longer holding any value
                let Some(value) = ready!(self.inner.poll_next_unpin(cx)) else {
                    // we have exhausted the stream, but have been empty, this means that we're
                    // incomplete and transition to that state
                    // TODO: consider dropping the inner stream here!
                    self.state = UnpackState::Finished { complete: false };
                    return Poll::Ready(None);
                };

                let kind = match &value {
                    Ok(_) => ResponseKind::Ok,
                    Err(stream) => ResponseKind::Err(stream.code()),
                };

                self.state = UnpackState::Running { stream: value };

                // we have transitioned to the new state, with a new stream comes a new control
                // signalling that we have a new stream of packets
                return Poll::Ready(Some(Ok(Frame::new_control(kind))));
            }
            UnpackState::Running { stream: Ok(stream) } => ready!(stream.poll_next_unpin(cx))
                .ok_or_else(|| {
                    stream.state().unwrap_or_else(|| {
                        unreachable!(
                            "the stream has been terminated (and is fused) and the state will \
                             always be set"
                        )
                    })
                }),
            UnpackState::Running {
                stream: Err(stream),
            } => ready!(stream.poll_next_unpin(cx)).ok_or_else(|| {
                stream.state().unwrap_or_else(|| {
                    unreachable!(
                        "the stream has been terminated (and is fused) and the state will always \
                         be set"
                    )
                })
            }),
            UnpackState::Finished { .. } => {
                // there's nothing to do, we have finished
                return Poll::Ready(None);
            }
        };

        match next {
            Ok(value) => {
                // we have a value, return it
                Poll::Ready(Some(Ok(Frame::new_data(value))))
            }
            Err(state) => {
                // we have exhausted the stream, check if we're complete, in that case we're
                // done

                // we now transition depending on the state, if we're complete we're done,
                // and return None, otherwise we're pending and wait for the next stream
                if state.is_end_of_response() {
                    // TODO: consider dropping the inner stream here!
                    self.state = UnpackState::Finished { complete: true };
                    Poll::Ready(None)
                } else {
                    self.state = UnpackState::Empty;
                    Poll::Pending
                }
            }
        }
    }

    fn is_complete(&self) -> Option<bool> {
        match self.state {
            UnpackState::Empty => None,
            UnpackState::Running { .. } => None,
            UnpackState::Finished { complete } => Some(complete),
        }
    }
}
