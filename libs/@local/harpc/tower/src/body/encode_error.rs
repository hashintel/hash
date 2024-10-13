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
        match self.intermediate {
            // we're still in the middle of encoding an error, therefore we're not done
            Some(_) => None,
            None => self.inner.state(),
        }
    }

    fn size_hint(&self) -> super::SizeHint {
        match &self.intermediate {
            // we're still in the middle of encoding an error, add the size hint of the error
            Some(intermediate) => intermediate.size_hint() + self.inner.size_hint(),
            None => self.inner.size_hint(),
        }
    }
}
