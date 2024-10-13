use core::{
    error::Error,
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::Bytes;
use harpc_codec::encode::ErrorEncoder;
use harpc_types::response_kind::ResponseKind;

use super::{Body, Frame, full::Full};
use crate::{
    body::{BodyExt, controlled::Controlled},
    either::Either,
};

pin_project_lite::pin_project! {
    pub struct EncodeError<B, E> {
        #[pin]
        inner: B,
        intermediate: Option<Controlled<ResponseKind, Full<Bytes>>>,
        encoder: E,
    }
}

impl<B, E> EncodeError<B, E> {
    pub const fn new(inner: B, encoder: E) -> Self {
        Self {
            inner,
            encoder,
            intermediate: None,
        }
    }

    fn poll_intermediate(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Either<B::Data, Bytes>, Either<B::Control, ResponseKind>>, !>>>
    where
        B: Body,
    {
        let this = self.project();

        let Some(intermediate) = this.intermediate else {
            return Poll::Ready(None);
        };

        // if we have an intermediate stream, try to poll it.
        let error = ready!(intermediate.poll_frame_unpin(cx));

        match error {
            None => {
                // we have exhausted the error, therefore continue with the inner stream
                *this.intermediate = None;
                Poll::Ready(None)
            }
            Some(Ok(frame)) => Poll::Ready(Some(Ok(frame
                .map_data(Either::Right)
                .map_control(Either::Right)))),
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
        if let Some(value) = ready!(self.as_mut().poll_intermediate(cx)) {
            return Poll::Ready(Some(value));
        }

        let this = self.as_mut().project();
        let frame = ready!(this.inner.poll_frame(cx));

        match frame {
            None => Poll::Ready(None),
            Some(Ok(frame)) => Poll::Ready(Some(Ok(frame
                .map_data(Either::Left)
                .map_control(Either::Left)))),
            Some(Err(error)) => {
                let error = this.encoder.clone().encode_error(error);
                let (code, data) = error.into_parts();

                let inner = Controlled::new(ResponseKind::Err(code), Full::new(data));
                *this.intermediate = Some(inner);

                // this will never return `Poll::Pending` because we just set the intermediate
                // stream, and it has exactly two frames.
                let value = self.poll_intermediate(cx);

                // sanity check
                debug_assert!(value.is_ready());

                value
            }
        }
    }

    fn state(&self) -> Option<super::BodyState> {
        // we're still in the middle of encoding an error, therefore we're not done yet
        self.intermediate.as_ref().map_or_else(
            || self.inner.state(),
            |intermediate| {
                // if we're complete, check the inner state (as that one is going to poll next)
                intermediate.state().and_then(|_| self.inner.state())
            },
        )
    }

    fn size_hint(&self) -> super::SizeHint {
        // we're still in the middle of encoding an error, add the size hint of the error
        self.intermediate.as_ref().map_or_else(
            || self.inner.size_hint(),
            |intermediate| intermediate.size_hint() + self.inner.size_hint(),
        )
    }
}

#[cfg(test)]
mod test {
    use core::assert_matches::assert_matches;

    use bytes::Bytes;
    use harpc_codec::json::JsonCodec;
    use harpc_types::{error_code::ErrorCode, response_kind::ResponseKind};

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
        assert_eq!(
            body.size_hint(),
            SizeHint::with_exact(DATA.len() as u64 + 40)
        );

        let _frame = poll_frame_unpin(&mut body);

        // once finished (2nd poll), we should have the size hint of the data again
        assert_eq!(body.size_hint(), SizeHint::with_exact(DATA.len() as u64));

        let _frame = poll_frame_unpin(&mut body);

        // once finished (3rd poll), we should have the size hint of the data again
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

        // polling the error data frame, but we're not finished yet
        let _frame = poll_frame_unpin(&mut body);
        assert_eq!(body.state(), None);

        // polling the data frame
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
    fn continues_after_error() {
        let inner = StaticBody::<Bytes, !, TestError>::new([
            Ok(Frame::new_data(Bytes::from_static(b"data1"))),
            Err(TestError),
            Ok(Frame::new_data(Bytes::from_static(b"data2"))),
            Ok(Frame::new_control(())),
            Ok(Frame::new_data(Bytes::from_static(b"data3"))),
        ]);
    }

    // #[test]
    // fn continues_inner_body_after_error() {
    //     let test_body = TestBody {
    //         frames: vec![
    //             Ok(Frame::new_data(Bytes::from_static(b"data1"))),
    //             Err(Report::new(TestError)),
    //             Ok(Frame::new_data(Bytes::from_static(b"data2"))),
    //             Ok(Frame::new_control(())),
    //             Ok(Frame::new_data(Bytes::from_static(b"data3"))),
    //         ],
    //     };
    //     let encoder = JsonErrorEncoder;
    //     let mut encode_error = EncodeError::new(test_body, encoder);

    //     // First data frame
    //     let frame = poll_frame_unpin(&mut encode_error);
    //     assert!(
    //         matches!(frame, Poll::Ready(Some(Ok(Frame::Data(Either::Left(data)))) if data ==
    // Bytes::from_static(b"data1")))     );

    //     // Error frame (control)
    //     let frame = poll_frame_unpin(&mut encode_error);
    //     assert!(matches!(
    //         frame,
    //         Poll::Ready(Some(Ok(Frame::Control(Either::Right(ResponseKind::Err(
    //             _
    //         ))))))
    //     ));

    //     // Error frame (data)
    //     let frame = poll_frame_unpin(&mut encode_error);
    //     assert!(matches!(
    //         frame,
    //         Poll::Ready(Some(Ok(Frame::Data(Either::Right(_)))))
    //     ));

    //     // Second data frame (should not be lost after error)
    //     let frame = poll_frame_unpin(&mut encode_error);
    //     assert!(
    //         matches!(frame, Poll::Ready(Some(Ok(Frame::Data(Either::Left(data)))) if data ==
    // Bytes::from_static(b"data2")))     );

    //     // Control frame
    //     let frame = poll_frame_unpin(&mut encode_error);
    //     assert!(matches!(
    //         frame,
    //         Poll::Ready(Some(Ok(Frame::Control(Either::Left(_)))))
    //     ));

    //     // Third data frame
    //     let frame = poll_frame_unpin(&mut encode_error);
    //     assert!(matches!(frame, Poll::Ready(Some(Ok(Frame::Data(Either::Left(data)))) if data ==
    // Bytes::from_static(b"data3")));

    //         // End of stream
    //         let frame = poll_frame_unpin(&mut encode_error);
    //         assert!(matches!(frame, Poll::Ready(None))));
    // }
}
