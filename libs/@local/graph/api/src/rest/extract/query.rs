//! Query parameters whose rejection is a problem details response.

use alloc::borrow::Cow;

use aide::{OperationInput, OperationOutput as _, generate::GenContext, openapi::Operation};
use axum::extract::FromRequestParts;
use axum_extra::extract::QueryRejection;
use hash_middleware::problem::InternalServerError;
use http::{StatusCode, request::Parts};
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{Serialize, de::DeserializeOwned};

/// A required query parameter is missing, or one does not match its documented schema.
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

    fn example() -> Option<Self> {
        // `Query::try_from_uri` leaves out the parameter that the extractor's rejection names.
        Some(Self {
            detail: "Failed to deserialize query string: limit: invalid digit found in string"
                .to_owned(),
        })
    }
}

/// The ways [`Query`] rejects a request.
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
        match self {
            Self::FailedToDeserializeQueryString(_) => Answer::new(MalformedQuery { detail }),
            // `QueryRejection` is `#[non_exhaustive]`: this arm handles a rejection a later axum
            // version adds until an arm above names it.
            _ if self.status().is_server_error() => {
                tracing::error!(status = %self.status(), %detail, "axum rejected the query in a way this extractor does not name");
                Answer::new(InternalServerError)
            }
            _ => {
                tracing::warn!(status = %self.status(), %detail, "axum rejected the query in a way this extractor does not name");
                Answer::new(MalformedQuery { detail })
            }
        }
    }
}

/// Query parameters whose rejection is a problem details response.
///
/// `T` is a struct whose fields hold single values or sequences of single values. A sequence reads
/// every occurrence of its key, and with `#[serde(default)]` also accepts none. [`openapi::build`]
/// panics for an operation with any other query parameter. `T` cannot flatten a struct into itself:
/// serde hands flattened fields their values as strings, which only a string field accepts.
///
/// [`openapi::build`]: crate::rest::openapi::build
pub(in crate::rest) struct Query<T>(pub T);

impl<T, S> FromRequestParts<S> for Query<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = Rejection<QueryProblem>;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let axum_extra::extract::Query(parameters) =
            axum_extra::extract::Query::<T>::from_request_parts(parts, state).await?;
        Ok(Self(parameters))
    }
}

impl<T: JsonSchema> OperationInput for Query<T> {
    fn operation_input(ctx: &mut GenContext, operation: &mut Operation) {
        axum_extra::extract::Query::<T>::operation_input(ctx, operation);
        // Documents the variants on the operation itself, so there are no responses to infer.
        Rejection::<QueryProblem>::inferred_responses(ctx, operation);
    }
}
