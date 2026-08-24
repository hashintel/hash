//! Binary envelope responses and the worker that assembles them.
//!
//! [`Saltile`] wraps assembled envelope bytes with the family's media type and the no-store cache
//! posture. [`spawn`] runs the CPU-bound assembly off the async runtime.

use alloc::borrow::Cow;
use core::panic::UnwindSafe;

use aide::{OperationOutput, generate::GenContext, openapi};
use axum::{
    http::header,
    response::{IntoResponse, Response},
};

use super::{headers, problem::Problem};
use crate::offload::{self, OffloadError};

/// The tile response media type, the `SALTILE` family at version 1.
const SALTILE: &str = "application/vnd.hash.saltile-v1";

/// `SALTILE` envelope bytes as a response.
///
/// The family's media type, no-store because the client's application-layer cache is the cache.
pub(super) struct Saltile(Vec<u8>);

impl Saltile {
    /// Wraps assembled envelope bytes for delivery.
    pub(super) const fn new(bytes: Vec<u8>) -> Self {
        Self(bytes)
    }
}

impl IntoResponse for Saltile {
    fn into_response(self) -> Response {
        (
            [
                (header::CONTENT_TYPE, SALTILE),
                (header::CACHE_CONTROL, headers::NO_STORE),
            ],
            self.0,
        )
            .into_response()
    }
}

impl OperationOutput for Saltile {
    type Inner = Vec<u8>;

    fn operation_response(
        _ctx: &mut GenContext,
        _operation: &mut openapi::Operation,
    ) -> Option<openapi::Response> {
        let mut response = openapi::Response {
            description: "a SALTILE envelope".into(),
            ..Default::default()
        };

        response
            .content
            .insert(SALTILE.into(), openapi::MediaType::default());
        response.headers.insert(
            "Cache-Control".to_owned(),
            headers::cache_control(
                headers::NO_STORE,
                "binary envelopes key on the request body, which shared caches cannot see; the \
                 client's application-layer cache is the cache",
            ),
        );

        Some(response)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut openapi::Operation,
    ) -> Vec<(Option<openapi::StatusCode>, openapi::Response)> {
        Self::operation_response(ctx, operation)
            .map(|response| vec![(Some(openapi::StatusCode::Code(200)), response)])
            .unwrap_or_default()
    }
}

/// Runs CPU-bound response assembly on a rayon worker, answering a panic as an internal problem.
pub(super) async fn spawn<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + UnwindSafe + 'static,
) -> Result<T, Problem<'static>> {
    offload::run(work).await.map_err(|error| match error {
        OffloadError::Panicked(payload) => {
            let payload = payload.unwrap_or(Cow::Borrowed("non-string panic payload"));
            let detail: Cow<'static, str> = if cfg!(debug_assertions) {
                Cow::Owned(format!("the response assembly panicked: {payload}"))
            } else {
                Cow::Borrowed("the response assembly panicked")
            };

            Problem::internal(payload, detail)
        }
        OffloadError::Vanished => Problem::internal(
            "the assembly worker dropped its channel",
            "the assembly worker vanished",
        ),
    })
}
