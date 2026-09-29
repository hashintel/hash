use alloc::string::ToString as _;
use core::fmt::Display;

use http::HeaderMap;
use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde_core::Serialize;

use crate::{ProblemDetails, ProblemType};

/// The errors a client can receive from one endpoint.
///
/// Define one per endpoint, or per group of endpoints with the same errors, and list its
/// variants in [`VARIANTS`](Self::VARIANTS). [`Expose`], [`Answer`] and [`Rejection`] are
/// parameterized by it: your error type implements `Expose<K>` to map its errors to the variants
/// of `K`, an `Answer<K>` carries one of them, and a handler returns a `Rejection<K>`. With the
/// `aide` feature, a handler returning `Rejection<K>` documents these variants.
///
/// It identifies its variants by their problem type: type URI, title and status.
/// [`Answer::new`](crate::Answer::new) accepts any variant with a listed problem type. The
/// documentation describes only the listed variants, so another variant with a listed problem
/// type but other fields or another description answers with an undocumented response.
///
/// [`Expose`]: crate::Expose
/// [`Answer`]: crate::Answer
/// [`Rejection`]: crate::Rejection
pub trait Problem {
    /// The variants a client can receive, each listed with [`Variant::of`], including one for the
    /// errors that stay internal.
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
    /// The [`type`](ProblemDetails::type_uri), [`title`](ProblemDetails::title) and
    /// [`status`](ProblemDetails::status) of every response for this error, with a client or
    /// server error status.
    const TYPE: ProblemType;

    /// The response headers [`headers`](Self::headers) adds, as the documentation lists them.
    ///
    /// Debug builds panic if [`headers`](Self::headers) adds a header this list lacks, or leaves
    /// out one it lists.
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
    }
}

/// A response header of a [`ProblemVariant`], as its [`HEADERS`](ProblemVariant::HEADERS) list it
/// for the documentation.
#[derive(Debug)]
pub struct Header {
    name: &'static str,
    description: &'static str,
    schema: fn(&mut SchemaGenerator) -> Schema,
}

#[cfg_attr(
    not(feature = "aide"),
    expect(
        dead_code,
        reason = "only the OpenAPI documentation reads the description and the schema"
    )
)]
impl Header {
    /// The header `name`, documented with `description` and the schema of its value `T`.
    ///
    /// # Panics
    ///
    /// Panics if `name` is not a valid header name. In a constant such as `HEADERS`, it fails at
    /// compile time:
    ///
    /// ```compile_fail,E0080
    /// use problematic::Header;
    ///
    /// // Fails to compile: a header name has no spaces.
    /// const RETRY_AFTER: Header =
    ///     Header::new::<u64>("Retry After", "Seconds before retrying the request.");
    /// ```
    #[must_use]
    pub const fn new<T: JsonSchema>(name: &'static str, description: &'static str) -> Self {
        assert!(
            is_token(name),
            "a header name should be a token of letters, digits and `!#$%&'*+-.^_`|~`"
        );

        Self {
            name,
            description,
            schema: T::json_schema,
        }
    }

    pub(crate) const fn name(&self) -> &'static str {
        self.name
    }

    pub(crate) const fn description(&self) -> &'static str {
        self.description
    }

    pub(crate) fn schema(&self, generator: &mut SchemaGenerator) -> Schema {
        (self.schema)(generator)
    }
}

/// One error an endpoint can answer with, as its [`Problem`] lists it through [`Variant::of`].
#[derive(Debug)]
pub struct Variant {
    problem_type: ProblemType,
    extensions: fn(&mut SchemaGenerator) -> Schema,
    headers: &'static [Header],
    example: fn() -> Option<serde_json::Value>,
}

#[cfg_attr(
    not(feature = "aide"),
    expect(
        dead_code,
        reason = "only the OpenAPI documentation reads the extension members, the headers and the \
                  example"
    )
)]
impl Variant {
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
            extensions: V::json_schema,
            headers: V::HEADERS,
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
    pub(crate) fn example(&self) -> Option<serde_json::Value> {
        (self.example)()
    }

    /// The problem type of the listed variant.
    #[must_use]
    pub const fn problem_type(&self) -> &ProblemType {
        &self.problem_type
    }

    pub(crate) fn extensions(&self, generator: &mut SchemaGenerator) -> Schema {
        (self.extensions)(generator)
    }

    pub(crate) const fn headers(&self) -> &'static [Header] {
        self.headers
    }
}

fn example_of<V: ProblemVariant>() -> Option<serde_json::Value> {
    V::example().map(|example| {
        serde_json::to_value(Occurrence::details(&example))
            .expect("the example of a variant should serialize")
    })
}

/// Whether one of `variants` has `problem_type`.
pub(crate) const fn contains(variants: &[Variant], problem_type: &ProblemType) -> bool {
    let mut rest = variants;
    while let [candidate, tail @ ..] = rest {
        if candidate.problem_type == *problem_type {
            return true;
        }
        rest = tail;
    }
    false
}

/// Whether `name` is a token ([RFC 9110, section 5.6.2]), the syntax of a header name.
///
/// [RFC 9110, section 5.6.2]: https://www.rfc-editor.org/rfc/rfc9110#section-5.6.2
const fn is_token(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    let mut index = 0;
    while index < bytes.len() {
        let byte = bytes[index];
        if !(byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'!' | b'#'
                    | b'$'
                    | b'%'
                    | b'&'
                    | b'\''
                    | b'*'
                    | b'+'
                    | b'-'
                    | b'.'
                    | b'^'
                    | b'_'
                    | b'`'
                    | b'|'
                    | b'~'
            ))
        {
            return false;
        }
        index += 1;
    }
    true
}

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;
    use std::panic;

    use http::StatusCode;
    use schemars::JsonSchema;
    use serde::Serialize;

    use super::contains;
    use crate::{Header, ProblemType, ProblemVariant, Variant};

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
    fn contains_problem_type() {
        let variants = [Variant::of::<WebMissing<404>>(), Variant::of::<Web<404>>()];

        assert!(
            contains(&variants, &Web::<404>::TYPE),
            "a problem type listed after another one should be found"
        );
        assert!(
            !contains(&variants, &Web::<410>::TYPE),
            "a problem type listed at another status only should not be found"
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

    #[test]
    fn header_name_token() {
        for (name, accepted) in [
            ("Retry-After", true),
            ("X-Limit_Reset.At~", true),
            ("Retry After", false),
            ("Retry:After", false),
            ("", false),
        ] {
            assert_eq!(
                panic::catch_unwind(|| Header::new::<u64>(name, "")).is_ok(),
                accepted,
                "the header name `{name}` should be accepted only as a token"
            );
        }
    }
}
