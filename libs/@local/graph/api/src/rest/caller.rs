use aide::transform::TransformOperation;
use schemars::JsonSchema;
use serde::Serialize;
use type_system::principal::actor::ActorId;

use super::{
    credentials::{Actor, AdmitsAnonymous, Credentials, MaybeActor},
    extract::Json,
    routing::{self, Route, Routes},
};

/// The resolved caller.
#[derive(Serialize, JsonSchema)]
#[schemars(extend("required" = ["actor"]))]
pub(super) struct CallerResponse {
    /// The resolved actor, or `null` for an anonymous request.
    actor: Option<ActorId>,
}

pub(super) async fn caller<A: Into<Option<ActorId>>>(actor: A) -> Json<CallerResponse> {
    Json(CallerResponse {
        actor: actor.into(),
    })
}

/// The resolved caller.
#[derive(Serialize, JsonSchema)]
struct AuthenticatedCallerResponse {
    /// The resolved actor.
    actor: ActorId,
}

async fn authenticated_caller<A: Into<ActorId>>(actor: A) -> Json<AuthenticatedCallerResponse> {
    Json(AuthenticatedCallerResponse {
        actor: actor.into(),
    })
}

fn document_caller(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("getCaller")
        .summary("Get the caller")
        .description("Returns the resolved actor, or `actor: null` for an anonymous request.")
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

pub(super) fn routes<C: AdmitsAnonymous, T: Clone + Send + Sync + 'static>() -> Routes<T> {
    Routes::new()
        .route(
            "/caller",
            routing::get(caller::<MaybeActor<C>>, document_caller),
        )
        .route(
            "/authenticated-caller",
            authenticated_caller_route::<C, T>(),
        )
        .tag("Caller")
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
