use schemars::JsonSchema;
use serde::Serialize;
use type_system::principal::actor::ActorId;

use crate::rest::extract::Json;

/// The caller of the request.
#[derive(Serialize, JsonSchema)]
#[schemars(extend("required" = ["actor"]))]
pub(crate) struct CallerResponse {
    /// The actor the request's credentials identify, or `null` for an anonymous request.
    actor: Option<ActorId>,
}

pub(crate) async fn caller<A: Into<Option<ActorId>>>(actor: A) -> Json<CallerResponse> {
    Json(CallerResponse {
        actor: actor.into(),
    })
}
