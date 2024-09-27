use harpc_net::codec::Codec;
use harpc_tower::{body::Body, request::Request, response::Response};
use harpc_wire_protocol::response::kind::ResponseKind;

pub trait ServiceDelegate {
    fn call<B>(
        request: Request<B>,
        codec: impl Codec,
    ) -> impl Future<Output = Response<impl Body<Control: AsRef<ResponseKind>>>> + Send
    where
        B: Body<Control = !> + Send + Sync;
}
