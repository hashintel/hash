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

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;
    use core::{assert_matches, error::Error};

    use axum_core::response::IntoResponse as _;
    use http::{
        HeaderMap, HeaderValue,
        header::{CONTENT_TYPE, RETRY_AFTER},
    };
    use schemars::JsonSchema;
    use serde::Serialize;
    use serde_json::{Value, json};

    use super::Rejection;
    use crate::{
        Answer, Expose, Header, Problem, ProblemType, ProblemVariant, StatusCode, Variant,
    };

    #[derive(Serialize, JsonSchema, derive_more::Display)]
    #[display("The web is busy.")]
    struct Busy {
        #[serde(skip)]
        retry_after: u64,
    }

    impl ProblemVariant for Busy {
        const HEADERS: &'static [Header] = &[Header::new::<u64>(
            "Retry-After",
            "Seconds before retrying the request.",
        )];
        const TYPE: ProblemType = ProblemType {
            type_uri: Cow::Borrowed("/problems/web/busy"),
            title: Cow::Borrowed("Web busy"),
            status: StatusCode::SERVICE_UNAVAILABLE,
        };

        fn headers(&self, headers: &mut HeaderMap) {
            headers.insert(RETRY_AFTER, HeaderValue::from(self.retry_after));
        }
    }

    /// Its details fail to serialize, as its member is named like a standard member.
    #[derive(Serialize, JsonSchema, derive_more::Display)]
    #[display("The web is locked.")]
    struct Locked {
        status: &'static str,
    }

    impl ProblemVariant for Locked {
        const TYPE: ProblemType = ProblemType {
            type_uri: Cow::Borrowed("/problems/web/locked"),
            title: Cow::Borrowed("Web locked"),
            status: StatusCode::LOCKED,
        };
    }

    struct WebProblem;

    impl Problem for WebProblem {
        const VARIANTS: &'static [Variant] = &[Variant::of::<Busy>(), Variant::of::<Locked>()];
    }

    #[derive(Debug, derive_more::Display)]
    enum WebError {
        #[display("the web is busy")]
        Busy,
        #[display("the web is locked")]
        Locked,
        #[display("the web store is unreachable")]
        Unreachable,
    }

    impl Error for WebError {}

    impl Expose<WebProblem> for WebError {
        fn expose(&self) -> Option<Answer<'_, WebProblem>> {
            match self {
                Self::Busy => Some(Answer::new(Busy { retry_after: 30 })),
                Self::Locked => Some(Answer::new(Locked { status: "locked" })),
                Self::Unreachable => None,
            }
        }
    }

    fn body(rejection: &Rejection<WebProblem>) -> Value {
        serde_json::from_slice(&rejection.rendered.body).expect("the body should be JSON")
    }

    fn internal_body() -> Value {
        json!({"type": "about:blank", "title": "Internal Server Error", "status": 500})
    }

    #[test]
    fn rejection_exposed() {
        let rejection = Rejection::<WebProblem>::from(WebError::Busy);
        assert_eq!(
            body(&rejection),
            json!({
                "type": "/problems/web/busy",
                "title": "Web busy",
                "status": 503,
                "detail": "The web is busy."
            }),
            "the body should be the details of the exposed variant"
        );

        let response = rejection.into_response();
        assert_eq!(
            response.status(),
            StatusCode::SERVICE_UNAVAILABLE,
            "the response should have the status of the variant"
        );
        assert_eq!(
            response.headers()[RETRY_AFTER],
            "30",
            "the response should carry the headers of the variant"
        );
        assert_eq!(
            response.headers()[CONTENT_TYPE],
            "application/problem+json",
            "the response should be a problem details document"
        );
    }

    #[test]
    fn rejection_internal() {
        let rejection = Rejection::<WebProblem>::from(WebError::Unreachable);

        assert_eq!(
            rejection.status(),
            StatusCode::INTERNAL_SERVER_ERROR,
            "an error exposing no variant should be answered as an internal error"
        );
        assert_eq!(
            body(&rejection),
            internal_body(),
            "the body should reveal nothing of the error"
        );
        assert_matches!(
            rejection.error().downcast_ref(),
            Some(WebError::Unreachable),
            "the rejection should keep the error it answers for"
        );
    }

    #[test]
    fn rejection_unserializable() {
        let rejection = Rejection::<WebProblem>::from(WebError::Locked);

        assert_eq!(
            rejection.status(),
            StatusCode::INTERNAL_SERVER_ERROR,
            "a variant failing to serialize should be answered as an internal error"
        );
        assert_eq!(
            body(&rejection),
            internal_body(),
            "the body should be the internal problem instead of a partial document"
        );
    }
}
