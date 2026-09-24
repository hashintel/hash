use alloc::borrow::Cow;

use http::StatusCode;

use crate::ProblemDetails;

/// A problem type: the type URI, title and status every occurrence of one kind of problem shares
/// ([RFC 9457, section 4](https://www.rfc-editor.org/rfc/rfc9457#section-4)).
///
/// A [`ProblemVariant`](crate::ProblemVariant) specifies its problem type, and the
/// [`ProblemDetails`] a client receives for the variant are created from it.
/// [`ProblemDetails::from`] creates details from a problem type directly, and borrows its type URI
/// and title from a reference.
///
/// # Examples
///
/// ```
/// use std::borrow::Cow;
///
/// use http::StatusCode;
/// use problematic::{ProblemDetails, ProblemType};
///
/// const USER_NOT_FOUND: ProblemType = ProblemType {
///     type_uri: Cow::Borrowed("https://example.com/problems/user-not-found"),
///     title: Cow::Borrowed("User not found"),
///     status: StatusCode::NOT_FOUND,
/// };
///
/// let details = ProblemDetails::from(&USER_NOT_FOUND).with_detail("The user does not exist.");
/// assert_eq!(details.title, "User not found");
/// ```
#[derive(Debug)]
pub struct ProblemType {
    /// The stable URI identifying this problem type.
    pub type_uri: Cow<'static, str>,
    /// The title shared by occurrences of this problem type.
    pub title: Cow<'static, str>,
    /// The HTTP status code for occurrences of this problem type.
    pub status: StatusCode,
}

const impl<'a> From<ProblemType> for ProblemDetails<'a> {
    fn from(definition: ProblemType) -> Self {
        Self {
            type_uri: definition.type_uri,
            title: definition.title,
            status: definition.status,
            detail: None,
            instance: None,
            extensions: (),
        }
    }
}

const impl<'a> From<&'a ProblemType> for ProblemDetails<'a> {
    fn from(definition: &'a ProblemType) -> Self {
        Self {
            type_uri: Cow::Borrowed(match &definition.type_uri {
                Cow::Borrowed(uri) => uri,
                Cow::Owned(uri) => uri.as_str(),
            }),
            title: Cow::Borrowed(match &definition.title {
                Cow::Borrowed(title) => title,
                Cow::Owned(title) => title.as_str(),
            }),
            status: definition.status,
            detail: None,
            instance: None,
            extensions: (),
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::{borrow::Cow, string::String};
    use core::{assert_matches, ptr};

    use http::StatusCode;

    use crate::{ProblemDetails, ProblemType};

    #[test]
    fn details_owned_metadata() {
        let definition = ProblemType {
            type_uri: Cow::Owned(String::from(
                "https://example.com/problems/invalid-parameters",
            )),
            title: Cow::Owned(String::from("Invalid parameters")),
            status: StatusCode::BAD_REQUEST,
        };

        let details = ProblemDetails::from(&definition);

        assert_matches!(
            details.type_uri, Cow::Borrowed(uri) if ptr::eq(uri, definition.type_uri.as_ref()),
            "the type URI should borrow the definition's allocation"
        );
        assert_matches!(
            details.title, Cow::Borrowed(title) if ptr::eq(title, definition.title.as_ref()),
            "the title should borrow the definition's allocation"
        );
    }
}
