use harpc_tower::{body::Body, request::Request, response::Response};
use harpc_wire_protocol::response::kind::ResponseKind;

use crate::service::Service;

pub trait ServiceDelegate {
    type Service: Service;
    type Codec;

    fn call<B>(
        request: Request<B>,
        codec: &Self::Codec,
    ) -> impl Future<Output = Response<impl Body<Control: AsRef<ResponseKind>>>> + Send
    where
        B: Body<Control = !> + Send + Sync;
}
