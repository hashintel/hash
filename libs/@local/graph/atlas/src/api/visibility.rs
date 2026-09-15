//! Request-held publications and resolved visibility for document assembly.
//!
//! The observation fixes generation selection before store resolution. Documents borrow the
//! requested world and epoch even if a different generation becomes present meanwhile.

use alloc::sync::Arc;

use aide::{OperationInput, generate::GenContext, openapi};
use axum::{extract::FromRequestParts, http::request::Parts};
use serde_json::value::RawValue;
use type_system::principal::actor::ActorId;

use super::{
    AppState,
    authorization::AuthorityScope,
    problem::{Problem, unauthorized},
};
use crate::{
    morton::Zoom,
    serve::{
        runtime::registry::Observation,
        scene::Scene,
        visibility::cache::{CacheEntry, FilterDigest},
    },
};

/// One admitted request's captured publications, scope and delivery offset.
pub(super) struct Visibility {
    observation: Observation,
    entry: Arc<CacheEntry>,
    offset: Zoom,
}

impl Visibility {
    /// Binds this request's schedule at its resolved offset.
    ///
    /// The bound [`Scene`] is what document assembly reads from.
    ///
    /// # Errors
    ///
    /// Returns the unauthorized [`Problem`] when the authority offset cannot bind the entry's
    /// delivery schedule.
    pub(super) fn scene(&self) -> Result<Scene<'_>, Problem<'static>> {
        let requested = self.observation.requested();
        Scene::of(
            requested.world(),
            requested.epoch(),
            &self.entry,
            self.offset,
        )
        .map_err(|error| {
            tracing::error!(
                ?error,
                "the authority offset cannot bind its delivery schedule"
            );
            unauthorized()
        })
    }
}

impl<R: Send> FromRequestParts<AppState<R>> for Visibility {
    type Rejection = Problem<'static>;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState<R>,
    ) -> Result<Self, Self::Rejection> {
        let AuthorityScope { observation, scope } =
            AuthorityScope::from_request_parts(parts, state).await?;

        let entry = resolve(
            state,
            &observation,
            scope.actor.into(),
            scope.filter.digest(),
            None,
        )
        .await?;

        Ok(Self {
            observation,
            entry,
            offset: scope.k,
        })
    }
}

impl OperationInput for Visibility {
    fn operation_input(ctx: &mut GenContext, operation: &mut openapi::Operation) {
        AuthorityScope::operation_input(ctx, operation);
    }
}

/// Resolves `actor`'s visibility scope for `filter` against `observation`'s requested world.
///
/// # Errors
///
/// Returns [`Problem`] when the store cannot compile or answer the filter, or when the store
/// resolves no scope for `actor`.
pub(super) async fn resolve<R>(
    state: &AppState<R>,
    observation: &Observation,
    actor: ActorId,
    filter: Option<FilterDigest>,
    document: Option<Arc<RawValue>>,
) -> Result<Arc<CacheEntry>, Problem<'static>> {
    state
        .scopes
        .resolve(observation, actor, filter, document)
        .await?
        .ok_or_else(unauthorized)
}
