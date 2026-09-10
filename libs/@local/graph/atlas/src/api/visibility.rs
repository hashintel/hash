//! Request-held publications and resolved visibility for document assembly.
//!
//! The observation fixes generation selection before store resolution. Documents borrow the
//! requested world and epoch even if a different generation becomes present meanwhile.

use alloc::sync::Arc;

use aide::{OperationInput, generate::GenContext, openapi};
use axum::{
    extract::FromRequestParts,
    http::{StatusCode, request::Parts},
};
use error_stack::Report;
use hash_graph_postgres_store::store::postgres::query::SelectCompilerError;
use hash_graph_store::filter::ParameterConversionError;
use serde_json::value::RawValue;
use type_system::principal::actor::ActorId;

use super::{
    AppState,
    authorization::Admission,
    problem::{Problem, ProblemType, unauthorized, visibility_unavailable},
};
use crate::{
    morton::Zoom,
    serve2::{
        hydrate::visibility::VisibilityProofError,
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
        let Admission { observation, scope } = Admission::from_request_parts(parts, state).await?;
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
        Admission::operation_input(ctx, operation);
    }
}

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
        .await
        .map_err(|error| proof_problem(&error))?
        .ok_or_else(unauthorized)
}

fn proof_problem(error: &Report<VisibilityProofError>) -> Problem<'static> {
    match error.current_context() {
        VisibilityProofError::Filter => Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::InvalidBody,
            error.downcast_ref::<SelectCompilerError>().map_or_else(
                || "the filter document does not compile".to_owned(),
                |source| format!("the filter document does not compile: {source}"),
            ),
        ),
        VisibilityProofError::Convert => Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::InvalidBody,
            error
                .downcast_ref::<ParameterConversionError>()
                .map_or_else(
                    || "a filter parameter does not match its path's type".to_owned(),
                    |source| format!("a filter parameter does not match its path's type: {source}"),
                ),
        ),
        VisibilityProofError::PolicyFilter => {
            Problem::internal(error, "compiling the policy filter failed")
        }
        VisibilityProofError::Connect
        | VisibilityProofError::Policies
        | VisibilityProofError::Document
        | VisibilityProofError::Query
        | VisibilityProofError::ComputeView => visibility_unavailable(error),
    }
}

#[cfg(test)]
mod tests {
    use error_stack::Report;
    use hash_graph_postgres_store::store::postgres::query::SelectCompilerError;

    use super::proof_problem;
    use crate::serve2::hydrate::visibility::VisibilityProofError;

    #[test]
    fn filter_invalid_body() {
        let error = Report::new(SelectCompilerError::UnsupportedEmbeddingPath)
            .change_context(VisibilityProofError::Filter);
        let document =
            serde_json::to_value(proof_problem(&error)).expect("should serialize the problem");
        assert_eq!(document["status"], 400);
        assert_eq!(document["type"], "/problems/atlas/invalid-body");
        assert!(
            document["detail"]
                .as_str()
                .expect("should contain detail")
                .contains("binary-quantized")
        );
    }

    #[test]
    fn policy_filter_redacted() {
        let error = Report::new(SelectCompilerError::UnsupportedEmbeddingPath)
            .change_context(VisibilityProofError::PolicyFilter);
        let document =
            serde_json::to_value(proof_problem(&error)).expect("should serialize the problem");
        assert_eq!(document["status"], 500);
        assert_eq!(document["type"], "/problems/atlas/internal");
        assert!(
            !document["detail"]
                .as_str()
                .expect("should contain detail")
                .contains("embedding")
        );
    }

    #[test]
    fn store_unavailable() {
        for context in [
            VisibilityProofError::Connect,
            VisibilityProofError::Policies,
            VisibilityProofError::Document,
            VisibilityProofError::Query,
            VisibilityProofError::ComputeView,
        ] {
            let document = serde_json::to_value(proof_problem(&Report::new(context)))
                .expect("should serialize the problem");
            assert_eq!(document["status"], 503);
            assert_eq!(document["type"], "/problems/atlas/visibility-unavailable");
        }
    }
}
