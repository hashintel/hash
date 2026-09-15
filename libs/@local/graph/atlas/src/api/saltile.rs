//! Binary envelope responses and the worker that assembles them.
//!
//! [`Saltile`] is a documentation-only marker: its [`OperationOutput`] impl states the `SALTILE`
//! family's media type and no-store posture for the tile, edges, and locate operations, and no
//! value of it is ever constructed. [`DocumentResponse`] pairs bytes produced by
//! [`Document::encode`](crate::serve::document::Document::encode) with the media type that encoding
//! returns: `SALTILE` for the binary routes and `application/json` for translate. [`spawn`] runs
//! the CPU-bound assembly off the async runtime.

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

/// The binary `SALTILE` response, as an OpenAPI documentation marker.
///
/// No value of this type is ever constructed. An operation declares the `SALTILE` shape of its
/// `200` by naming it in `response_with::<200, Saltile, _>`, and [`DocumentResponse`] carries the
/// bytes the handler answers with.
pub(super) struct Saltile;

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
                "binary envelopes key on the request body, which shared caches cannot see. The \
                 client's application-layer cache is the cache",
            ),
        );

        Some(response)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut openapi::Operation,
    ) -> Vec<(Option<openapi::StatusCode>, openapi::Response)> {
        let response = Self::operation_response(ctx, operation)
            .unwrap_or_else(|| unreachable!("`operation_response` answers every operation"));

        vec![(Some(openapi::StatusCode::Code(200)), response)]
    }
}

/// An assembled document response with its content type and cache policy.
///
/// The response carries [`headers::NO_STORE`] under every media type.
pub(super) struct DocumentResponse {
    bytes: Vec<u8>,
    content_type: &'static str,
}

impl DocumentResponse {
    /// Wraps assembled bytes for delivery under `content_type`.
    pub(super) const fn new(bytes: Vec<u8>, content_type: &'static str) -> Self {
        Self {
            bytes,
            content_type,
        }
    }
}

impl IntoResponse for DocumentResponse {
    fn into_response(self) -> Response {
        (
            [
                (header::CONTENT_TYPE, self.content_type),
                (header::CACHE_CONTROL, headers::NO_STORE),
            ],
            self.bytes,
        )
            .into_response()
    }
}

/// Runs CPU-bound response assembly on a rayon worker, answering a panic as an internal problem.
///
/// # Errors
///
/// Returns [`Problem`] if the worker panics or drops its response channel.
pub(super) async fn spawn<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + UnwindSafe + 'static,
) -> Result<T, Problem<'static>> {
    offload::run(work).await.map_err(|error| match error {
        OffloadError::Panicked(payload) => Problem::internal_message(
            payload.unwrap_or(Cow::Borrowed("non-string panic payload")),
            "the response assembly panicked",
        ),
        OffloadError::Vanished => Problem::internal_message(
            "the assembly worker dropped its channel",
            "the assembly worker vanished",
        ),
    })
}
