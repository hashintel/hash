use harpc_tower::{body::Body, request::Request, response::Response};
use harpc_wire_protocol::response::kind::ResponseKind;

use crate::service::Service;

pub trait CodecRequirement<C> {}

pub trait ServiceDelegate {
    type Service: Service;
    type CodecRequirement;

    fn call<B, C>(
        &self,
        request: Request<B>,
        codec: &C,
    ) -> impl Future<Output = Response<impl Body<Control: AsRef<ResponseKind>>>> + Send
    where
        B: Body<Control = !> + Send + Sync,
        Self::CodecRequirement: CodecRequirement<C>;
}
