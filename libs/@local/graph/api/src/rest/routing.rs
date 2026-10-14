//! [`get`] and [`post`] register the operations of the public and internal APIs.
//!
//! They accept only a handler answering with [`Json`] or with `Result<Json<_, _>, Rejection<_>>`,
//! so a successful response is JSON that [`Json`] documents and an error is a problem details
//! response that the [`Problem`](problematic::Problem) of the [`Rejection`] documents. A handler
//! answering with anything else, such as a bare `StatusCode`, fails to compile. Each marks the
//! operations it registers, and [`openapi::build`] panics for an operation registered any other
//! way.
//!
//! [`openapi::build`]: crate::rest::openapi::build

use aide::{
    OperationInput, OperationOutput,
    axum::routing::{self, ApiMethodRouter},
    operation::OperationHandler,
    transform::TransformOperation,
};
use axum::handler::Handler;
use problematic::Rejection;
use serde_json::Value;

use super::extract::Json;

/// The key of the extension that marks an operation [`get`] or [`post`] registered, which
/// [`openapi::build`] removes again.
///
/// [`openapi::build`]: crate::rest::openapi::build
pub(in crate::rest) const EXTENSION: &str = "x-hash-routed";

/// A response a handler of the public and internal APIs answers with.
pub(in crate::rest) trait Outcome: OperationOutput {}

impl<T, const STATUS: u16> Outcome for Json<T, STATUS> where Self: OperationOutput {}

impl<T, K, const STATUS: u16> Outcome for Result<Json<T, STATUS>, Rejection<K>> where
    Self: OperationOutput
{
}

/// Routes `GET` requests to `handler`, documented by `transform`.
///
/// # Panics
///
/// Panics if `transform` leaves the operation without an `operationId` or a `summary`.
pub(in crate::rest) fn get<H, I, O, T, S>(
    handler: H,
    transform: impl FnOnce(TransformOperation<'_>) -> TransformOperation<'_>,
) -> ApiMethodRouter<S>
where
    H: Handler<T, S> + OperationHandler<I, O>,
    I: OperationInput,
    O: Outcome,
    S: Clone + Send + Sync + 'static,
    T: 'static,
{
    routing::get_with(handler, |operation| registered(transform(operation)))
}

/// Routes `POST` requests to `handler`, documented by `transform`.
///
/// # Panics
///
/// Panics if `transform` leaves the operation without an `operationId` or a `summary`.
#[cfg_attr(
    not(test),
    expect(dead_code, reason = "only the tests route `POST` requests so far")
)]
pub(in crate::rest) fn post<H, I, O, T, S>(
    handler: H,
    transform: impl FnOnce(TransformOperation<'_>) -> TransformOperation<'_>,
) -> ApiMethodRouter<S>
where
    H: Handler<T, S> + OperationHandler<I, O>,
    I: OperationInput,
    O: Outcome,
    S: Clone + Send + Sync + 'static,
    T: 'static,
{
    routing::post_with(handler, |operation| registered(transform(operation)))
}

/// Checks that `operation` has an `operationId` and a `summary`, and marks it.
fn registered(mut operation: TransformOperation<'_>) -> TransformOperation<'_> {
    let inner = operation.inner_mut();
    let id = inner
        .operation_id
        .as_deref()
        .expect("the operation should have an `operationId`");
    assert!(
        inner.summary.is_some(),
        "the operation `{id}` should have a summary"
    );
    inner
        .extensions
        .insert(EXTENSION.to_owned(), Value::Bool(true));
    operation
}

#[cfg(test)]
mod tests {
    use super::get;
    use crate::rest::extract::Json;

    #[test]
    #[should_panic(expected = "the operation should have an `operationId`")]
    fn get_missing_id() {
        let _: aide::axum::routing::ApiMethodRouter = get(
            async || Json::<_, 200>(true),
            |operation| operation.summary("Answer"),
        );
    }

    #[test]
    #[should_panic(expected = "the operation `answer` should have a summary")]
    fn get_missing_summary() {
        let _: aide::axum::routing::ApiMethodRouter = get(
            async || Json::<_, 200>(true),
            |operation| operation.id("answer"),
        );
    }
}
