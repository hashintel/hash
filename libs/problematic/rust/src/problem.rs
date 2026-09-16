use alloc::borrow::Cow;

use crate::ProblemDetails;

/// A failure that provides problem details for the client.
///
/// The details and extension members can borrow from the failure.
///
/// # Examples
///
/// ```
/// use std::borrow::Cow;
///
/// use problematic::{Problem, ProblemDetails, ProblemType, StatusCode};
///
/// struct InvalidParameter {
///     parameter: String,
///     explanation: String,
/// }
///
/// struct InvalidParameterExtensions<'a> {
///     parameter: &'a str,
/// }
///
/// const INVALID_PARAMETER: ProblemType = ProblemType {
///     type_uri: Cow::Borrowed("https://example.com/problems/invalid-parameter"),
///     title: Cow::Borrowed("Invalid parameter"),
///     status: StatusCode::BAD_REQUEST,
/// };
///
/// impl Problem for InvalidParameter {
///     type Extensions<'a> = InvalidParameterExtensions<'a>;
///
///     fn details(&self) -> ProblemDetails<'_, Self::Extensions<'_>> {
///         INVALID_PARAMETER
///             .detail(&self.explanation)
///             .extensions(InvalidParameterExtensions {
///                 parameter: &self.parameter,
///             })
///     }
/// }
///
/// let error = InvalidParameter {
///     parameter: "limit".to_owned(),
///     explanation: "The limit must be positive.".to_owned(),
/// };
/// let details = error.details();
///
/// assert_eq!(
///     details.detail.as_deref(),
///     Some("The limit must be positive.")
/// );
/// assert_eq!(details.extensions.parameter, "limit");
/// ```
pub trait Problem {
    /// The extension members, which may borrow from this failure for `'a`.
    type Extensions<'a>
    where
        Self: 'a;

    /// Returns the problem details exposed to the client.
    #[must_use]
    fn details(&self) -> ProblemDetails<'_, Self::Extensions<'_>>;
}

impl<E> Problem for ProblemDetails<'_, E> {
    type Extensions<'a>
        = &'a E
    where
        Self: 'a;

    fn details(&self) -> ProblemDetails<'_, Self::Extensions<'_>> {
        ProblemDetails {
            type_uri: Cow::Borrowed(&self.type_uri),
            title: Cow::Borrowed(&self.title),
            status: self.status,
            detail: self.detail.as_deref().map(Cow::Borrowed),
            instance: self.instance.as_deref().map(Cow::Borrowed),
            extensions: &self.extensions,
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::{borrow::Cow, string::String};
    use core::{assert_matches, ptr};

    use crate::{Problem, ProblemDetails};

    #[derive(Debug)]
    struct Extensions<'a> {
        parameter: &'a str,
    }

    fn details<P: Problem + ?Sized>(problem: &P) -> ProblemDetails<'_, P::Extensions<'_>> {
        problem.details()
    }

    #[test]
    fn details_borrowed() {
        let parameter = String::from("limit");
        let source = ProblemDetails {
            type_uri: Cow::Owned(String::from(
                "https://example.com/problems/invalid-parameter",
            )),
            title: Cow::Owned(String::from("Invalid parameter")),
            status: 400,
            detail: Some(Cow::Owned(String::from("The limit must be positive."))),
            instance: Some(Cow::Owned(String::from("/problem-occurrences/42"))),
            extensions: Extensions {
                parameter: &parameter,
            },
        };
        let borrowed = details(&source);

        assert_matches!(
            borrowed,
            ProblemDetails {
                type_uri: Cow::Borrowed(_),
                title: Cow::Borrowed(_),
                detail: Some(Cow::Borrowed(_)),
                instance: Some(Cow::Borrowed(_)),
                ..
            },
            "the details should borrow the source strings"
        );
        assert!(
            ptr::eq(borrowed.extensions, &raw const source.extensions),
            "the details should borrow the source extensions"
        );
        assert!(
            ptr::eq(borrowed.extensions.parameter, parameter.as_str()),
            "the extension member should retain its original borrow"
        );
    }
}
