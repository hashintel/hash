//! [`get`] and [`post`] create the routes of the public and internal APIs, and [`Routes`] collects
//! them for [`openapi::build`].
//!
//! They accept only a handler answering with [`Json`] or [`Page`], or with a `Result` of one of
//! them and a [`Rejection`], so a successful response is JSON that [`Json`] or [`Page`] documents
//! and an error is a problem details response that the [`Problem`](problematic::Problem) of the
//! [`Rejection`] documents. A handler answering with anything else, such as a bare `StatusCode`,
//! fails to compile. [`Routes`] accepts no other route, so a handler reaches an API only through
//! [`get`] or [`post`].
//!
//! [`openapi::build`]: crate::rest::openapi::build

use aide::{
    OperationInput, OperationOutput,
    axum::{
        ApiRouter,
        routing::{self, ApiMethodRouter},
    },
    operation::OperationHandler,
    transform::TransformOperation,
};
use axum::handler::Handler;
use problematic::Rejection;

use super::extract::{Json, Page};

/// A response a handler of the public and internal APIs answers with.
pub(in crate::rest) trait Outcome: OperationOutput {}

impl<T, const STATUS: u16> Outcome for Json<T, STATUS> where Self: OperationOutput {}

impl<T, K, const STATUS: u16> Outcome for Result<Json<T, STATUS>, Rejection<K>> where
    Self: OperationOutput
{
}

impl<T> Outcome for Page<T> where Self: OperationOutput {}

impl<T, K> Outcome for Result<Page<T>, Rejection<K>> where Self: OperationOutput {}

/// A route [`get`] or [`post`] created.
pub(in crate::rest) struct Route<S>(ApiMethodRouter<S>);

/// The routes of an API, each created by [`get`] or [`post`].
pub(in crate::rest) struct Routes<S = ()>(ApiRouter<S>);

impl<S: Clone + Send + Sync + 'static> Routes<S> {
    pub(in crate::rest) fn new() -> Self {
        Self(ApiRouter::new())
    }

    /// Serves `route` at `path`.
    pub(in crate::rest) fn route(self, path: &str, route: Route<S>) -> Self {
        Self(self.0.api_route(path, route.0))
    }

    /// Tags the operations of every route added before this call with `tag`.
    pub(in crate::rest) fn tag(self, tag: &str) -> Self {
        Self(self.0.with_path_items(|item| item.tag(tag)))
    }

    pub(in crate::rest) fn into_router(self) -> ApiRouter<S> {
        self.0
    }
}

/// Routes `GET` requests to `handler`, documented by `transform`.
///
/// # Panics
///
/// Panics if `transform` leaves the operation without an `operationId` or a `summary`.
pub(in crate::rest) fn get<H, I, O, T, S>(
    handler: H,
    transform: impl FnOnce(TransformOperation<'_>) -> TransformOperation<'_>,
) -> Route<S>
where
    H: Handler<T, S> + OperationHandler<I, O>,
    I: OperationInput,
    O: Outcome,
    S: Clone + Send + Sync + 'static,
    T: 'static,
{
    Route(routing::get_with(handler, |operation| {
        identified(transform(operation))
    }))
}

/// Routes `POST` requests to `handler`, documented by `transform`.
///
/// # Panics
///
/// Panics if `transform` leaves the operation without an `operationId` or a `summary`.
pub(in crate::rest) fn post<H, I, O, T, S>(
    handler: H,
    transform: impl FnOnce(TransformOperation<'_>) -> TransformOperation<'_>,
) -> Route<S>
where
    H: Handler<T, S> + OperationHandler<I, O>,
    I: OperationInput,
    O: Outcome,
    S: Clone + Send + Sync + 'static,
    T: 'static,
{
    Route(routing::post_with(handler, |operation| {
        identified(transform(operation))
    }))
}

/// Checks that `operation` has an `operationId` and a `summary`.
fn identified(mut operation: TransformOperation<'_>) -> TransformOperation<'_> {
    let inner = operation.inner_mut();
    let id = inner
        .operation_id
        .as_deref()
        .expect("the operation should have an `operationId`");
    assert!(
        inner.summary.is_some(),
        "the operation `{id}` should have a summary"
    );
    operation
}

#[cfg(test)]
mod tests {
    use super::{Route, get};
    use crate::rest::extract::Json;

    #[test]
    #[should_panic(expected = "the operation should have an `operationId`")]
    fn get_missing_id() {
        let _: Route<()> = get(
            async || Json::<_, 200>(true),
            |operation| operation.summary("Answer"),
        );
    }

    #[test]
    #[should_panic(expected = "the operation `answer` should have a summary")]
    fn get_missing_summary() {
        let _: Route<()> = get(
            async || Json::<_, 200>(true),
            |operation| operation.id("answer"),
        );
    }
}
