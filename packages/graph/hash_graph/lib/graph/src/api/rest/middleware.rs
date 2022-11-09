use axum::{
    body::{Body, Bytes, HttpBody},
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use tracing::{enabled, Level};

// *Heavily* inspired by
// https://github.com/tokio-rs/axum/blob/main/examples/print-request-response/src/main.rs

/// A development-environment-focused `axum` Handler function to buffer the body of requests and
/// responses and log them. Overhead should be minimal when not in `Level::Trace`
pub(super) async fn log_request_and_response(
    request: Request<Body>,
    next: Next<Body>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut request = request;
    if enabled!(Level::TRACE) {
        // Destructure the request and pass the stream buffer
        let (parts, body) = request.into_parts();
        let bytes = buffer_and_log("request", body, None).await?;
        request = Request::from_parts(parts, Body::from(bytes));
    }

    // Run the rest of the layers
    let response = next.run(request).await;

    if enabled!(Level::TRACE) {
        // Destructure the response and pass the stream buffer
        let (parts, body) = response.into_parts();
        let bytes = buffer_and_log("response", body, Some(parts.status)).await?;
        let new_response = Response::from_parts(parts, Body::from(bytes));
        Ok(new_response.into_response())
    } else {
        Ok(response)
    }
}

async fn buffer_and_log<B>(
    direction: &str,
    body: B,
    status_code: Option<StatusCode>,
) -> Result<Bytes, (StatusCode, String)>
where
    B: HttpBody<Data = Bytes> + Send,
    B::Error: std::fmt::Display,
{
    let bytes = match hyper::body::to_bytes(body).await {
        Ok(bytes) => bytes,
        Err(err) => {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("failed to read {} body: {}", direction, err),
            ));
        }
    };

    if let Ok(body) = std::str::from_utf8(&bytes) {
        // would be nice to use `let_guard`s here
        if let Some(status_code) = status_code {
            if !(status_code.is_success()) {
                tracing::error!("{} body = {:?}", direction, body);
            } else {
                tracing::trace!("{} body = {:?}", direction, body);
            }
        } else {
            tracing::trace!("{} body = {:?}", direction, body);
        }
    }

    Ok(bytes)
}
