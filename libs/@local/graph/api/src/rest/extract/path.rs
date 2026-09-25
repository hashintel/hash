//! Path parameters whose rejection is a problem details response.

use alloc::borrow::Cow;

use aide::{OperationInput, OperationOutput as _, generate::GenContext, openapi::Operation};
use axum::extract::{FromRequestParts, rejection::PathRejection};
use hash_middleware::problem::InternalServerError;
use http::{StatusCode, request::Parts};
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{Serialize, de::DeserializeOwned};

/// A path parameter does not parse as the type the operation reads.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("{detail}")]
struct MalformedPathParameter {
    #[serde(skip)]
    detail: String,
}

impl ProblemVariant for MalformedPathParameter {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Bad Request"),
        status: StatusCode::BAD_REQUEST,
    };
}

/// The ways [`Path`] refuses a request.
pub(in crate::rest) struct PathProblem;

impl Problem for PathProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<MalformedPathParameter>(),
        Variant::of::<InternalServerError>(),
    ];
}

impl Expose<PathProblem> for PathRejection {
    fn expose(&self) -> Answer<'_, PathProblem> {
        let detail = self.body_text();
        // The framework answers `5xx` when the route and its handler disagree on the parameters,
        // which the client cannot fix, also for a parameter that fails to deserialize.
        if self.status().is_server_error() {
            tracing::error!(%detail, "the route cannot extract the path parameters its handler reads");
            return Answer::new(InternalServerError);
        }
        if !matches!(self, Self::FailedToDeserializePathParams(_)) {
            // `PathRejection` is not exhaustive: a rejection added upstream lands here until it
            // is named above.
            tracing::warn!(status = %self.status(), %detail, "the path was refused in a way this extractor does not name");
        }
        Answer::new(MalformedPathParameter { detail })
    }
}

/// Path parameters whose rejection is a problem details response.
pub(in crate::rest) struct Path<T>(pub T);

impl<T, S> FromRequestParts<S> for Path<T>
where
    T: DeserializeOwned + Send,
    S: Send + Sync,
{
    type Rejection = Rejection<PathProblem>;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let axum::extract::Path(parameters) =
            axum::extract::Path::<T>::from_request_parts(parts, state).await?;
        Ok(Self(parameters))
    }
}

impl<T: JsonSchema> OperationInput for Path<T> {
    fn operation_input(ctx: &mut GenContext, operation: &mut Operation) {
        axum::extract::Path::<T>::operation_input(ctx, operation);
        // Documents the variants on the operation itself, so there are no responses to infer.
        Rejection::<PathProblem>::inferred_responses(ctx, operation);
    }
}
