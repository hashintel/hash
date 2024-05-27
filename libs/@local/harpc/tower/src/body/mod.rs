mod limited;
mod timeout;

use core::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

pub trait Frame: Sized + From<Self::Data> {
    type Data: Buf;

    fn data(&self) -> Option<&Self::Data>;
    fn data_mut(&mut self) -> Option<&mut Self::Data>;

    fn into_data(self) -> Result<Self::Data, Self>;
}

pub trait Body {
    type Frame: Frame;
    type Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Self::Frame, Self::Error>>>;

    fn is_end_stream(&self) -> bool;
    // we can model is_incomplete through an error instead
}
