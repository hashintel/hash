mod limited;

use core::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

pub trait Body {
    type Data: Buf;
    type Error;

    fn poll_data(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Self::Data, Self::Error>>>;

    fn is_end_stream(&self) -> bool;
    // we can model is_incomplete through an error instead
}
