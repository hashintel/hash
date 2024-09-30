use harpc_tower::{body::Body, request::Request, response::Response};
use harpc_wire_protocol::response::kind::ResponseKind;

use crate::Service;

pub trait ServiceDelegate<S, C> {
    type Service: Service;

    fn call<B>(
        &self,
        request: Request<B>,
        session: &S,
        codec: &C,
    ) -> impl Future<Output = Response<impl Body<Control: AsRef<ResponseKind>>>> + Send
    where
        B: Body<Control = !, Error: Send + Sync> + Send + Sync;
}
