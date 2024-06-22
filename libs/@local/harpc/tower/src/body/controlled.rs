use core::task::ready;
use std::{
    pin::Pin,
    task::{Context, Poll},
};

use super::{Body, Frame};

pin_project_lite::pin_project! {
    pub struct Controlled<C, B> {
        control: Option<C>,
        #[pin]
        body: B,
    }
}

impl<C, B> Controlled<C, B> {
    pub fn new(control: C, body: B) -> Self {
        Self {
            control: Some(control),
            body,
        }
    }
}

impl<C, B> Body for Controlled<C, B>
where
    B: Body<Control = !>,
    C: From<!>,
{
    type Control = C;
    type Data = B::Data;
    type Error = B::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        let this = self.project();

        if let Some(control) = this.control.take() {
            return Poll::Ready(Some(Ok(Frame::new_control(control))));
        }

        let Some(result) = ready!(this.body.poll_frame(cx)) else {
            return Poll::Ready(None);
        };

        Poll::Ready(Some(result.map(|frame| frame.map_control(From::from))))
    }

    fn is_complete(&self) -> Option<bool> {
        if self.control.is_some() {
            return None;
        }

        self.body.is_complete()
    }
}
