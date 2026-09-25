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
    ///
    /// Use `about:blank` when the HTTP status code fully describes the problem type.
    pub type_uri: Cow<'static, str>,
    /// The title shared by occurrences of this problem type.
    pub title: Cow<'static, str>,
    /// The HTTP status code for occurrences of this problem type.
    pub status: StatusCode,
}

const impl PartialEq for ProblemType {
    fn eq(&self, other: &Self) -> bool {
        self.status.as_u16() == other.status.as_u16()
            && same(text(&self.type_uri), text(&other.type_uri))
            && same(text(&self.title), text(&other.title))
    }
}

impl Eq for ProblemType {}

#[expect(
    clippy::ptr_arg,
    reason = "a `Cow` derefs to `str` only outside of const, so the match does it here"
)]
const fn text<'a>(value: &'a Cow<'static, str>) -> &'a [u8] {
    match value {
        Cow::Borrowed(text) => text.as_bytes(),
        Cow::Owned(text) => text.as_bytes(),
    }
}

const fn same(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut index = 0;
    while index < left.len() {
        if left[index] != right[index] {
            return false;
        }
        index += 1;
    }
    true
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

    const fn web(type_uri: &'static str, title: &'static str, status: StatusCode) -> ProblemType {
        ProblemType {
            type_uri: Cow::Borrowed(type_uri),
            title: Cow::Borrowed(title),
            status,
        }
    }

    #[test]
    fn eq_every_member() {
        let listed = web("/problems/web", "Web", StatusCode::NOT_FOUND);

        assert_eq!(
            listed,
            ProblemType {
                type_uri: Cow::Owned(String::from("/problems/web")),
                title: Cow::Owned(String::from("Web")),
                status: StatusCode::NOT_FOUND,
            },
            "a problem type with owned text should equal one with the same borrowed text"
        );
        for (other, member) in [
            (
                web("/problems/web/missing", "Web", StatusCode::NOT_FOUND),
                "type URI",
            ),
            (
                web("/problems/web", "Web gone", StatusCode::NOT_FOUND),
                "title",
            ),
            (web("/problems/web", "Web", StatusCode::GONE), "status"),
        ] {
            assert_ne!(
                listed, other,
                "a problem type with another {member} should not be equal"
            );
        }
    }

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
