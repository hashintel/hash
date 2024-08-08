use core::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Bytes;
use futures::StreamExt;
use harpc_net::session::server::transaction::TransactionStream;

use crate::body::{Body, BodyFrameResult, BodyState, Frame};

#[derive(Debug)]
pub struct RequestBody {
    inner: TransactionStream,
}

impl Body for RequestBody {
    type Control = !;
    type Data = Bytes;
    type Error = !;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<BodyFrameResult<Self>>> {
        self.inner
            .poll_next_unpin(cx)
            .map(Ok)
            .map(Result::transpose)
            .map_ok(Frame::new_data)
    }

    fn state(&self) -> Option<BodyState> {
        self.inner.is_incomplete().map(|incomplete| {
            if incomplete {
                BodyState::Incomplete
            } else {
                BodyState::Complete
            }
        })
    }
}
