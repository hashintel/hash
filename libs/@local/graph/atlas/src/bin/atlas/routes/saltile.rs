//! Binary envelope responses and the worker that assembles them.
//!
//! [`Saltile`] wraps assembled envelope bytes with the family's
//! media type and the no-store cache posture; [`spawn`] runs the
//! CPU-bound assembly off the async runtime.

use aide::{OperationOutput, generate::GenContext, openapi};
use axum::{
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};

use super::problem::{Problem, ProblemType};

/// The tile response media type: the `SALTILE` family, version 1.
const SALTILE: &str = "application/vnd.hash.saltile-v1";

/// `SALTILE` envelope bytes as a response: the family's media type,
/// no-store because the client's application-layer cache is the
/// cache.
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
                (header::CACHE_CONTROL, "private, no-store"),
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

/// Runs CPU-bound response assembly on a rayon worker behind
/// `catch_unwind`, mapping a vanished worker or a panic - a producer
/// bug surfacing as 500, never an unwind across the runtime - to its
/// problem document.
pub(super) async fn spawn<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, Problem<'static>> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    rayon::spawn(move || {
        let result = std::panic::catch_unwind(core::panic::AssertUnwindSafe(work));
        let _: Result<(), _> = sender.send(result);
    });

    match receiver.await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(panic)) => {
            let detail = panic
                .downcast_ref::<&str>()
                .map(|&message| message.to_owned())
                .or_else(|| panic.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "the response assembly panicked".to_owned());

            Err(Problem::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                ProblemType::InternalError,
                detail,
            ))
        }
        Err(_closed) => Err(Problem::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            ProblemType::InternalError,
            "the assembly worker vanished",
        )),
    }
}
