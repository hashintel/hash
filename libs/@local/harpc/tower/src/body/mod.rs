pub mod either;
pub mod full;
pub mod limited;
pub mod map;
mod size_hint;
pub mod timeout;

use core::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

pub use self::size_hint::SizeHint;

pub trait Body {
    type Data: Buf;
    type Error;

    fn poll_data(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Self::Data, Self::Error>>>;

    fn is_complete(&self) -> Option<bool>;
    // we can model is_incomplete through an error instead

    fn size_hint(&self) -> SizeHint {
        SizeHint::default()
    }
}
