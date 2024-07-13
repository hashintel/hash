use core::task::{Context, Poll};

use bytes::Bytes;
use error_stack::Report;
use harpc_net::codec::{ErrorEncoder, WireError};
use harpc_wire_protocol::response::kind::ResponseKind;
use tower::{Layer, Service, ServiceExt};

use crate::{
    body::{controlled::Controlled, full::Full, Body},
    either::Either,
    request::Request,
    response::{Parts, Response},
};

pub struct HandleReportLayer<E> {
    encoder: E,
}

impl<E> HandleReportLayer<E> {
    pub fn new(encoder: E) -> Self {
        Self { encoder }
    }
}

impl<S, E> Layer<S> for HandleReportLayer<E>
where
    E: Clone,
{
    type Service = HandleReport<S, E>;

    fn layer(&self, inner: S) -> Self::Service {
        HandleReport {
            inner,
            encoder: self.encoder.clone(),
        }
    }
}

pub struct HandleReport<S, E> {
    inner: S,

    encoder: E,
}

impl<S, E, C, ReqBody, ResBody> Service<Request<ReqBody>> for HandleReport<S, E>
where
    S: Service<Request<ReqBody>, Error = Report<C>, Response = Response<ResBody>> + Clone + Send,
    E: ErrorEncoder + Clone,
    C: error_stack::Context,
    ReqBody: Body<Control = !>,
    ResBody: Body<Control: AsRef<ResponseKind>>,
{
    type Error = !;
    type Response = Response<Either<ResBody, Controlled<ResponseKind, Full<Bytes>>>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        // Taken from axum::HandleError
        // we're always ready because we clone the inner service, therefore it is unused and always
        // ready
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let encoder = self.encoder.clone();

        let clone = self.inner.clone();
        let inner = std::mem::replace(&mut self.inner, clone);

        let session = req.session();

        async move {
            match inner.oneshot(req).await {
                Ok(response) => Ok(response.map_body(Either::Left)),
                Err(report) => {
                    let error = encoder.encode_report(report).await;

                    Ok(Response::from_error(Parts::new(session), error).map_body(Either::Right))
                }
            }
        }
    }
}

pub struct HandleErrorLayer<E> {
    encoder: E,
}

impl<E> HandleErrorLayer<E> {
    pub fn new(encoder: E) -> Self {
        Self { encoder }
    }
}

impl<E, S> Layer<S> for HandleErrorLayer<E>
where
    E: Clone,
{
    type Service = HandleError<S, E>;

    fn layer(&self, inner: S) -> Self::Service {
        HandleError {
            inner,
            encoder: self.encoder.clone(),
        }
    }
}

pub struct HandleError<S, E> {
    inner: S,

    encoder: E,
}

impl<S, E, ReqBody, ResBody> Service<Request<ReqBody>> for HandleError<S, E>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send,
    S::Error: WireError + Send,
    E: ErrorEncoder + Clone,
    ReqBody: Body<Control = !>,
    ResBody: Body<Control: AsRef<ResponseKind>>,
{
    type Error = !;
    type Response = Response<Either<ResBody, Controlled<ResponseKind, Full<Bytes>>>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        // Taken from axum::HandleError
        // we're always ready because we clone the inner service, therefore it is unused and always
        // ready
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let encoder = self.encoder.clone();

        let clone = self.inner.clone();
        let inner = std::mem::replace(&mut self.inner, clone);

        let session = req.session();

        async move {
            match inner.oneshot(req).await {
                Ok(response) => Ok(response.map_body(Either::Left)),
                Err(error) => {
                    let error = encoder.encode_error(error).await;

                    Ok(Response::from_error(Parts::new(session), error).map_body(Either::Right))
                }
            }
        }
    }
}

#[cfg(test)]
mod test {
    use bytes::{Bytes, BytesMut};
    use error_stack::Report;
    use harpc_net::{
        codec::{ErrorEncoder, WireError},
        session::error::TransactionError,
        test_utils::mock_session_id,
    };
    use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};
    use harpc_wire_protocol::{
        request::{procedure::ProcedureDescriptor, service::ServiceDescriptor},
        response::kind::ErrorCode,
    };
    use tower_test::mock::spawn_layer;

    use crate::{
        body::full::Full,
        layer::error::HandleErrorLayer,
        request::{self, Request},
        response::Response,
        Extensions,
    };

    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    struct PlainErrorEncoder;

    impl ErrorEncoder for PlainErrorEncoder {
        async fn encode_report<C>(&self, report: Report<C>) -> TransactionError {
            let code = report
                .request_ref::<ErrorCode>()
                .next()
                .copied()
                .unwrap_or(ErrorCode::INTERNAL_SERVER_ERROR);

            let mut bytes = BytesMut::new();

            let display = report.to_string();
            bytes.extend_from_slice(b"report|");
            bytes.extend_from_slice(display.as_bytes());

            TransactionError {
                code,
                bytes: bytes.freeze(),
            }
        }

        async fn encode_error<E>(&self, error: E) -> TransactionError
        where
            E: WireError + Send,
        {
            let code = error.code();

            let mut bytes = BytesMut::new();

            let display = error.to_string();
            bytes.extend_from_slice(b"plain|");
            bytes.extend_from_slice(display.as_bytes());

            TransactionError {
                code,
                bytes: bytes.freeze(),
            }
        }
    }

    #[tokio::test]
    async fn handle_error() {
        let (service, handle) =
            spawn_layer::<Request<_>, Response<_>, _>(HandleErrorLayer::new(PlainErrorEncoder));

        service.call(Request::from_parts(
            request::Parts {
                service: ServiceDescriptor {
                    id: ServiceId::new(0x00),
                    version: Version {
                        major: 0x00,
                        minor: 0x00,
                    },
                },
                procedure: ProcedureDescriptor {
                    id: ProcedureId::new(0x00),
                },
                session: mock_session_id(0x00),
                extensions: Extensions::new(),
            },
            Full::new(Bytes::from_static(b"hello world" as &[_])),
        ));
    }
}
