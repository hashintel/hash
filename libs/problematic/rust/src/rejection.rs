use alloc::{boxed::Box, vec::Vec};
use core::{error::Error, fmt, marker::PhantomData};

use http::{HeaderMap, HeaderValue, Response, StatusCode, header::CONTENT_TYPE};

use crate::{Answer, Expose, Problem, ProblemDetails, problem::INTERNAL};

/// The error a request handler returns, which becomes a problem details response.
///
/// A handler returns `Result<_, Rejection<K>>`, and `?` creates the rejection from any error that
/// implements [`Expose<K>`](Expose). The response carries the [`ProblemDetails`] of the answer as
/// `application/problem+json`, with the headers of the variant. A variant whose details fail to
/// serialize is logged, and the client receives `500 Internal Server Error` instead.
/// [`error`](Self::error) returns the error, for example to log it.
///
/// An `http::Response<Vec<u8>>` converts from a rejection. With the `axum` feature, a rejection is
/// an axum response, and with the `aide` feature, the documentation of a handler returning it
/// lists the variants of `K`. The [crate documentation](crate#examples) shows a route returning
/// rejections.
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
    /// The status of the response.
    #[must_use]
    pub fn status(&self) -> StatusCode {
        self.rendered.status
    }

    /// The error the rejection was created from.
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
        let (status, headers, body) = render(&source.expose());

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

impl<K> From<Rejection<K>> for Response<Vec<u8>> {
    fn from(rejection: Rejection<K>) -> Self {
        let Rendered {
            status,
            headers,
            body,
            error: _,
        } = *rejection.rendered;

        let mut response = Self::new(body);
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
    let body = serde_json::to_vec(&ProblemDetails::from(INTERNAL))
        .expect("the internal problem should serialize");
    (INTERNAL.status, HeaderMap::new(), body)
}

#[cfg(test)]
mod tests {
    use alloc::{borrow::Cow, vec::Vec};
    use core::{assert_matches, error::Error};

    use http::{
        HeaderMap, HeaderValue, Response, StatusCode,
        header::{CONTENT_TYPE, RETRY_AFTER},
    };
    use schemars::JsonSchema;
    use serde::Serialize;
    use serde_json::{Value, json};

    use super::Rejection;
    use crate::{Answer, Expose, Header, Problem, ProblemType, ProblemVariant, Variant};

    #[derive(Serialize, JsonSchema, derive_more::Display)]
    #[display("The user store is busy.")]
    struct StoreBusy {
        #[serde(skip)]
        retry_after: u64,
    }

    impl ProblemVariant for StoreBusy {
        const HEADERS: &'static [Header] = &[Header::new::<u64>(
            "Retry-After",
            "Seconds before retrying the request.",
        )];
        const TYPE: ProblemType = ProblemType {
            type_uri: Cow::Borrowed("/problems/store/busy"),
            title: Cow::Borrowed("Store busy"),
            status: StatusCode::SERVICE_UNAVAILABLE,
        };

        fn headers(&self, headers: &mut HeaderMap) {
            headers.insert(RETRY_AFTER, HeaderValue::from(self.retry_after));
        }
    }

    /// Its details fail to serialize, as its field is named like a standard member.
    #[derive(Serialize, JsonSchema, derive_more::Display)]
    #[display("The user is locked.")]
    struct UserLocked {
        status: &'static str,
    }

    impl ProblemVariant for UserLocked {
        const TYPE: ProblemType = ProblemType {
            type_uri: Cow::Borrowed("/problems/user/locked"),
            title: Cow::Borrowed("User locked"),
            status: StatusCode::LOCKED,
        };
    }

    struct UpdateUserProblem;

    impl Problem for UpdateUserProblem {
        const VARIANTS: &'static [Variant] = &[
            Variant::of::<StoreBusy>(),
            Variant::of::<UserLocked>(),
            Variant::INTERNAL,
        ];
    }

    #[derive(Debug, derive_more::Display)]
    enum UpdateUserError {
        #[display("the user store is busy")]
        Busy,
        #[display("the user is locked")]
        Locked,
        #[display("the user store is unreachable")]
        Unreachable,
    }

    impl Error for UpdateUserError {}

    impl Expose<UpdateUserProblem> for UpdateUserError {
        fn expose(&self) -> Answer<'_, UpdateUserProblem> {
            match self {
                Self::Busy => Answer::new(StoreBusy { retry_after: 30 }),
                Self::Locked => Answer::new(UserLocked { status: "locked" }),
                Self::Unreachable => Answer::internal(),
            }
        }
    }

    fn body(response: &Response<Vec<u8>>) -> Value {
        serde_json::from_slice(response.body()).expect("the body should be JSON")
    }

    fn internal_body() -> Value {
        json!({"type": "about:blank", "title": "Internal Server Error", "status": 500})
    }

    #[test]
    fn rejection_exposed() {
        let response = Response::from(Rejection::<UpdateUserProblem>::from(UpdateUserError::Busy));

        assert_eq!(
            body(&response),
            json!({
                "type": "/problems/store/busy",
                "title": "Store busy",
                "status": 503,
                "detail": "The user store is busy."
            }),
            "the body should be the details of the exposed variant"
        );
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
        let rejection = Rejection::<UpdateUserProblem>::from(UpdateUserError::Unreachable);

        assert_matches!(
            rejection.error().downcast_ref(),
            Some(UpdateUserError::Unreachable),
            "the rejection should keep the error it was created from"
        );
        let response = Response::from(rejection);
        assert_eq!(
            response.status(),
            StatusCode::INTERNAL_SERVER_ERROR,
            "an internal error should be answered with 500"
        );
        assert_eq!(
            body(&response),
            internal_body(),
            "the body should reveal nothing of the error"
        );
    }

    #[test]
    fn rejection_unserializable() {
        let response = Response::from(Rejection::<UpdateUserProblem>::from(
            UpdateUserError::Locked,
        ));

        assert_eq!(
            response.status(),
            StatusCode::INTERNAL_SERVER_ERROR,
            "a variant failing to serialize should be answered with 500"
        );
        assert_eq!(
            body(&response),
            internal_body(),
            "the body should be the internal problem instead of a partial document"
        );
    }
}
