use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use harpc_net::{
    codec::{ErrorEncoder, WireError},
    session::error::TransactionError,
};
use harpc_wire_protocol::response::kind::ResponseKind;

use super::Body;
use crate::body::{controlled::Controlled, full::Full};

pin_project_lite::pin_project! {
    pub struct BodyWireErrorEncoder<B, E> {
        #[pin]
        inner: B,
        encoder: E,
    }
}

impl<B, E> BodyWireErrorEncoder<B, E> {
    pub fn new(inner: B, encoder: E) -> Self {
        Self { inner, encoder }
    }
}

impl<B, E> Body for BodyWireErrorEncoder<B, E>
where
    B: Body<Control: AsRef<ResponseKind>, Error: WireError + Send>,
    E: ErrorEncoder,
{
    type Control = ResponseKind;
    type Data = B::Data;
    type Error = !;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<super::BodyFrameResult<Self>>> {
        let this = self.project();

        let frame = ready!(this.inner.poll_frame(cx));
        match frame {
            Some(Ok(data)) => Poll::Ready(Some(Ok(data.map_control(|control| *control.as_ref())))),
            Some(Err(error)) => {
                async move {
                    let TransactionError { code, bytes } = this.encoder.encode_error(error).await;
                    let frame =Controlled::new(ResponseKind::Err(code), Full::new(bytes))
                };

                todo!("handle error")
            }
            None => Poll::Ready(None),
        }
    }

    fn state(&self) -> Option<super::BodyState> {
        todo!()
    }

    fn size_hint(&self) -> super::SizeHint {
        super::SizeHint::default()
    }
}
