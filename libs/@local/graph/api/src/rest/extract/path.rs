//! Path parameters whose rejection is a problem details response.

use alloc::borrow::Cow;

use aide::{OperationInput, OperationOutput as _, generate::GenContext, openapi::Operation};
use axum::extract::{FromRequestParts, rejection::PathRejection};
use hash_middleware::problem::InternalServerError;
use http::{StatusCode, request::Parts};
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{Serialize, de::DeserializeOwned};

use super::RequestPart;

/// A path parameter does not match its documented schema.
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

    fn example() -> Option<Self> {
        Some(Self {
            detail: "Invalid URL: Cannot parse `limit` with value `many` to a `u8`".to_owned(),
        })
    }
}

/// The ways [`Path`] rejects a request.
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
        // Axum answers `500` for `MissingPathParams` and for a `FailedToDeserializePathParams`
        // with the wrong number of parameters or a type it cannot read: the route and its handler
        // disagree, which the client cannot fix.
        if self.status().is_server_error() {
            tracing::error!(%detail, "the route cannot extract the path parameters its handler reads");
            return Answer::new(InternalServerError);
        }
        if !matches!(self, Self::FailedToDeserializePathParams(_)) {
            // `PathRejection` is `#[non_exhaustive]`: this handles a rejection a later axum version
            // adds until it is named above.
            tracing::warn!(status = %self.status(), %detail, "axum rejected the path in a way this extractor does not name");
        }
        Answer::new(MalformedPathParameter { detail })
    }
}

/// Path parameters whose rejection is a problem details response.
///
/// `T` is a struct with one field per placeholder of the route, named like the placeholder. Each
/// field holds a single value and is not an `Option`. [`openapi::build`] panics for an operation
/// whose path parameters break this.
///
/// [`openapi::build`]: crate::rest::openapi::build
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
        RequestPart::Path.mark(operation);
    }
}
