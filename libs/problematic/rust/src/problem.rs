use alloc::{borrow::Cow, string::ToString as _};
use core::fmt::Display;

use http::HeaderMap;
use schemars::JsonSchema;
#[cfg(feature = "aide")]
use schemars::{Schema, SchemaGenerator};
use serde_core::Serialize;

use crate::{ProblemDetails, ProblemType};

/// The problem type of an error that stays internal.
pub(crate) const INTERNAL: ProblemType = ProblemType {
    type_uri: Cow::Borrowed("about:blank"),
    title: Cow::Borrowed("Internal Server Error"),
    status: http::StatusCode::INTERNAL_SERVER_ERROR,
};

/// An internal error prevented the request from completing.
#[cfg(feature = "aide")]
#[derive(JsonSchema)]
struct Internal;

/// The errors a client can receive from one endpoint.
///
/// Define one per endpoint, or per group of endpoints with the same errors, and list its
/// variants in [`VARIANTS`](Self::VARIANTS). The other types of this crate are parameterized by
/// it: your error type implements [`Expose<K>`](crate::Expose) to map its errors to the variants
/// of `K`, an [`Answer<K>`](crate::Answer) carries one of them, and a handler returns a
/// [`Rejection<K>`](crate::Rejection). With the `aide` feature, the documentation of the endpoint
/// lists exactly these variants.
pub trait Problem {
    /// The variants a client can receive, each listed with [`Variant::of`], and
    /// [`Variant::INTERNAL`] if an error can stay internal.
    ///
    /// Documenting a set that lists two variants with the same type URI and status fails to
    /// compile.
    const VARIANTS: &'static [Variant];
}

/// One kind of error a client can receive, such as "user not found".
///
/// Implement it on a struct that holds what the client needs to know, and list it in the
/// [`Problem`] of every endpoint that can answer with it. The client receives the error as
/// [`ProblemDetails`]: [`TYPE`](Self::TYPE) gives its [`type`](ProblemDetails::type_uri),
/// [`title`](ProblemDetails::title) and [`status`](ProblemDetails::status), `Display` its
/// [`detail`](ProblemDetails::detail), and the serialized fields its
/// [`extensions`](ProblemDetails::extensions).
///
/// A variant without fields is a unit struct, and a field needed only for the `detail` or a
/// header is skipped with `#[serde(skip)]`. No field may serialize under the name of a standard
/// member: `type`, `title`, `status`, `detail` or `instance`. A client receives such a variant as
/// `500 Internal Server Error`, and documenting it panics.
///
/// With the `aide` feature, the documentation describes the variant with the `description` of its
/// JSON schema, which `#[derive(JsonSchema)]` takes from its doc comment.
pub trait ProblemVariant: Display + Serialize + JsonSchema + Sized {
    /// The problem type of every response for this variant, with a client or server error
    /// status.
    const TYPE: ProblemType;

    /// The response headers this variant adds, as the documentation lists them.
    ///
    /// [`headers`](Self::headers) has to add exactly these, by name. Debug builds panic otherwise.
    const HEADERS: &'static [Header] = &[];

    /// Adds the response headers for this error, such as `Retry-After`, to `headers`.
    fn headers(&self, _headers: &mut HeaderMap) {}

    /// The value of this variant the documentation shows as its example response.
    ///
    /// Without one, a variant without fields is shown with its type URI, title and status alone,
    /// and a variant with fields has no example.
    #[must_use]
    fn example() -> Option<Self> {
        None
    }
}

/// One occurrence of a [`ProblemVariant`], with its type erased.
pub(crate) trait Occurrence {
    fn details(&self) -> ProblemDetails<'_, &dyn erased_serde::Serialize>;

    fn headers(&self, headers: &mut HeaderMap);
}

impl<V: ProblemVariant> Occurrence for V {
    fn details(&self) -> ProblemDetails<'_, &dyn erased_serde::Serialize> {
        ProblemDetails::from(V::TYPE)
            .with_detail(self.to_string())
            .with_extensions(self)
    }

    fn headers(&self, headers: &mut HeaderMap) {
        if cfg!(debug_assertions) {
            let mut added = HeaderMap::new();
            ProblemVariant::headers(self, &mut added);
            debug_assert!(
                added.keys().all(|name| V::HEADERS
                    .iter()
                    .any(|header| name.as_str().eq_ignore_ascii_case(header.name)))
                    && V::HEADERS
                        .iter()
                        .all(|header| added.contains_key(header.name)),
                "the headers of `{}` should be the ones its `HEADERS` documents",
                V::TYPE.type_uri
            );
            headers.extend(added);
        } else {
            ProblemVariant::headers(self, headers);
        }
    }
}

/// A response header of a [`ProblemVariant`], as its [`HEADERS`](ProblemVariant::HEADERS) list it
/// for the documentation.
#[derive(Debug)]
pub struct Header {
    name: &'static str,
    #[cfg(feature = "aide")]
    description: &'static str,
    #[cfg(feature = "aide")]
    schema: fn(&mut SchemaGenerator) -> Schema,
}

impl Header {
    /// The header `name`, documented with `description` and the schema of its value `T`.
    #[must_use]
    #[cfg_attr(
        not(feature = "aide"),
        expect(
            clippy::extra_unused_type_parameters,
            reason = "only the documentation reads the header's type, and the signature stays the \
                      same across features"
        )
    )]
    pub const fn new<T: JsonSchema>(name: &'static str, description: &'static str) -> Self {
        #[cfg(not(feature = "aide"))]
        let _: &str = description;

        Self {
            name,
            #[cfg(feature = "aide")]
            description,
            #[cfg(feature = "aide")]
            schema: T::json_schema,
        }
    }

    #[cfg(feature = "aide")]
    pub(crate) const fn name(&self) -> &'static str {
        self.name
    }

    #[cfg(feature = "aide")]
    pub(crate) const fn description(&self) -> &'static str {
        self.description
    }

    #[cfg(feature = "aide")]
    pub(crate) fn schema(&self, generator: &mut SchemaGenerator) -> Schema {
        (self.schema)(generator)
    }
}

/// An entry of [`Problem::VARIANTS`].
///
/// Your error struct implements [`ProblemVariant`], and a [`Problem`] lists it with the `Variant`
/// that [`Variant::of`] creates. [`Variant::INTERNAL`] lists the internal error.
#[derive(Debug)]
pub struct Variant {
    problem_type: ProblemType,
    #[cfg(feature = "aide")]
    extensions: fn(&mut SchemaGenerator) -> Schema,
    #[cfg(feature = "aide")]
    headers: &'static [Header],
    #[cfg(feature = "aide")]
    example: fn() -> Option<serde_json::Value>,
}

impl Variant {
    /// Lists the internal error, which a client receives as `500 Internal Server Error` without
    /// detail.
    ///
    /// A [`Problem`] lists it when an error of its endpoint can stay internal, answered with
    /// [`Answer::internal`](crate::Answer::internal). Without it, the documentation of the
    /// endpoint lists no `500 Internal Server Error`.
    pub const INTERNAL: Self = Self {
        problem_type: INTERNAL,
        #[cfg(feature = "aide")]
        extensions: Internal::json_schema,
        #[cfg(feature = "aide")]
        headers: &[],
        #[cfg(feature = "aide")]
        example: no_example,
    };

    /// Lists the [`ProblemVariant`] `V`.
    ///
    /// A variant with lifetime parameters is listed with `'static` ones, such as
    /// `Variant::of::<UserNotFound<'static>>()`.
    ///
    /// # Panics
    ///
    /// Panics if the status of `V` is not a client or server error status. In a constant such as
    /// `VARIANTS`, it fails at compile time:
    ///
    /// ```compile_fail,E0080
    /// # use std::{borrow::Cow, fmt};
    /// use http::StatusCode;
    /// use problematic::{ProblemType, ProblemVariant, Variant};
    ///
    /// #[derive(serde::Serialize, schemars::JsonSchema)]
    /// struct UserMoved;
    /// # impl fmt::Display for UserMoved {
    /// #     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    /// #         formatter.write_str("The user moved.")
    /// #     }
    /// # }
    ///
    /// impl ProblemVariant for UserMoved {
    ///     const TYPE: ProblemType = ProblemType {
    ///         type_uri: Cow::Borrowed("https://example.com/problems/user-moved"),
    ///         title: Cow::Borrowed("User moved"),
    ///         status: StatusCode::PERMANENT_REDIRECT,
    ///     };
    /// }
    ///
    /// // Fails to compile: `UserMoved` has a redirection status.
    /// const VARIANTS: &[Variant] = &[Variant::of::<UserMoved>()];
    /// ```
    #[must_use]
    pub const fn of<V: ProblemVariant>() -> Self {
        let variant = Self {
            problem_type: V::TYPE,
            #[cfg(feature = "aide")]
            extensions: V::json_schema,
            #[cfg(feature = "aide")]
            headers: V::HEADERS,
            #[cfg(feature = "aide")]
            example: example_of::<V>,
        };
        let status = variant.problem_type.status.as_u16();
        assert!(
            400 <= status && status <= 599,
            "a problem variant should have a client or server error status"
        );
        variant
    }

    /// The rendered example occurrence, if the variant has one.
    #[cfg(feature = "aide")]
    pub(crate) fn example(&self) -> Option<serde_json::Value> {
        (self.example)()
    }

    /// The problem type of the listed variant.
    #[must_use]
    pub const fn problem_type(&self) -> &ProblemType {
        &self.problem_type
    }

    #[cfg(feature = "aide")]
    pub(crate) fn extensions(&self, generator: &mut SchemaGenerator) -> Schema {
        (self.extensions)(generator)
    }

    #[cfg(feature = "aide")]
    pub(crate) const fn headers(&self) -> &'static [Header] {
        self.headers
    }
}

#[cfg(feature = "aide")]
fn example_of<V: ProblemVariant>() -> Option<serde_json::Value> {
    V::example().map(|example| {
        serde_json::to_value(Occurrence::details(&example))
            .expect("the example of a variant should serialize")
    })
}

#[cfg(feature = "aide")]
const fn no_example() -> Option<serde_json::Value> {
    None
}

/// Checks that no two variants of `P::VARIANTS` share a type URI and status.
///
/// Called in a `const` block of a generic function, it runs when the function is instantiated for
/// `P`.
///
/// # Panics
///
/// Panics if two variants share a type URI and status. In a const context, it fails at compile
/// time.
#[cfg(feature = "aide")]
#[track_caller]
pub(crate) const fn assert_variants<P: Problem>() {
    assert!(
        unique(P::VARIANTS),
        "`VARIANTS` should list every problem type once per status"
    );
}

/// Whether no two `variants` share a type URI and status.
///
/// Within one status, the documented variants are told apart by their type URI alone.
#[cfg(feature = "aide")]
const fn unique(variants: &[Variant]) -> bool {
    let mut rest = variants;
    while let [variant, tail @ ..] = rest {
        if contains(tail, &variant.problem_type) {
            return false;
        }
        rest = tail;
    }
    true
}

/// Whether one of `variants` has the type URI and status of `problem_type`.
pub(crate) const fn contains(variants: &[Variant], problem_type: &ProblemType) -> bool {
    let mut rest = variants;
    while let [candidate, tail @ ..] = rest {
        if candidate.problem_type.status.as_u16() == problem_type.status.as_u16()
            && same(type_uri(&candidate.problem_type), type_uri(problem_type))
        {
            return true;
        }
        rest = tail;
    }
    false
}

const fn type_uri(problem_type: &ProblemType) -> &[u8] {
    match &problem_type.type_uri {
        Cow::Borrowed(type_uri) => type_uri.as_bytes(),
        Cow::Owned(type_uri) => type_uri.as_bytes(),
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

#[cfg(test)]
mod tests {
    use alloc::{borrow::Cow, string::String};
    use std::panic;

    use http::StatusCode;
    use schemars::JsonSchema;
    use serde::Serialize;

    use super::contains;
    #[cfg(feature = "aide")]
    use super::unique;
    use crate::{ProblemType, ProblemVariant, Variant};

    const fn status(code: u16) -> StatusCode {
        match StatusCode::from_u16(code) {
            Ok(status) => status,
            Err(_) => panic!("the test status should be a valid status code"),
        }
    }

    #[derive(Serialize, JsonSchema, derive_more::Display)]
    #[display("web")]
    struct Web<const CODE: u16>;

    impl<const CODE: u16> ProblemVariant for Web<CODE> {
        const TYPE: ProblemType = ProblemType {
            type_uri: Cow::Borrowed("/problems/web"),
            title: Cow::Borrowed("Web"),
            status: status(CODE),
        };
    }

    /// Its type URI starts with the one of [`Web`].
    #[derive(Serialize, JsonSchema, derive_more::Display)]
    #[display("web missing")]
    struct WebMissing<const CODE: u16>;

    impl<const CODE: u16> ProblemVariant for WebMissing<CODE> {
        const TYPE: ProblemType = ProblemType {
            type_uri: Cow::Borrowed("/problems/web/missing"),
            title: Cow::Borrowed("Web missing"),
            status: status(CODE),
        };
    }

    #[test]
    fn contains_type_and_status() {
        let variants = [Variant::of::<Web<404>>()];

        assert!(
            contains(&variants, &Web::<404>::TYPE),
            "the listed problem type should be found"
        );
        assert!(
            contains(
                &variants,
                &ProblemType {
                    type_uri: Cow::Owned(String::from("/problems/web")),
                    title: Cow::Borrowed("Another title"),
                    status: StatusCode::NOT_FOUND,
                }
            ),
            "an owned type URI of the same text should be found, whatever the title"
        );
        assert!(
            !contains(&variants, &Web::<410>::TYPE),
            "the listed type URI at another status should not be found"
        );
        assert!(
            !contains(&variants, &WebMissing::<404>::TYPE),
            "a longer type URI starting with the listed one should not be found"
        );
    }

    #[cfg(feature = "aide")]
    #[test]
    fn unique_type_and_status() {
        assert!(
            unique(&[
                Variant::of::<Web<404>>(),
                Variant::of::<Web<410>>(),
                Variant::of::<WebMissing<404>>(),
            ]),
            "variants should be unique when they differ in type URI or status"
        );
        assert!(
            !unique(&[
                Variant::of::<Web<404>>(),
                Variant::of::<WebMissing<404>>(),
                Variant::of::<Web<404>>(),
            ]),
            "a type URI and status listed twice should not be unique, even apart"
        );
    }

    #[test]
    fn variant_status_range() {
        for (code, of, accepted) in [
            (399, Variant::of::<Web<399>> as fn() -> Variant, false),
            (400, Variant::of::<Web<400>>, true),
            (599, Variant::of::<Web<599>>, true),
            (600, Variant::of::<Web<600>>, false),
        ] {
            assert_eq!(
                panic::catch_unwind(of).is_ok(),
                accepted,
                "a variant at status {code} should be accepted only for a client or server error"
            );
        }
    }
}
