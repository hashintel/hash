use aide::{
    OperationInput,
    axum::{ApiRouter, routing::get_with},
    transform::TransformOperation,
};
use axum::{Json, extract::FromRequestParts};
use schemars::JsonSchema;
use serde::Serialize;
use type_system::principal::actor::ActorId;

/// The resolved caller.
#[derive(Serialize, JsonSchema)]
#[schemars(extend("required" = ["actor"]))]
pub(super) struct CallerResponse {
    /// The resolved actor, or `null` for an anonymous request.
    actor: Option<ActorId>,
}

pub(super) async fn caller<Actor: Into<Option<ActorId>>>(actor: Actor) -> Json<CallerResponse> {
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

async fn authenticated_caller<Actor: Into<ActorId>>(
    actor: Actor,
) -> Json<AuthenticatedCallerResponse> {
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

pub(super) fn routes<Actor, MaybeActor>() -> ApiRouter
where
    Actor: FromRequestParts<()> + OperationInput + Into<ActorId> + Send + 'static,
    MaybeActor: FromRequestParts<()> + OperationInput + Into<Option<ActorId>> + Send + 'static,
{
    ApiRouter::new()
        .api_route("/caller", get_with(caller::<MaybeActor>, document_caller))
        .api_route(
            "/authenticated-caller",
            get_with(authenticated_caller::<Actor>, document_authenticated_caller),
        )
        .with_path_items(|path| path.tag("Caller"))
}
