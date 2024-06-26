use core::task::ready;
use std::{
    pin::Pin,
    task::{Context, Poll},
};

use futures::Stream;

use super::{Body, Frame};

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct BodyStream<B> {
        #[pin]
        inner: B,
    }
}

impl<B> BodyStream<B> {
    pub fn new(inner: B) -> Self {
        Self { inner }
    }

    pub fn into_data_stream(self) -> BodyDataStream<B> {
        BodyDataStream { inner: self.inner }
    }

    pub fn into_control_stream(self) -> BodyControlStream<B> {
        BodyControlStream { inner: self.inner }
    }
}

impl<B> Stream for BodyStream<B>
where
    B: Body,
{
    type Item = Result<Frame<B::Data, B::Control>, B::Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        return self.project().inner.poll_frame(cx);
    }
}

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct BodyDataStream<B> {
        #[pin]
        inner: B,
    }
}

impl<B> Stream for BodyDataStream<B>
where
    B: Body,
{
    type Item = Result<B::Data, B::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        loop {
            return match ready!(self.as_mut().project().inner.poll_frame(cx)) {
                Some(Ok(frame)) => match frame.into_data() {
                    Ok(data) => Poll::Ready(Some(Ok(data))),
                    Err(_) => continue,
                },
                Some(Err(err)) => Poll::Ready(Some(Err(err))),
                None => Poll::Ready(None),
            };
        }
    }
}

pin_project_lite::pin_project! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct BodyControlStream<B> {
        #[pin]
        inner: B,
    }
}

impl<B> Stream for BodyControlStream<B>
where
    B: Body,
{
    type Item = Result<B::Control, B::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        loop {
            return match ready!(self.as_mut().project().inner.poll_frame(cx)) {
                Some(Ok(frame)) => match frame.into_control() {
                    Ok(control) => Poll::Ready(Some(Ok(control))),
                    Err(_) => continue,
                },
                Some(Err(err)) => Poll::Ready(Some(Err(err))),
                None => Poll::Ready(None),
            };
        }
    }
}
