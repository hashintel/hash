use alloc::borrow::Cow;

use crate::{NoExtensions, ProblemDetails, StatusCode};

/// Metadata shared by occurrences of a problem type.
///
/// Occurrences created from this definition borrow its type URI and title.
/// Use [`Cow::Borrowed`] for string literals in const contexts.
///
/// ```
/// # #![feature(const_convert, const_trait_impl)]
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
///
/// let details = WRONG_ACTOR_TYPE
///     .detail("This operation requires a machine actor.")
///     .instance("/problem-occurrences/42");
///
/// let details = ProblemDetails::from(&WRONG_ACTOR_TYPE);
///
/// struct WrongActorType {
///     required_actor_type: &'static str,
/// }
///
/// let details = WRONG_ACTOR_TYPE
///     .detail("This operation requires a machine actor.")
///     .extensions(WrongActorType {
///         required_actor_type: "machine",
///     });
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
    #[must_use]
    pub const fn detail<'a>(
        &'a self,
        detail: impl [const] Into<Cow<'a, str>>,
    ) -> ProblemDetails<'a> {
        ProblemDetails::from(self).detail(detail)
    }

    /// Creates an occurrence identified by the supplied URI reference.
    #[must_use]
    pub const fn instance<'a>(
        &'a self,
        instance: impl [const] Into<Cow<'a, str>>,
    ) -> ProblemDetails<'a> {
        ProblemDetails::from(self).instance(instance)
    }

    /// Creates an occurrence with the supplied extension members.
    #[must_use]
    pub const fn extensions<E>(&self, extensions: E) -> ProblemDetails<'_, E> {
        ProblemDetails::from(self).extensions(extensions)
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
            status: definition.status.as_u16(),
            detail: None,
            instance: None,
            extensions: NoExtensions {},
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::{borrow::Cow, string::String};
    use core::ptr;

    use crate::{ProblemDetails, ProblemType, StatusCode};

    #[test]
    fn from_owned_metadata() {
        let definition = ProblemType {
            type_uri: Cow::Owned(String::from(
                "https://example.com/problems/invalid-parameters",
            )),
            title: Cow::Owned(String::from("Invalid parameters")),
            status: StatusCode::BAD_REQUEST,
        };
        let details = ProblemDetails::from(&definition);

        assert!(
            ptr::eq(details.type_uri.as_ref(), definition.type_uri.as_ref()),
            "the type URI should reuse the definition's allocation"
        );
        assert!(
            ptr::eq(details.title.as_ref(), definition.title.as_ref()),
            "the title should reuse the definition's allocation"
        );
    }
}
