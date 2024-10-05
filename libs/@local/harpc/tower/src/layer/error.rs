use core::{
    error::Error,
    fmt::{self, Debug, Display, Formatter},
    task::{Context, Poll},
};

use bytes::Bytes;
use harpc_net::codec::{ErrorEncoder, WireError};
use harpc_wire_protocol::response::kind::{ErrorCode, ResponseKind};
use tower::{Layer, Service, ServiceExt};

use crate::{
    Extensions,
    body::{Body, controlled::Controlled, full::Full},
    either::Either,
    request::Request,
    response::{Parts, Response},
};

pub struct BoxedError(Box<dyn Error + Send + Sync + 'static>);

impl BoxedError {
    #[must_use]
    pub fn into_inner(self) -> Box<dyn Error + Send + Sync + 'static> {
        self.0
    }
}

impl Debug for BoxedError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.0, fmt)
    }
}

impl Display for BoxedError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, fmt)
    }
}

impl Error for BoxedError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&*self.0)
    }

    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        self.0.provide(request);
    }
}

impl WireError for BoxedError {
    fn code(&self) -> ErrorCode {
        core::error::request_value::<ErrorCode>(self)
            .or_else(|| core::error::request_ref::<ErrorCode>(self).copied())
            .unwrap_or(ErrorCode::INTERNAL_SERVER_ERROR)
    }
}

impl From<Box<dyn Error + Send + Sync + 'static>> for BoxedError {
    fn from(error: Box<dyn Error + Send + Sync + 'static>) -> Self {
        Self(error)
    }
}

pub struct HandleErrorLayer<E> {
    encoder: E,
}

impl<E> HandleErrorLayer<E> {
    pub const fn new(encoder: E) -> Self {
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
    S::Error: Into<Box<dyn Error + Send + Sync + 'static>>,
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
        let inner = core::mem::replace(&mut self.inner, clone);

        let session = req.session();

        async move {
            match inner.oneshot(req).await {
                Ok(response) => Ok(response.map_body(Either::Left)),
                Err(error) => {
                    // this is not ideal, because we lose the error during conversion and need to
                    // use dynamic dispatch, but there is no other easy way to do this in tower
                    let error = BoxedError::from(error.into());

                    let error = encoder.encode_error(error).await;

                    Ok(Response::from_error(
                        Parts {
                            session,
                            extensions: Extensions::new(),
                        },
                        error,
                    )
                    .map_body(Either::Right))
                }
            }
        }
    }
}

#[cfg(test)]
pub(crate) mod test {
    use core::{error::Error, fmt::Display};

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
        response::kind::{ErrorCode, ResponseKind},
    };
    use tokio_test::{assert_pending, assert_ready};
    use tower_test::mock::spawn_layer;

    use crate::{
        Extensions,
        body::{BodyExt, Frame, controlled::Controlled, full::Full},
        either::Either,
        layer::error::HandleErrorLayer,
        request::{self, Request},
        response::{self, Response},
    };

    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub(crate) struct PlainErrorEncoder;

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

    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub(crate) struct GenericError(ErrorCode);

    impl GenericError {
        pub(crate) const fn new(code: ErrorCode) -> Self {
            Self(code)
        }
    }

    impl Display for GenericError {
        fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
            fmt.write_str("generic error")
        }
    }

    impl Error for GenericError {
        fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
            request.provide_value(self.0);
        }
    }

    pub(crate) const BODY: &[u8] = b"hello world";

    pub(crate) fn request() -> Request<Full<Bytes>> {
        Request::new(
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
            Full::new(Bytes::from_static(BODY)),
        )
    }

    #[tokio::test]
    async fn handle_error() {
        let (mut service, mut handle) = spawn_layer(HandleErrorLayer::new(PlainErrorEncoder));

        assert_pending!(handle.poll_request());
        assert_ready!(service.poll_ready()).expect("should be ready");

        let response = tokio::spawn(service.call(request()));

        let Some((mut actual, send_response)) = handle.next_request().await else {
            panic!("expected a request, but non was received.");
        };

        let body = actual.body_mut();
        let Ok(frame) = body.frame().await.expect("frame should be present");

        assert_eq!(frame, Frame::Data(Bytes::from_static(BODY)));

        send_response.send_error(GenericError(ErrorCode::INTERNAL_SERVER_ERROR));

        // the left side is never invoked, but we still need to poll it
        let mut response: Response<Either<Controlled<ResponseKind, Full<Bytes>>, _>> = response
            .await
            .expect("should be able to join")
            .expect("response should be present");

        let body = response.body_mut();
        let Ok(frame) = body.frame().await.expect("frame should be present");
        let control = frame
            .into_control()
            .expect("should be data frame")
            .into_inner();
        assert_eq!(control, ResponseKind::Err(ErrorCode::INTERNAL_SERVER_ERROR));

        let Ok(frame) = body.frame().await.expect("frame should be present");
        let data = frame
            .into_data()
            .expect("should be data frame")
            .into_inner();
        assert_eq!(data, Bytes::from_static(b"plain|generic error" as &[_]));
    }

    #[tokio::test]
    async fn passthrough() {
        let (mut service, mut handle) = spawn_layer(HandleErrorLayer::new(PlainErrorEncoder));

        assert_pending!(handle.poll_request());
        assert_ready!(service.poll_ready()).expect("should be ready");

        let response = tokio::spawn(service.call(request()));

        let Some((mut actual, send_response)) = handle.next_request().await else {
            panic!("expected a request, but non was received.");
        };

        let body = actual.body_mut();
        let Ok(frame) = body.frame().await.expect("frame should be present");

        assert_eq!(frame, Frame::Data(Bytes::from_static(BODY)));

        send_response.send_response(Response::from_parts(
            response::Parts {
                session: actual.session(),
                extensions: Extensions::new(),
            },
            Controlled::new(
                ResponseKind::Ok,
                Full::new(Bytes::from_static(b"response" as &[_])),
            ),
        ));

        // the left side is never invoked, but we still need to poll it
        let mut response = response
            .await
            .expect("should be able to join")
            .expect("response should be present");

        let body = response.body_mut();
        let Ok(frame) = body.frame().await.expect("frame should be present");
        let control = frame
            .into_control()
            .expect("should be data frame")
            .into_inner();
        assert_eq!(control, ResponseKind::Ok);

        let Ok(frame) = body.frame().await.expect("frame should be present");
        let data = frame
            .into_data()
            .expect("should be data frame")
            .into_inner();
        assert_eq!(data, Bytes::from_static(b"response" as &[_]));
    }
}
