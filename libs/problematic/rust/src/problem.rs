use alloc::{borrow::Cow, string::ToString as _};
use core::fmt::Display;

use http::HeaderMap;
use schemars::JsonSchema;
#[cfg(feature = "aide")]
use schemars::{Schema, SchemaGenerator};
use serde_core::Serialize;

use crate::{ProblemDetails, ProblemType};

/// A set of public failures, each a [`ProblemVariant`].
pub trait Problem {
    const VARIANTS: &'static [Variant];
}

/// One public failure: its `Display` is the `detail`, its serialized fields are the extension
/// members.
///
/// Every occurrence carries the type URI, title and status of [`TYPE`](Self::TYPE).
pub trait ProblemVariant: Display + Serialize + JsonSchema + Sized {
    const TYPE: ProblemType;

    /// The response headers documented for this variant.
    ///
    /// [`headers`](Self::headers) has to add exactly these, by name. Debug builds panic otherwise.
    const HEADERS: &'static [Header] = &[];

    /// Adds the response headers of this occurrence.
    fn headers(&self, _headers: &mut HeaderMap) {}

    /// The occurrence documented as the example of this variant.
    ///
    /// Without one, a variant without extension members is documented with its bare problem
    /// type, and a variant with members has no example.
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
            .detail(self.to_string())
            .extensions(self)
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

/// A response header in the documentation of a variant.
#[derive(Debug)]
pub struct Header {
    name: &'static str,
    #[cfg(feature = "aide")]
    description: &'static str,
    #[cfg(feature = "aide")]
    schema: fn(&mut SchemaGenerator) -> Schema,
}

impl Header {
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
    /// The documentation of `V`.
    ///
    /// # Panics
    ///
    /// Panics if the status of `V` is not a client or server error status. In a constant such as
    /// `VARIANTS`, it fails at compile time:
    ///
    /// ```compile_fail,E0080
    /// # use std::{borrow::Cow, fmt};
    /// use problematic::{ProblemType, ProblemVariant, StatusCode, Variant};
    ///
    /// #[derive(serde::Serialize, schemars::JsonSchema)]
    /// struct WebMoved;
    /// # impl fmt::Display for WebMoved {
    /// #     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    /// #         formatter.write_str("The web moved.")
    /// #     }
    /// # }
    ///
    /// impl ProblemVariant for WebMoved {
    ///     const TYPE: ProblemType = ProblemType {
    ///         type_uri: Cow::Borrowed("/problems/web/moved"),
    ///         title: Cow::Borrowed("Web moved"),
    ///         status: StatusCode::PERMANENT_REDIRECT,
    ///     };
    /// }
    ///
    /// const VARIANTS: &[Variant] = &[Variant::of::<WebMoved>()];
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

    /// A variant of `problem_type` with the extension schema of `E`, and no headers or example.
    #[cfg(all(feature = "aide", feature = "axum"))]
    pub(crate) const fn bare<E: JsonSchema>(problem_type: ProblemType) -> Self {
        Self {
            problem_type,
            extensions: E::json_schema,
            headers: &[],
            example: no_example,
        }
    }

    /// The rendered example occurrence, if the variant has one.
    #[cfg(feature = "aide")]
    pub(crate) fn example(&self) -> Option<serde_json::Value> {
        (self.example)()
    }

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

#[cfg(all(feature = "aide", feature = "axum"))]
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

    use schemars::JsonSchema;
    use serde::Serialize;

    use super::contains;
    #[cfg(feature = "aide")]
    use super::unique;
    use crate::{ProblemType, ProblemVariant, StatusCode, Variant};

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
