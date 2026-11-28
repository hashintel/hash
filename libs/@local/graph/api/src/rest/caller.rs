use aide::transform::TransformOperation;
use schemars::JsonSchema;
use serde::Serialize;
use type_system::principal::actor::ActorId;

use super::{
    credentials::{Actor, Credentials},
    extract::Json,
    routing::{self, Route, Routes},
};

/// The caller of the request.
#[derive(Serialize, JsonSchema)]
struct AuthenticatedCallerResponse {
    /// The actor the request's credentials identify.
    actor: ActorId,
}

async fn authenticated_caller<A: Into<ActorId>>(actor: A) -> Json<AuthenticatedCallerResponse> {
    Json(AuthenticatedCallerResponse {
        actor: actor.into(),
    })
}

fn document_authenticated_caller(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("getAuthenticatedCaller")
        .summary("Get the authenticated caller")
}

fn authenticated_caller_route<C: Credentials, T: Clone + Send + Sync + 'static>() -> Route<T> {
    routing::get(
        authenticated_caller::<Actor<C>>,
        document_authenticated_caller,
    )
}

pub(super) fn authenticated_routes<C: Credentials, T: Clone + Send + Sync + 'static>() -> Routes<T>
{
    Routes::new()
        .route(
            "/authenticated-caller",
            authenticated_caller_route::<C, T>(),
        )
        .tag("Caller")
}
