use alloc::borrow::Cow;

use crate::{ProblemDetails, StatusCode};

/// Metadata shared by occurrences of a problem type.
///
/// The [`detail()`](Self::detail), [`instance()`](Self::instance), and
/// [`extensions()`](Self::extensions) methods borrow the definition's type URI and title.
///
/// ```
/// use std::borrow::Cow;
///
/// use problematic::{ProblemType, StatusCode};
///
/// const WRONG_ACTOR_TYPE: ProblemType = ProblemType {
///     type_uri: Cow::Borrowed("https://example.com/problems/wrong-actor-type"),
///     title: Cow::Borrowed("Wrong actor type"),
///     status: StatusCode::FORBIDDEN,
/// };
///
/// let details = WRONG_ACTOR_TYPE
///     .detail("This operation requires a machine actor.")
///     .instance("/problem-occurrences/42");
/// ```
///
/// Use [`ProblemDetails::from`] to create an occurrence with only the shared metadata.
/// Add typed extension members with [`extensions()`](Self::extensions).
///
/// For const construction, enable the const trait features and pass string literals as
/// [`Cow::Borrowed`]:
///
/// ```
/// #![feature(const_convert, const_trait_impl)]
///
/// use std::borrow::Cow;
///
/// use problematic::{ProblemDetails, ProblemType, StatusCode};
///
/// const WRONG_ACTOR_TYPE: ProblemType = ProblemType {
///     type_uri: Cow::Borrowed("https://example.com/problems/wrong-actor-type"),
///     title: Cow::Borrowed("Wrong actor type"),
///     status: StatusCode::FORBIDDEN,
/// };
///
/// const DETAILS: ProblemDetails<'static> = WRONG_ACTOR_TYPE
///     .detail(Cow::Borrowed("This operation requires a machine actor."))
///     .instance(Cow::Borrowed("/problem-occurrences/42"));
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

impl ProblemType {
    /// Creates an occurrence with a human-readable explanation.
    ///
    /// See [`ProblemDetails::detail()`] for an example borrowing an explanation assembled
    /// at runtime.
    #[must_use]
    pub const fn detail<'a>(
        &'a self,
        detail: impl [const] Into<Cow<'a, str>>,
    ) -> ProblemDetails<'a> {
        ProblemDetails::from(self).detail(detail)
    }

    /// Creates an occurrence identified by the supplied URI reference.
    ///
    /// See [`ProblemDetails::instance()`] for an example using a URI built at runtime.
    #[must_use]
    pub const fn instance<'a>(
        &'a self,
        instance: impl [const] Into<Cow<'a, str>>,
    ) -> ProblemDetails<'a> {
        ProblemDetails::from(self).instance(instance)
    }

    /// Creates an occurrence with the supplied extension members.
    ///
    /// See [`ProblemDetails::extensions()`] for an example serializing typed extension members.
    #[must_use]
    pub const fn extensions<E>(&self, extensions: E) -> ProblemDetails<'_, E> {
        ProblemDetails::from(self).extensions(extensions)
    }
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

    use crate::{ProblemDetails, ProblemType, StatusCode};

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
