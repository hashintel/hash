use bytes::{Buf as _, Bytes};
use futures::future::BoxFuture;
use harpc_tower::{body::BodyExt as _, request::Request, response::Response};
use harpc_types::{response_kind::ResponseKind, subsystem::SubsystemId};

use crate::{route::Route, router::Router};

pub(crate) type BoxReqBody = harpc_tower::body::boxed::UnsyncBoxBody<Bytes, !, !>;
type BoxResBody = harpc_tower::body::boxed::UnsyncBoxBody<Bytes, ResponseKind, !>;

struct BoxedRouteImpl<R> {
    route: R,
}

impl<R> Route<BoxReqBody> for BoxedRouteImpl<R>
where
    R: Route<BoxReqBody, Future: Send + 'static, ResponseBody: Send + 'static>,
{
    type Future = BoxFuture<'static, Response<Self::ResponseBody>>;
    type ResponseBody = BoxResBody;
    type SubsystemId = SubsystemId;

    fn call(&self, request: Request<BoxReqBody>) -> Self::Future {
        let future = self.route.call(request);

        Box::pin(async move {
            let response = future.await;

            response.map_body(|body| {
                body.map_data(|mut buffer| {
                    let length = buffer.remaining();
                    buffer.copy_to_bytes(length)
                })
                .map_control(|control| *control.as_ref())
                .boxed_unsync()
            })
        })
    }
}

pub struct BoxedRoute(
    Box<
        dyn Route<
                BoxReqBody,
                SubsystemId = SubsystemId,
                ResponseBody = BoxResBody,
                Future = BoxFuture<'static, Response<BoxResBody>>,
            >,
    >,
);

impl BoxedRoute {
    pub(crate) fn new<R>(route: R) -> Self
    where
        R: Route<BoxReqBody, Future: Send + 'static, ResponseBody: Send + 'static> + 'static,
    {
        Self(Box::new(BoxedRouteImpl { route }))
    }
}

impl Route<BoxReqBody> for BoxedRoute {
    type Future = BoxFuture<'static, Response<BoxResBody>>;
    type ResponseBody = BoxResBody;
    type SubsystemId = SubsystemId;

    fn call(&self, request: Request<BoxReqBody>) -> Self::Future {
        self.0.call(request)
    }
}

pub type BoxedRouter = Router<BoxedRoute>;
