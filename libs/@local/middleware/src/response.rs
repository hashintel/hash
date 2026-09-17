//! The error documents the middlewares answer rejections with.

use alloc::borrow::Cow;

use axum::{
    body::Body,
    response::{IntoResponse as _, Response},
};
use http::{HeaderValue, StatusCode, header::CONTENT_TYPE};
use problematic::{ProblemDetails, ProblemType};
use serde_core::Serialize;

pub(crate) fn status_problem(status: StatusCode) -> ProblemDetails<'static> {
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

pub(crate) fn problem_response(details: &ProblemDetails<'_, impl Serialize>) -> Response {
    let status = match StatusCode::from_u16(details.status) {
        Ok(status) if status.as_u16() <= 599 => status,
        Ok(_) | Err(_) => {
            tracing::error!(status = details.status, "invalid problem status code");
            return status_response(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };
    let body = match serde_json::to_vec(details) {
        Ok(body) => body,
        Err(error) => {
            tracing::error!(%error, "failed to serialize problem details");
            return status_response(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };
    problem_response_body(status, body)
}

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;

    use axum::{body::to_bytes, response::Response};
    use http::{StatusCode, header::CONTENT_TYPE};
    use problematic::{ProblemDetails, ProblemType};
    use serde::Serialize;
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
    async fn response_invalid_extensions() {
        let details = INVALID_PARAMETER
            .detail("private diagnostic")
            .extensions("private diagnostic");

        assert_internal_error(problem_response(&details)).await;
    }

    #[tokio::test]
    async fn response_status_boundaries() {
        for status in [100, 599] {
            let mut details = ProblemDetails::from(INVALID_PARAMETER);
            details.status = status;

            let response = problem_response(&details);

            assert_eq!(
                response.status().as_u16(),
                status,
                "the boundary status should be preserved"
            );
            assert_eq!(
                response_json(response).await["status"],
                status,
                "the body should retain the response status"
            );
        }
    }

    #[tokio::test]
    async fn response_invalid_status() {
        for status in [99, 600, 999, 1000] {
            let mut details = INVALID_PARAMETER.detail("private diagnostic");
            details.status = status;

            assert_internal_error(problem_response(&details)).await;
        }
    }
}
