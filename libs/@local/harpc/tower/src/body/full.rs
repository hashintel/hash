use core::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::{Buf, Bytes};

use super::{Body, Frame, SizeHint};

pub struct Full {
    data: Option<Bytes>,
}

impl Full {
    pub fn new(body: Bytes) -> Self {
        Self { data: Some(body) }
    }
}

impl Body for Full {
    type Control = !;
    type Data = Bytes;
    type Error = !;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        _: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        Poll::Ready(self.data.take().map(Frame::new_data).map(Ok))
    }

    fn is_complete(&self) -> Option<bool> {
        if self.data.is_some() {
            None
        } else {
            Some(true)
        }
    }

    fn size_hint(&self) -> SizeHint {
        self.data
            .as_ref()
            .map(|data| SizeHint::with_exact(u64::try_from(data.remaining()).unwrap()))
            .unwrap_or_else(|| SizeHint::with_exact(0))
    }
}
