//! Query parameters whose rejection is a problem details response.

use alloc::borrow::Cow;

use aide::{OperationInput, OperationOutput as _, generate::GenContext, openapi::Operation};
use axum::extract::{FromRequestParts, rejection::QueryRejection};
use hash_middleware::problem::InternalServerError;
use http::{StatusCode, request::Parts};
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{Serialize, de::DeserializeOwned};

/// The query string does not parse as the parameters the operation reads.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("{detail}")]
struct MalformedQuery {
    #[serde(skip)]
    detail: String,
}

impl ProblemVariant for MalformedQuery {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Bad Request"),
        status: StatusCode::BAD_REQUEST,
    };
}

/// The ways [`Query`] refuses a request.
pub(in crate::rest) struct QueryProblem;

impl Problem for QueryProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<MalformedQuery>(),
        Variant::of::<InternalServerError>(),
    ];
}

impl Expose<QueryProblem> for QueryRejection {
    fn expose(&self) -> Answer<'_, QueryProblem> {
        let detail = self.body_text();
        if let Self::FailedToDeserializeQueryString(_) = self {
            Answer::new(MalformedQuery { detail })
        } else {
            // `QueryRejection` is not exhaustive: a rejection added upstream lands here until it
            // is named above.
            tracing::warn!(status = %self.status(), %detail, "the query was refused in a way this extractor does not name");
            if self.status().is_server_error() {
                Answer::new(InternalServerError)
            } else {
                Answer::new(MalformedQuery { detail })
            }
        }
    }
}

/// Query parameters whose rejection is a problem details response.
pub(in crate::rest) struct Query<T>(pub T);

impl<T, S> FromRequestParts<S> for Query<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = Rejection<QueryProblem>;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let axum::extract::Query(parameters) =
            axum::extract::Query::<T>::from_request_parts(parts, state).await?;
        Ok(Self(parameters))
    }
}

impl<T: JsonSchema> OperationInput for Query<T> {
    fn operation_input(ctx: &mut GenContext, operation: &mut Operation) {
        axum::extract::Query::<T>::operation_input(ctx, operation);
        // Documents the variants on the operation itself, so there are no responses to infer.
        Rejection::<QueryProblem>::inferred_responses(ctx, operation);
    }
}
