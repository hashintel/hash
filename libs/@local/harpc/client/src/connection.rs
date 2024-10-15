use alloc::sync::Arc;
use core::task::{Context, Poll};

use bytes::Buf;
use error_stack::Report;
use futures::StreamExt;
use harpc_net::session::error::ConnectionPartiallyClosedError;
use harpc_tower::{
    body::{Body, BodyExt},
    net::unpack::Unpack,
    request::Request,
    response::{self, Response},
};
use tower::Service;

use crate::TransportLayerGuard;

#[derive(Debug, Clone)]
pub struct Connection {
    connection: Arc<harpc_net::session::client::Connection>,

    _guard: TransportLayerGuard,
}

impl Connection {
    pub(crate) fn new(
        connection: harpc_net::session::client::Connection,
        guard: TransportLayerGuard,
    ) -> Self {
        Self {
            connection: Arc::new(connection),
            _guard: guard,
        }
    }
}

impl<ReqBody> Service<Request<ReqBody>> for Connection
where
    ReqBody: Body<Control = !, Error = !> + Send + 'static,
{
    type Error = Report<ConnectionPartiallyClosedError>;
    type Response = Response<Unpack>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let connection = Arc::clone(&self.0);

        async move {
            let service = req.service();
            let procedure = req.procedure();
            let session = req.session();

            let body = req
                .into_body()
                .into_stream()
                .into_data_stream()
                .map(|Ok(mut data)| {
                    let remaining = data.remaining();

                    data.copy_to_bytes(remaining)
                });

            let value = connection.call(service, procedure, body).await?;

            let body = Unpack::new(value);

            let parts = response::Parts::new(session);
            Ok(Response::from_parts(parts, body))
        }
    }
}
