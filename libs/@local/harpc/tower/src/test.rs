use alloc::collections::VecDeque;
use core::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

use crate::body::{Body, BodyState, Frame, SizeHint};

pin_project_lite::pin_project! {
    pub(crate) struct StaticBody<D, C, E> {
        frames: VecDeque<Result<Frame<D, C>, E>>,
    }
}

impl<D, C, E> StaticBody<D, C, E> {
    pub fn new(frames: impl IntoIterator<Item = Result<Frame<D, C>, E>>) -> Self {
        Self {
            frames: frames.into_iter().collect(),
        }
    }
}

impl<D, C, E> Body for StaticBody<D, C, E>
where
    D: Buf,
{
    type Control = C;
    type Data = D;
    type Error = E;

    fn poll_frame(
        self: Pin<&mut Self>,
        _: &mut Context,
    ) -> Poll<Option<crate::body::BodyFrameResult<Self>>> {
        let this = self.project();
        let frame = this.frames.pop_front();

        Poll::Ready(frame)
    }

    fn state(&self) -> Option<BodyState> {
        if self.frames.is_empty() {
            Some(BodyState::Complete)
        } else {
            None
        }
    }

    fn size_hint(&self) -> SizeHint {
        let size: usize = self
            .frames
            .iter()
            .map(Result::as_ref)
            .filter_map(Result::ok)
            .filter_map(Frame::data)
            .map(D::remaining)
            .sum();

        SizeHint::with_exact(size as u64)
    }
}

pub trait PollExt {
    type Item;

    fn unwrap(self) -> Self::Item;

    fn expect(self, message: impl AsRef<str>) -> Self::Item;
}

impl<T> PollExt for Poll<T> {
    type Item = T;

    #[track_caller]
    fn unwrap(self) -> Self::Item {
        match self {
            Poll::Ready(val) => val,
            Poll::Pending => panic!("should be ready"),
        }
    }

    #[track_caller]
    fn expect(self, message: impl AsRef<str>) -> Self::Item {
        match self {
            Poll::Ready(val) => val,
            Poll::Pending => panic!("{}", message.as_ref()),
        }
    }
}
