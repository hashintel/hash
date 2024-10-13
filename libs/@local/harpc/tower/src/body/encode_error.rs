use core::{
    error::Error,
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::Bytes;
use harpc_codec::encode::ErrorEncoder;
use harpc_types::response_kind::ResponseKind;

use super::{Body, full::Full};
use crate::{
    body::{BodyExt, controlled::Controlled},
    either::Either,
};

pin_project_lite::pin_project! {
    #[project = StateProj]
    enum State<B> {
        Inner {
            #[pin]
            inner: B
        },
        Error {
            inner: Controlled<ResponseKind, Full<Bytes>>
        }
    }
}

pin_project_lite::pin_project! {
    /// A body that encodes errors using a specified error encoder.
    ///
    /// # Behavior
    ///
    /// When an error occurs, this body replaces the underlying stream with a controlled stream
    /// that represents the encoded error.
    ///
    /// # Error Handling
    ///
    /// Once an error is encountered, this body stops processing the inner body. This is because:
    ///
    /// 1. It's impossible to determine if the error occurred mid-way through a structured value.
    /// 2. There's no reliable way to find a safe point to resume encoding after the error.
    ///
    /// # Safety
    ///
    /// This approach prevents potential cascading failures that could occur if encoding were to
    /// continue after an error without proper delimiters or context.
    ///
    /// # Note
    ///
    /// While this method ensures safe error handling, it means that any data in the inner body
    /// after an error will not be processed.
    pub struct EncodeError<B, E> {
        #[pin]
        state: State<B>,
        encoder: E,
    }
}

impl<B, E> EncodeError<B, E> {
    pub const fn new(inner: B, encoder: E) -> Self {
        Self {
            state: State::Inner { inner },
            encoder,
        }
    }
}

impl<B, E> Body for EncodeError<B, E>
where
    B: Body<Error: Error + serde::Serialize>,
    E: ErrorEncoder + Clone,
{
    type Control = Either<B::Control, ResponseKind>;
    type Data = Either<B::Data, Bytes>;
    type Error = !;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<super::BodyFrameResult<Self>>> {
        loop {
            let this = self.as_mut().project();
            let state = this.state.project();

            let next = match state {
                StateProj::Inner { inner } => {
                    let frame = ready!(inner.poll_frame(cx));

                    match frame {
                        None => None,
                        Some(Ok(frame)) => {
                            Some(Ok(frame.map_data(Either::Left).map_control(Either::Left)))
                        }
                        Some(Err(error)) => {
                            let error = this.encoder.clone().encode_error(error);
                            let (code, data) = error.into_parts();

                            let inner = Controlled::new(ResponseKind::Err(code), Full::new(data));
                            self.as_mut().project().state.set(State::Error { inner });

                            // next iteration will poll the error stream
                            continue;
                        }
                    }
                }
                StateProj::Error { inner } => {
                    let frame = ready!(inner.poll_frame_unpin(cx));

                    frame.map(|frame| {
                        frame.map(|data| data.map_data(Either::Right).map_control(Either::Right))
                    })
                }
            };

            return Poll::Ready(next);
        }
    }

    fn state(&self) -> Option<super::BodyState> {
        match &self.state {
            State::Inner { inner } => inner.state(),
            State::Error { inner } => inner.state(),
        }
    }

    fn size_hint(&self) -> super::SizeHint {
        // we're still in the middle of encoding an error, add the size hint of the error
        match &self.state {
            State::Inner { inner } => inner.size_hint(),
            State::Error { inner } => inner.size_hint(),
        }
    }
}

#[cfg(test)]
mod test {
    use core::assert_matches::assert_matches;

    use bytes::Bytes;
    use harpc_codec::json::JsonCodec;
    use harpc_types::{error_code::ErrorCode, response_kind::ResponseKind};
    use insta::assert_debug_snapshot;

    use crate::{
        body::{
            Body, BodyState, Frame, SizeHint, encode_error::EncodeError, test::poll_frame_unpin,
        },
        either::Either,
        test::{PollExt, StaticBody},
    };

    #[derive(Debug, thiserror::Error, serde::Serialize)]
    #[error("test error")]
    struct TestError;

    #[test]
    fn encode_error() {
        let inner = StaticBody::<Bytes, !, TestError>::new([Err(TestError)]);
        let mut body = EncodeError::new(inner, JsonCodec);

        let frame = poll_frame_unpin(&mut body)
            .expect("should be ready")
            .expect("should have an item")
            .expect("should be a frame");

        assert_matches!(
            frame,
            Frame::Control(Either::Right(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR
            )))
        );

        let frame = poll_frame_unpin(&mut body)
            .expect("should be ready")
            .expect("should have an item")
            .expect("should be a frame");

        insta::assert_debug_snapshot!(frame, @r###"
        Data(
            Right(
                b"\x01{\"message\":\"test error\",\"details\":null}",
            ),
        )
        "###);

        let frame = poll_frame_unpin(&mut body).expect("should be ready");
        assert!(frame.is_none());
    }

    #[test]
    fn passthrough_data() {
        let inner =
            StaticBody::<Bytes, !, !>::new([Ok(Frame::new_data(Bytes::from_static(b"test data")))]);
        let mut body = EncodeError::new(inner, JsonCodec);

        let frame = poll_frame_unpin(&mut body)
            .expect("should be ready")
            .expect("should have an item")
            .expect("should be a frame");

        assert_matches!(frame, Frame::Data(Either::Left(data)) if data == Bytes::from_static(b"test data"));

        let frame = poll_frame_unpin(&mut body).expect("should be ready");
        assert!(frame.is_none());
    }

    #[test]
    fn passthrough_control() {
        let inner = StaticBody::<Bytes, i32, !>::new([Ok(Frame::new_control(2_i32))]);
        let mut body = EncodeError::new(inner, JsonCodec);

        let frame = poll_frame_unpin(&mut body)
            .expect("should be ready")
            .expect("should have an item")
            .expect("should be a frame");

        assert_matches!(frame, Frame::Control(Either::Left(2)));

        let frame = poll_frame_unpin(&mut body).expect("should be ready");
        assert!(frame.is_none());
    }

    #[test]
    fn passthrough_sizehint() {
        const DATA: &[u8] = b"test data";

        let inner = StaticBody::<Bytes, !, !>::new([Ok(Frame::new_data(Bytes::from_static(DATA)))]);
        let mut body = EncodeError::new(inner, JsonCodec);

        assert_eq!(body.size_hint(), SizeHint::with_exact(DATA.len() as u64));

        let _frame = poll_frame_unpin(&mut body);

        assert_eq!(body.size_hint(), SizeHint::with_exact(0));
    }

    #[test]
    fn size_hint_on_error() {
        const DATA: &[u8] = b"test data";

        let inner = StaticBody::<Bytes, !, TestError>::new([
            Err(TestError),
            Ok(Frame::new_data(Bytes::from_static(DATA))),
        ]);
        let mut body = EncodeError::new(inner, JsonCodec);

        // no error yet, so the size hint should be the size of the data
        assert_eq!(body.size_hint(), SizeHint::with_exact(DATA.len() as u64));

        let _frame = poll_frame_unpin(&mut body);

        // we now have an error, therefore the size hint should include the error
        // `40` is taken from the serialization in the unit test above
        assert_eq!(body.size_hint(), SizeHint::with_exact(40));

        let _frame = poll_frame_unpin(&mut body);

        // once finished (2nd poll), we've exhausted and should have a size hint of 0
        assert_eq!(body.size_hint(), SizeHint::with_exact(0));
    }

    #[test]
    fn passthrough_state() {
        let inner =
            StaticBody::<Bytes, !, !>::new([Ok(Frame::new_data(Bytes::from_static(b"test data")))]);
        let mut body = EncodeError::new(inner, JsonCodec);

        assert_eq!(body.state(), None);

        let _frame = poll_frame_unpin(&mut body);

        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[test]
    fn state_on_error() {
        let inner = StaticBody::<Bytes, !, TestError>::new([Err(TestError)]);
        let mut body = EncodeError::new(inner, JsonCodec);

        assert_eq!(body.state(), None);

        // polling the control frame
        let _frame = poll_frame_unpin(&mut body);
        assert_eq!(body.state(), None);

        // polling the data frame (after that we're finished)
        let _frame = poll_frame_unpin(&mut body);
        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[test]
    fn state_trailing_data_after_error() {
        let inner = StaticBody::<Bytes, !, TestError>::new([
            Err(TestError),
            Ok(Frame::new_data(Bytes::from_static(b"test data"))),
        ]);
        let mut body = EncodeError::new(inner, JsonCodec);

        assert_eq!(body.state(), None);

        // polling the control frame
        let _frame = poll_frame_unpin(&mut body);
        assert_eq!(body.state(), None);

        // polling the error data frame, we're finished, because we **cannot** continue after an
        // error
        let _frame = poll_frame_unpin(&mut body);
        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[test]
    fn size_hint_and_state_with_empty_body() {
        let inner = StaticBody::<Bytes, !, !>::new([]);
        let body = EncodeError::new(inner, JsonCodec);

        assert_eq!(body.size_hint(), SizeHint::with_exact(0));
        assert_eq!(body.state(), Some(BodyState::Complete));
    }

    #[test]
    fn does_not_continue_after_error() {
        let inner = StaticBody::<Bytes, (), TestError>::new([
            Ok(Frame::new_data(Bytes::from_static(b"data1"))),
            Err(TestError),
            Ok(Frame::new_data(Bytes::from_static(b"data2"))),
            Ok(Frame::new_control(())),
            Ok(Frame::new_data(Bytes::from_static(b"data3"))),
        ]);
        let mut body = EncodeError::new(inner, JsonCodec);

        let frame = poll_frame_unpin(&mut body)
            .expect("should be ready")
            .expect("should have an item")
            .expect("should be a frame");
        assert_matches!(frame, Frame::Data(data) if *data.inner() == Bytes::from_static(b"data1"));

        let frame = poll_frame_unpin(&mut body)
            .expect("should be ready")
            .expect("should have an item")
            .expect("should be a frame");
        assert_matches!(
            frame,
            Frame::Control(Either::Right(ResponseKind::Err(
                ErrorCode::INTERNAL_SERVER_ERROR
            )))
        );

        let frame = poll_frame_unpin(&mut body)
            .expect("should be ready")
            .expect("should have an item")
            .expect("should be a frame");
        assert_debug_snapshot!(frame, @r###"
        Data(
            Right(
                b"\x01{\"message\":\"test error\",\"details\":null}",
            ),
        )
        "###);

        assert!(
            poll_frame_unpin(&mut body)
                .expect("should be ready")
                .is_none()
        );
    }
}
