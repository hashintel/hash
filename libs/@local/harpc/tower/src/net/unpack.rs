use core::{
    mem,
    ops::ControlFlow,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Bytes;
use futures::{Stream, StreamExt};
use harpc_net::session::client::{ErrorStream, ResponseStream, TransactionStream, ValueStream};
use harpc_wire_protocol::response::kind::ResponseKind;

use crate::body::{Body, BodyFrameResult, Frame};

struct Waiting {
    stream: ResponseStream,
}

impl Waiting {
    fn poll(mut self, cx: &mut Context) -> (State, Poll<Option<BodyFrameResult<Unpack>>>) {
        let Poll::Ready(next) = self.stream.poll_next_unpin(cx) else {
            // we're just propagating the underlying stream `Pending`, this means we need to
            // register any waker
            return (State::Waiting(self), Poll::Pending);
        };

        // get a new value from stream, as we're currently no longer holding any value
        let Some(value) = next else {
            // we have exhausted the stream, but have been empty, this means that we're
            // incomplete and transition to that state
            return (
                State::Finished(Finished { complete: false }),
                Poll::Ready(None),
            );
        };

        let kind = match &value {
            Ok(_) => ResponseKind::Ok,
            Err(stream) => ResponseKind::Err(stream.code()),
        };

        let state = State::Running(Running {
            stream: self.stream,
            current: value,
        });

        // we have transitioned to the new state, with a new stream comes a new control
        // signalling that we have a new stream of packets
        (state, Poll::Ready(Some(Ok(Frame::new_control(kind)))))
    }
}

struct Running {
    stream: ResponseStream,

    current: Result<ValueStream, ErrorStream>,
}

impl Running {
    fn poll_exhausted(
        stream: ResponseStream,
        current: impl TransactionStream,
    ) -> (State, ControlFlow<Poll<Option<BodyFrameResult<Unpack>>>>) {
        // we have exhausted the stream, check if we're complete, in that case we're
        // done
        let state = current.state().unwrap_or_else(|| {
            unreachable!(
                "the stream has been terminated (and is fused) and the state will always be set"
            )
        });

        // we now transition depending on the state, if we're complete we're done,
        // and return None, otherwise we're pending and wait for the next stream
        if state.is_end_of_response() {
            let state = State::Finished(Finished { complete: true });
            (state, ControlFlow::Break(Poll::Ready(None)))
        } else {
            // we cannot return `Pending` here, because in that case we'd need to register some sort
            // of waker
            (
                State::Waiting(Waiting { stream }),
                ControlFlow::Continue(()),
            )
        }
    }

    fn poll_current<T: Stream<Item = Bytes> + TransactionStream + Unpin>(
        stream: ResponseStream,
        mut current: T,
        pack: impl FnOnce(T) -> Result<ValueStream, ErrorStream>,
        cx: &mut Context,
    ) -> (State, ControlFlow<Poll<Option<BodyFrameResult<Unpack>>>>) {
        let Poll::Ready(value) = current.poll_next_unpin(cx) else {
            // we're just propagating the underlying stream `Pending`, this means we need to
            // register any waker
            return (
                State::Running(Running {
                    stream,
                    current: pack(current),
                }),
                ControlFlow::Break(Poll::Pending),
            );
        };

        let Some(bytes) = value else {
            return Self::poll_exhausted(stream, current);
        };

        (
            State::Running(Running {
                stream,
                current: pack(current),
            }),
            ControlFlow::Break(Poll::Ready(Some(Ok(Frame::new_data(bytes))))),
        )
    }

    fn poll(self, cx: &mut Context) -> (State, ControlFlow<Poll<Option<BodyFrameResult<Unpack>>>>) {
        match self.current {
            Ok(current) => Self::poll_current(self.stream, current, Ok, cx),
            Err(current) => Self::poll_current(self.stream, current, Err, cx),
        }
    }
}

struct Finished {
    complete: bool,
}

enum State {
    Waiting(Waiting),
    Running(Running),
    Finished(Finished),
}

impl State {
    fn poll(self, cx: &mut Context) -> (State, ControlFlow<Poll<Option<BodyFrameResult<Unpack>>>>) {
        match self {
            State::Waiting(waiting) => {
                let (state, poll) = waiting.poll(cx);
                (state, ControlFlow::Break(poll))
            }
            State::Running(running) => running.poll(cx),
            State::Finished(finished) => (
                State::Finished(finished),
                ControlFlow::Break(Poll::Ready(None)),
            ),
        }
    }
}

pub struct Unpack {
    state: State,
}

impl Unpack {
    pub fn new(stream: ResponseStream) -> Self {
        Self {
            state: State::Waiting(Waiting { stream }),
        }
    }

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context) -> Poll<Option<BodyFrameResult<Self>>> {
        // replace the value with a temporary value, this is necessary to be able to
        // move out of the value
        // we move out of the value, so that we can transition easily between states
        let mut state = mem::replace(
            &mut self.state,
            State::Finished(Finished { complete: false }),
        );
        loop {
            let (next, poll) = state.poll(cx);
            state = next;

            if let Some(poll) = poll.break_value() {
                // set the state back to the current value, to persist
                self.state = state;
                return poll;
            }
        }
    }
}

impl Body for Unpack {
    type Control = ResponseKind;
    type Data = Bytes;
    type Error = !;

    fn poll_frame(self: Pin<&mut Self>, cx: &mut Context) -> Poll<Option<BodyFrameResult<Self>>> {
        self.poll(cx)
    }

    fn is_complete(&self) -> Option<bool> {
        match self.state {
            State::Waiting(_) => None,
            State::Running(_) => None,
            State::Finished(Finished { complete }) => Some(complete),
        }
    }
}
