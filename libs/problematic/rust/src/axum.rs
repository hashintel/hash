use alloc::{borrow::Cow, boxed::Box, vec::Vec};
use core::{error::Error, fmt, marker::PhantomData};

use axum_core::{
    body::Body,
    response::{IntoResponse, Response},
};
use http::{HeaderMap, HeaderValue, header::CONTENT_TYPE};

use crate::{Answer, Expose, Problem, ProblemDetails, ProblemType, StatusCode};

/// The problem answered when the error exposes no variant, or its answer fails to serialize.
pub(crate) const INTERNAL: ProblemType = ProblemType {
    type_uri: Cow::Borrowed("about:blank"),
    title: Cow::Borrowed("Internal Server Error"),
    status: StatusCode::INTERNAL_SERVER_ERROR,
};

/// A failed operation, answered with a variant of `K`, or with `500 Internal Server Error` when
/// the error exposes none.
///
/// A handler returns `Result<_, Rejection<K>>`, and `?` converts any error that implements
/// [`Expose<K>`](Expose) and `Into<Box<dyn Error + Send + Sync>>`. The answer is rendered during
/// that conversion, and [`error`](Self::error) returns the error.
pub struct Rejection<K> {
    rendered: Box<Rendered>,
    problem: PhantomData<fn() -> K>,
}

/// The rendered answer, boxed so a `Result` carrying a rejection stays small.
struct Rendered {
    status: StatusCode,
    headers: HeaderMap,
    body: Vec<u8>,
    // TODO(BE-892): hand the error to a logging layer through the response extensions, so it is
    // logged together with its request.
    error: Box<dyn Error + Send + Sync>,
}

impl<K> Rejection<K> {
    /// The status this rejection is answered with.
    #[must_use]
    pub fn status(&self) -> StatusCode {
        self.rendered.status
    }

    /// The error this rejection answers for.
    #[must_use]
    pub fn error(&self) -> &(dyn Error + Send + Sync + 'static) {
        &*self.rendered.error
    }
}

impl<K> fmt::Debug for Rejection<K> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Rejection")
            .field("status", &self.rendered.status)
            .field("error", &self.rendered.error)
            .finish_non_exhaustive()
    }
}

// `Rejection` must not implement `Error`: the `Into` bound is what keeps this impl apart from
// `impl<T> From<T> for T`.
impl<S, K> From<S> for Rejection<K>
where
    K: Problem,
    S: Expose<K> + Into<Box<dyn Error + Send + Sync>>,
{
    fn from(source: S) -> Self {
        let (status, headers, body) = source
            .expose()
            .map_or_else(internal, |answer| render(&answer));

        Self {
            rendered: Box::new(Rendered {
                status,
                headers,
                body,
                error: source.into(),
            }),
            problem: PhantomData,
        }
    }
}

impl<K> IntoResponse for Rejection<K> {
    fn into_response(self) -> Response {
        let Rendered {
            status,
            headers,
            body,
            error: _,
        } = *self.rendered;

        let mut response = Response::new(Body::from(body));
        *response.status_mut() = status;
        let response_headers = response.headers_mut();
        response_headers.extend(headers);
        // After the variant's headers, which must not replace the media type.
        response_headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("application/problem+json"),
        );
        response
    }
}

fn render<K>(answer: &Answer<'_, K>) -> (StatusCode, HeaderMap, Vec<u8>) {
    let details = answer.details();
    let body = match serde_json::to_vec(&details) {
        Ok(body) => body,
        Err(error) => {
            // TODO(BE-892): record this with the rejection's error and its request, so the log
            // says which request lost its public answer.
            tracing::error!(
                status = details.status.as_u16(),
                type = %details.type_uri,
                %error,
                "failed to serialize problem details, answering with an internal error"
            );
            return internal();
        }
    };

    let mut headers = HeaderMap::new();
    answer.headers(&mut headers);
    (details.status, headers, body)
}

fn internal() -> (StatusCode, HeaderMap, Vec<u8>) {
    let body = serde_json::to_vec(&ProblemDetails::from(&INTERNAL))
        .expect("the internal problem should serialize");
    (INTERNAL.status, HeaderMap::new(), body)
}
