use core::{
    error::Error,
    task::{Context, Poll},
};

use bytes::Bytes;
use harpc_codec::error::NetworkError;
use harpc_types::response_kind::ResponseKind;
use tower::{Layer, Service, ServiceExt as _};

use crate::{
    Extensions,
    body::{Body, controlled::Controlled, full::Full},
    either::Either,
    request::Request,
    response::{Parts, Response},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct HandleErrorLayer {
    _private: (),
}

impl HandleErrorLayer {
    #[expect(
        clippy::new_without_default,
        reason = "layer construction should be explicit and we might add fields in the future"
    )]
    #[must_use]
    pub const fn new() -> Self {
        Self { _private: () }
    }
}

impl<S> Layer<S> for HandleErrorLayer {
    type Service = HandleErrorService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        HandleErrorService { inner }
    }
}

pub struct HandleErrorService<S> {
    inner: S,
}

impl<S, ReqBody, ResBody> Service<Request<ReqBody>> for HandleErrorService<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send,
    S::Error: Error,
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
        let clone = self.inner.clone();
        let inner = core::mem::replace(&mut self.inner, clone);

        let session = req.session();

        async move {
            match inner.oneshot(req).await {
                Ok(response) => Ok(response.map_body(Either::Left)),
                Err(error) => {
                    let error = NetworkError::capture_error(&error);

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
    use core::{
        error::Error,
        fmt::{self, Debug, Display},
    };

    use bytes::Bytes;
    use harpc_net::test_utils::mock_session_id;
    use harpc_types::{
        error_code::ErrorCode,
        procedure::{ProcedureDescriptor, ProcedureId},
        response_kind::ResponseKind,
        subsystem::{SubsystemDescriptor, SubsystemId},
        version::Version,
    };
    use tokio_test::{assert_pending, assert_ready};
    use tower::{Layer as _, ServiceExt as _};
    use tower_test::mock::spawn_with;

    use crate::{
        Extensions,
        body::{BodyExt as _, Frame, controlled::Controlled, full::Full},
        either::Either,
        layer::error::HandleErrorLayer,
        request::{self, Request},
        response::{self, Response},
    };

    pub(crate) struct BoxedError(Box<dyn Error + Send + Sync + 'static>);

    impl serde::Serialize for BoxedError {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: serde::Serializer,
        {
            serializer.collect_str(&self)
        }
    }

    impl Debug for BoxedError {
        fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
            Debug::fmt(&self.0, fmt)
        }
    }

    impl Display for BoxedError {
        fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
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

    impl From<Box<dyn Error + Send + Sync + 'static>> for BoxedError {
        fn from(error: Box<dyn Error + Send + Sync + 'static>) -> Self {
            Self(error)
        }
    }

    #[derive(
        Debug,
        Copy,
        Clone,
        PartialEq,
        Eq,
        PartialOrd,
        Ord,
        Hash,
        serde::Serialize,
        serde::Deserialize,
    )]
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
        Request::from_parts(
            request::Parts {
                subsystem: SubsystemDescriptor {
                    id: SubsystemId::new(0x00),
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
        let (mut service, mut handle) = spawn_with(|mock| {
            let mock = mock.map_err(BoxedError::from);

            HandleErrorLayer::new().layer(mock)
        });

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

        insta::assert_debug_snapshot!(data, @r###"b"\0\0\0\rgeneric error""###);
    }

    #[tokio::test]
    async fn passthrough() {
        let (mut service, mut handle) = spawn_with(|mock| {
            let mock = mock.map_err(BoxedError::from);

            HandleErrorLayer::new().layer(mock)
        });

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
