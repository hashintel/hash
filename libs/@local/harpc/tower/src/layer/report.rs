use core::task::{Context, Poll};

use bytes::Bytes;
use error_stack::Report;
use harpc_net::codec::ErrorEncoder;
use harpc_wire_protocol::response::kind::ResponseKind;
use tower::{Layer, Service, ServiceExt};

use crate::{
    body::{controlled::Controlled, full::Full, Body},
    either::Either,
    request::Request,
    response::{Parts, Response},
    Extensions,
};

pub struct HandleReportLayer<E> {
    encoder: E,
}

impl<E> HandleReportLayer<E> {
    pub const fn new(encoder: E) -> Self {
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
        let inner = core::mem::replace(&mut self.inner, clone);

        let session = req.session();

        async move {
            match inner.oneshot(req).await {
                Ok(response) => Ok(response.map_body(Either::Left)),
                Err(report) => {
                    let error = encoder.encode_report(report).await;

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
mod test {
    use bytes::Bytes;
    use error_stack::Report;
    use harpc_wire_protocol::response::kind::{ErrorCode, ResponseKind};
    use tokio_test::{assert_pending, assert_ready};
    use tower::{Layer, Service, ServiceExt};
    use tower_test::mock::{self, spawn_with};

    use crate::{
        body::{controlled::Controlled, full::Full, BodyExt, Frame},
        either::Either,
        layer::{
            error::{
                test::{request, GenericError, PlainErrorEncoder, BODY},
                BoxedError,
            },
            report::HandleReportLayer,
        },
        request::Request,
        response::{self, Response},
        Extensions,
    };

    #[expect(clippy::type_complexity, reason = "test code")]
    fn service() -> (
        mock::Spawn<
            impl Service<
                Request<Full<Bytes>>,
                Response = Response<
                    Either<
                        Controlled<ResponseKind, Full<Bytes>>,
                        Controlled<ResponseKind, Full<Bytes>>,
                    >,
                >,
                Error = !,
                Future: Send,
            > + Send
            + Sync
            + 'static,
        >,
        mock::Handle<Request<Full<Bytes>>, Response<Controlled<ResponseKind, Full<Bytes>>>>,
    ) {
        spawn_with(|service| {
            let service = service.map_err(|error| Report::from(BoxedError::from(error)));

            HandleReportLayer::new(PlainErrorEncoder).layer(service)
        })
    }

    #[tokio::test]
    async fn handle_error() {
        let (mut service, mut handle) = service();

        assert_pending!(handle.poll_request());
        assert_ready!(service.poll_ready()).expect("should be ready");

        let response = tokio::spawn(service.call(request()));

        let Some((mut actual, send_response)) = handle.next_request().await else {
            panic!("expected a request, but non was received.");
        };

        let body = actual.body_mut();
        let Ok(frame) = body.frame().await.expect("frame should be present");

        assert_eq!(frame, Frame::Data(Bytes::from_static(BODY)));

        send_response.send_error(Report::from(GenericError::new(
            ErrorCode::INSTANCE_TRANSACTION_LIMIT_REACHED,
        )));

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
        assert_eq!(control, ResponseKind::Err(ErrorCode::INTERNAL_SERVER_ERROR));

        let Ok(frame) = body.frame().await.expect("frame should be present");
        let data = frame
            .into_data()
            .expect("should be data frame")
            .into_inner();
        assert_eq!(data, Bytes::from_static(b"report|generic error" as &[_]));
    }

    #[tokio::test]
    async fn passthrough() {
        let (mut service, mut handle) = service();

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
