use alloc::{borrow::Cow, boxed::Box, sync::Arc, vec::Vec};
use core::{error::Error, fmt, marker::PhantomData};

use http::{HeaderMap, HeaderValue, Response, StatusCode, header::CONTENT_TYPE};

use crate::{Answer, Expose, Problem, ProblemDetails, ProblemType};

/// The problem type a client receives when the details of its variant fail to serialize.
const UNSERIALIZABLE: ProblemType = ProblemType {
    type_uri: Cow::Borrowed("about:blank"),
    title: Cow::Borrowed("Internal Server Error"),
    status: StatusCode::INTERNAL_SERVER_ERROR,
};

/// The error a request handler returns, which becomes a problem details response.
///
/// A handler returns `Result<_, Rejection<K>>`, and `?` creates the rejection from any error that
/// implements [`Expose<K>`](Expose): an [`Error`] or an `error_stack::Report` that is `Send`,
/// `Sync` and `'static`. The response carries the [`ProblemDetails`] of the answer as
/// `application/problem+json`, with the headers of the variant, and keeps the error in its
/// extensions as [`Rejected`], so a middleware can log it together with its request. If the
/// details of the variant fail to serialize, the client receives a bare
/// `500 Internal Server Error` instead, which the documentation does not list, and [`Rejected`]
/// holds the failure as well. [`error`](Self::error) returns the error.
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
    response: Response<Vec<u8>>,
    rejected: Rejected,
}

impl<K> Rejection<K> {
    /// The status of the response.
    #[must_use]
    pub fn status(&self) -> StatusCode {
        self.rendered.response.status()
    }

    /// The error the rejection was created from.
    ///
    /// A `Report` is kept as an error that cannot be downcast back to the `Report`.
    #[must_use]
    pub fn error(&self) -> &(dyn Error + Send + Sync + 'static) {
        self.rendered.rejected.error()
    }
}

impl<K> fmt::Debug for Rejection<K> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Rejection")
            .field("status", &self.rendered.response.status())
            .field("error", &self.rendered.rejected.error)
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
        // The answer borrows from `source`, so it goes out of scope before `source` is moved.
        let (response, problem_type, detail, unserializable) = {
            let answer = source.expose();
            match render(&answer) {
                Ok((response, detail)) => (response, answer.problem_type(), detail, None),
                Err(error) => (
                    internal(),
                    UNSERIALIZABLE,
                    None,
                    Some(Arc::new(Unserializable {
                        problem_type: answer.problem_type(),
                        error,
                    })),
                ),
            }
        };
        let error: Box<dyn Error + Send + Sync> = source.into();

        Self {
            rendered: Box::new(Rendered {
                response,
                rejected: Rejected {
                    problem_type,
                    detail,
                    error: Arc::from(error),
                    unserializable,
                },
            }),
            problem: PhantomData,
        }
    }
}

impl<K> From<Rejection<K>> for Response<Vec<u8>> {
    fn from(rejection: Rejection<K>) -> Self {
        let Rendered {
            mut response,
            rejected,
        } = *rejection.rendered;
        response.extensions_mut().insert(rejected);
        response
    }
}

/// A [`Rejection`] that became a response, kept in the extensions of that response.
///
/// It holds the problem type and the `detail` the client received, and the error the rejection
/// was created from, so a middleware can log the error together with the request it answered. If
/// the details of the variant failed to serialize, it holds that failure as well.
///
/// # Examples
///
/// ```
/// # use std::{borrow::Cow, fmt};
/// use http::{Response, StatusCode};
/// use problematic::{
///     Answer, Expose, Problem, ProblemType, ProblemVariant, Rejected, Rejection, Variant,
/// };
///
/// /// The user store is busy.
/// #[derive(serde::Serialize, schemars::JsonSchema)]
/// struct StoreBusy;
/// # impl fmt::Display for StoreBusy {
/// #     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
/// #         formatter.write_str("The user store is busy.")
/// #     }
/// # }
///
/// impl ProblemVariant for StoreBusy {
///     const TYPE: ProblemType = ProblemType {
///         type_uri: Cow::Borrowed("https://example.com/problems/store-busy"),
///         title: Cow::Borrowed("Store busy"),
///         status: StatusCode::SERVICE_UNAVAILABLE,
///     };
/// }
///
/// struct GetUserProblem;
///
/// impl Problem for GetUserProblem {
///     const VARIANTS: &'static [Variant] = &[Variant::of::<StoreBusy>()];
/// }
///
/// #[derive(Debug)]
/// struct ConnectionLost;
/// # impl fmt::Display for ConnectionLost {
/// #     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
/// #         formatter.write_str("the connection to the user store was lost")
/// #     }
/// # }
/// # impl core::error::Error for ConnectionLost {}
///
/// impl Expose<GetUserProblem> for ConnectionLost {
///     fn expose(&self) -> Answer<'_, GetUserProblem> {
///         Answer::new(StoreBusy)
///     }
/// }
///
/// let response = Response::from(Rejection::<GetUserProblem>::from(ConnectionLost));
///
/// // A middleware finds the error the client did not receive.
/// let rejected = response
///     .extensions()
///     .get::<Rejected>()
///     .expect("the response should keep its rejection");
/// assert_eq!(rejected.problem_type().title, "Store busy");
/// assert!(rejected.error().is::<ConnectionLost>());
/// ```
#[derive(Debug, Clone)]
pub struct Rejected {
    problem_type: ProblemType,
    detail: Option<String>,
    error: Arc<dyn Error + Send + Sync>,
    unserializable: Option<Arc<Unserializable>>,
}

impl Rejected {
    /// The problem type the client received.
    #[must_use]
    pub const fn problem_type(&self) -> &ProblemType {
        &self.problem_type
    }

    /// The `detail` the client received, if its problem details carried one.
    #[must_use]
    #[expect(
        clippy::missing_const_for_fn,
        reason = "`Option::as_deref` is const only for a const `Deref`, which `String` does not \
                  implement"
    )]
    pub fn detail(&self) -> Option<&str> {
        self.detail.as_deref()
    }

    /// The error the rejection was created from.
    ///
    /// A `Report` is kept as an error that cannot be downcast back to the `Report`.
    #[must_use]
    pub fn error(&self) -> &(dyn Error + Send + Sync + 'static) {
        &*self.error
    }

    /// Why the details of the variant failed to serialize, if they did.
    ///
    /// The client then received a bare `500 Internal Server Error` instead of the variant. The
    /// error names the problem type and the status of the variant.
    #[must_use]
    pub fn serialization_error(&self) -> Option<&(dyn Error + Send + Sync + 'static)> {
        self.unserializable
            .as_deref()
            .map(|error| error as &(dyn Error + Send + Sync + 'static))
    }
}

/// The details of a variant failed to serialize.
#[derive(Debug)]
struct Unserializable {
    problem_type: ProblemType,
    error: serde_json::Error,
}

impl fmt::Display for Unserializable {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "the details of problem type `{}` with status {} failed to serialize: {}",
            self.problem_type.type_uri,
            self.problem_type.status.as_u16(),
            self.error
        )
    }
}

impl Error for Unserializable {}

/// The response answering with `answer`, and the `detail` it carries.
fn render<K>(
    answer: &Answer<'_, K>,
) -> Result<(Response<Vec<u8>>, Option<String>), serde_json::Error> {
    let details = answer.details();
    let body = serde_json::to_vec(&details)?;

    let mut headers = HeaderMap::new();
    answer.headers(&mut headers);
    let response = problem_response(details.status, headers, body);
    Ok((response, details.detail.map(Cow::into_owned)))
}

/// The bare `500 Internal Server Error` a client receives when the details of its variant fail to
/// serialize.
fn internal() -> Response<Vec<u8>> {
    let body = serde_json::to_vec(&ProblemDetails::from(UNSERIALIZABLE))
        .expect("a bare problem type should serialize");
    problem_response(UNSERIALIZABLE.status, HeaderMap::new(), body)
}

/// A problem details response with `status`, `headers` and `body`.
fn problem_response(status: StatusCode, headers: HeaderMap, body: Vec<u8>) -> Response<Vec<u8>> {
    let mut response = Response::new(body);
    *response.status_mut() = status;
    *response.headers_mut() = headers;
    // After the variant's headers, which must not replace the media type.
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/problem+json"),
    );
    response
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

    use super::{Rejected, Rejection, UNSERIALIZABLE};
    use crate::{
        Answer, Expose, Header, Problem, ProblemDetails, ProblemType, ProblemVariant, Variant,
    };

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

    /// Adds a `Content-Type` of its own.
    #[derive(Serialize, JsonSchema, derive_more::Display)]
    #[display("The user is archived.")]
    struct UserArchived;

    impl ProblemVariant for UserArchived {
        const HEADERS: &'static [Header] = &[Header::new::<String>(
            "Content-Type",
            "The media type of the response.",
        )];
        const TYPE: ProblemType = ProblemType {
            type_uri: Cow::Borrowed("/problems/user/archived"),
            title: Cow::Borrowed("User archived"),
            status: StatusCode::GONE,
        };

        fn headers(&self, headers: &mut HeaderMap) {
            headers.insert(CONTENT_TYPE, HeaderValue::from_static("text/plain"));
        }
    }

    struct UpdateUserProblem;

    impl Problem for UpdateUserProblem {
        const VARIANTS: &'static [Variant] = &[
            Variant::of::<StoreBusy>(),
            Variant::of::<UserLocked>(),
            Variant::of::<UserArchived>(),
        ];
    }

    #[derive(Debug, derive_more::Display)]
    enum UpdateUserError {
        #[display("the user store is busy")]
        Busy,
        #[display("the user is locked")]
        Locked,
        #[display("the user is archived")]
        Archived,
    }

    impl Error for UpdateUserError {}

    impl Expose<UpdateUserProblem> for UpdateUserError {
        fn expose(&self) -> Answer<'_, UpdateUserProblem> {
            match self {
                Self::Busy => Answer::new(StoreBusy { retry_after: 30 }),
                Self::Locked => Answer::new(UserLocked { status: "locked" }),
                Self::Archived => Answer::new(UserArchived),
            }
        }
    }

    fn body(response: &Response<Vec<u8>>) -> Value {
        serde_json::from_slice(response.body()).expect("the body should be JSON")
    }

    fn internal_body() -> Value {
        serde_json::to_value(ProblemDetails::from(UNSERIALIZABLE))
            .expect("a bare problem type should serialize")
    }

    #[test]
    fn response_exposed() {
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
    fn response_media_type() {
        let response = Response::from(Rejection::<UpdateUserProblem>::from(
            UpdateUserError::Archived,
        ));

        assert_eq!(
            response.headers()[CONTENT_TYPE],
            "application/problem+json",
            "the headers of the variant should not replace the media type"
        );
    }

    #[test]
    fn error_kept() {
        let rejection = Rejection::<UpdateUserProblem>::from(UpdateUserError::Busy);

        assert_matches!(
            rejection.error().downcast_ref(),
            Some(UpdateUserError::Busy),
            "the rejection should keep the error it was created from"
        );
    }

    fn rejected(response: &Response<Vec<u8>>) -> &Rejected {
        response
            .extensions()
            .get::<Rejected>()
            .expect("the response should keep its rejection")
    }

    #[test]
    fn response_rejected() {
        let response = Response::from(Rejection::<UpdateUserProblem>::from(UpdateUserError::Busy));
        let rejected = rejected(&response);

        assert_eq!(
            *rejected.problem_type(),
            StoreBusy::TYPE,
            "the rejection should keep the problem type the client received"
        );
        assert_eq!(
            rejected.detail(),
            Some("The user store is busy."),
            "the rejection should keep the detail the client received"
        );
        assert_matches!(
            rejected.error().downcast_ref(),
            Some(UpdateUserError::Busy),
            "the rejection should keep the error it was created from"
        );
        assert!(
            rejected.serialization_error().is_none(),
            "details that serialize should record no failure"
        );
    }

    #[test]
    fn response_unserializable() {
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
        assert_eq!(
            response.headers()[CONTENT_TYPE],
            "application/problem+json",
            "the internal problem should be a problem details document"
        );

        let rejected = rejected(&response);
        assert_eq!(
            *rejected.problem_type(),
            UNSERIALIZABLE,
            "the rejection should keep the problem type the client received instead"
        );
        assert_eq!(
            rejected.detail(),
            None,
            "the rejection should keep no detail, as the client received none"
        );
        let failure = rejected
            .serialization_error()
            .expect("the failure to serialize should be recorded")
            .to_string();
        assert!(
            failure.contains("/problems/user/locked") && failure.contains("423"),
            "the failure should name the variant whose details did not serialize: {failure}"
        );
    }
}
