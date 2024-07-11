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

#[cfg(test)]
mod test {
    use core::task::Poll;

    use bytes::Bytes;

    use crate::body::{full::Full, test::poll_frame_unpin, Body, Frame, SizeHint};

    #[test]
    fn poll_frame() {
        let bytes = Bytes::from("hello");

        let mut body = Full::new(bytes.clone());

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(frame, Poll::Ready(Some(Ok(Frame::Data(bytes)))));

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(frame, Poll::Ready(None));

        let frame = poll_frame_unpin(&mut body);
        assert_eq!(frame, Poll::Ready(None));
    }

    #[test]
    fn is_complete() {
        let bytes = Bytes::from("hello");

        let mut body = Full::new(bytes.clone());
        assert_eq!(body.is_complete(), None);

        let _ = poll_frame_unpin(&mut body);
        assert_eq!(body.is_complete(), Some(true));
    }

    #[test]
    fn size_hint() {
        let bytes = Bytes::from("hello");

        let mut body = Full::new(bytes.clone());
        assert_eq!(body.size_hint(), SizeHint::with_exact(5));

        let _ = poll_frame_unpin(&mut body);
        assert_eq!(body.size_hint(), SizeHint::with_exact(0));
    }
}
