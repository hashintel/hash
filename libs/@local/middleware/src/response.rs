//! The problem documents the middlewares answer rejections with.

use alloc::borrow::Cow;

use axum::{
    body::Body,
    response::{IntoResponse as _, Response},
};
use http::{HeaderValue, StatusCode, header::CONTENT_TYPE};
use problematic::{ProblemDetails, ProblemType};
use serde_core::Serialize;

/// The problem document that says no more than its HTTP status: `about:blank` with the status'
/// canonical reason as its title.
#[must_use]
pub fn status_problem(status: StatusCode) -> ProblemDetails<'static> {
    ProblemDetails::from(ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed(status.canonical_reason().unwrap_or("Unknown status")),
        status,
    })
}

pub(crate) fn problem_response_body(status: StatusCode, body: impl Into<Body>) -> Response {
    (
        status,
        [(
            CONTENT_TYPE,
            HeaderValue::from_static("application/problem+json"),
        )],
        body.into(),
    )
        .into_response()
}

fn status_response(status: StatusCode) -> Response {
    let body = serde_json::to_vec(&status_problem(status))
        .expect("the status problem's static fields should serialize");
    problem_response_body(status, body)
}

/// Renders a problem document as an `application/problem+json` response with its status.
///
/// A document whose status is not a valid HTTP status is answered as a bare
/// `500 Internal Server Error`; one whose extensions do not serialize is answered as the bare
/// problem of its status. Both are logged with the document's status and type.
pub fn problem_response(details: &ProblemDetails<'_, impl Serialize>) -> Response {
    let status = match StatusCode::from_u16(details.status) {
        Ok(status) => status,
        Err(error) => {
            tracing::error!(
                status = details.status,
                type = %details.type_uri,
                %error,
                "invalid problem status code"
            );
            return status_response(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };
    let body = match serde_json::to_vec(details) {
        Ok(body) => body,
        Err(error) => {
            tracing::error!(
                status = details.status,
                type = %details.type_uri,
                %error,
                "failed to serialize problem details"
            );
            return status_response(status);
        }
    };
    problem_response_body(status, body)
}

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;

    use axum::{body::to_bytes, response::Response};
    use http::{StatusCode, header::CONTENT_TYPE};
    use problematic::ProblemType;
    use serde::{Serialize, Serializer, ser::Error as _};
    use serde_json::{Value, json};

    use super::{problem_response, status_response};

    const INVALID_PARAMETER: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("https://example.com/problems/invalid-parameter"),
        title: Cow::Borrowed("Invalid parameter"),
        status: StatusCode::UNPROCESSABLE_ENTITY,
    };

    #[derive(Serialize)]
    struct Extensions<'a> {
        parameter: &'a str,
    }

    struct FailingExtensions;

    impl Serialize for FailingExtensions {
        fn serialize<S: Serializer>(&self, _serializer: S) -> Result<S::Ok, S::Error> {
            Err(S::Error::custom("private serializer diagnostic"))
        }
    }

    async fn response_json(response: Response) -> Value {
        assert_eq!(response.headers()[CONTENT_TYPE], "application/problem+json");
        let body = to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        serde_json::from_slice(&body).expect("the response body should be JSON")
    }

    #[tokio::test]
    async fn response_extensions() {
        let parameter = String::from("limit");
        let details = INVALID_PARAMETER
            .detail("The limit must be positive.")
            .instance("/problem-occurrences/42")
            .extensions(Extensions {
                parameter: &parameter,
            });

        let response = problem_response(&details);

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(
            response_json(response).await,
            json!({
                "type": "https://example.com/problems/invalid-parameter",
                "title": "Invalid parameter",
                "status": 422,
                "detail": "The limit must be positive.",
                "instance": "/problem-occurrences/42",
                "parameter": "limit",
            })
        );
    }

    #[tokio::test]
    async fn response_status_only() {
        let response = status_response(StatusCode::SERVICE_UNAVAILABLE);

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(
            response_json(response).await,
            json!({
                "type": "about:blank",
                "title": "Service Unavailable",
                "status": 503,
            })
        );
    }

    async fn assert_internal_error(response: Response) {
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(
            response_json(response).await,
            json!({
                "type": "about:blank",
                "title": "Internal Server Error",
                "status": 500,
            })
        );
    }

    #[tokio::test]
    async fn response_serialization_failure() {
        let details = INVALID_PARAMETER
            .detail("private diagnostic")
            .extensions(FailingExtensions);

        let response = problem_response(&details);

        assert_eq!(
            response.status(),
            StatusCode::UNPROCESSABLE_ENTITY,
            "the decided status should survive a body that does not serialize"
        );
        assert_eq!(
            response_json(response).await,
            json!({
                "type": "about:blank",
                "title": "Unprocessable Entity",
                "status": 422,
            }),
            "the body should fall back to the bare problem of the status"
        );
    }

    #[tokio::test]
    async fn response_invalid_status() {
        let mut details = INVALID_PARAMETER.detail("private diagnostic");
        details.status = 1000;

        assert_internal_error(problem_response(&details)).await;
    }
}
