//! Header parameters whose rejection is a problem details response.

use alloc::borrow::Cow;
use core::{error::Error, fmt, future, slice};

use aide::{
    OperationInput, OperationOutput as _,
    generate::GenContext,
    openapi::Operation,
    operation::{ParamLocation, add_parameters, parameters_from_schema},
};
use axum::extract::FromRequestParts;
use hash_middleware::problem::InternalServerError;
use http::{HeaderMap, HeaderName, HeaderValue, StatusCode, request::Parts};
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{self, DeserializeOwned, DeserializeSeed, IntoDeserializer as _, MapAccess, Visitor},
    forward_to_deserialize_any,
};

use super::MessagePart;

const BAD_REQUEST: ProblemType = ProblemType {
    type_uri: Cow::Borrowed("about:blank"),
    title: Cow::Borrowed("Bad Request"),
    status: StatusCode::BAD_REQUEST,
};

/// A required header is missing.
#[derive(Serialize, JsonSchema)]
struct MissingHeader {
    #[serde(skip)]
    detail: String,
}

impl fmt::Display for MissingHeader {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(&self.detail)
    }
}

impl ProblemVariant for MissingHeader {
    const TYPE: ProblemType = BAD_REQUEST;

    fn example() -> Option<Self> {
        Some(Self {
            detail: HeaderError::Missing { name: "limit" }.to_string(),
        })
    }
}

/// A header occurs more than once.
#[derive(Serialize, JsonSchema)]
struct RepeatedHeader {
    #[serde(skip)]
    detail: String,
}

impl fmt::Display for RepeatedHeader {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(&self.detail)
    }
}

impl ProblemVariant for RepeatedHeader {
    const TYPE: ProblemType = BAD_REQUEST;

    fn example() -> Option<Self> {
        Some(Self {
            detail: HeaderError::Repeated { name: "limit" }.to_string(),
        })
    }
}

/// A header does not match its documented schema.
#[derive(Serialize, JsonSchema)]
struct MalformedHeader {
    #[serde(skip)]
    detail: String,
}

impl fmt::Display for MalformedHeader {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(&self.detail)
    }
}

impl ProblemVariant for MalformedHeader {
    const TYPE: ProblemType = BAD_REQUEST;

    fn example() -> Option<Self> {
        #[derive(Deserialize)]
        struct Limit {
            #[expect(dead_code, reason = "only the error of reading it is used")]
            limit: u8,
        }

        let headers = HeaderMap::from_iter([(
            HeaderName::from_static("limit"),
            HeaderValue::from_static("many"),
        )]);
        Limit::deserialize(Headers(&headers))
            .err()
            .map(|error| Self {
                detail: error.to_string(),
            })
    }
}

/// The ways [`Header`] rejects a request.
pub(in crate::rest) struct HeaderProblem;

impl Problem for HeaderProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<MissingHeader>(),
        Variant::of::<RepeatedHeader>(),
        Variant::of::<MalformedHeader>(),
        Variant::of::<InternalServerError>(),
    ];
}

/// The reason [`Header`] could not read its parameters from a request.
#[derive(Debug)]
enum HeaderError {
    /// The request lacks a header that the parameters require.
    Missing { name: &'static str },
    /// A header occurs more than once in the request.
    Repeated { name: &'static str },
    /// The value of a header is not text, or does not parse as the type of its field.
    Malformed { name: &'static str, reason: String },
    /// A field refuses a value for a reason of its own, such as a range it checks.
    Invalid(String),
    /// The handler reads the headers into something other than a struct of single values.
    Unsupported,
}

impl fmt::Display for HeaderError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { name } => write!(fmt, "Missing header `{name}`"),
            Self::Repeated { name } => write!(fmt, "Header `{name}` occurs more than once"),
            Self::Malformed { name, reason } => {
                write!(fmt, "Failed to deserialize header `{name}`: {reason}")
            }
            Self::Invalid(reason) => fmt.write_str(reason),
            Self::Unsupported => {
                fmt.write_str("header parameters are read into a struct of single values")
            }
        }
    }
}

impl Error for HeaderError {}

impl de::Error for HeaderError {
    fn custom<T>(msg: T) -> Self
    where
        T: fmt::Display,
    {
        Self::Invalid(msg.to_string())
    }

    fn missing_field(field: &'static str) -> Self {
        Self::Missing { name: field }
    }
}

impl Expose<HeaderProblem> for HeaderError {
    fn expose(&self) -> Answer<'_, HeaderProblem> {
        let detail = self.to_string();
        match self {
            Self::Missing { .. } => Answer::new(MissingHeader { detail }),
            Self::Repeated { .. } => Answer::new(RepeatedHeader { detail }),
            Self::Malformed { .. } | Self::Invalid(_) => Answer::new(MalformedHeader { detail }),
            // The handler and the extractor disagree, which the client cannot fix.
            Self::Unsupported => Answer::new(InternalServerError),
        }
    }
}

/// The headers of a request, read as the fields of a struct.
struct Headers<'request>(&'request HeaderMap);

impl<'de> Deserializer<'de> for Headers<'de> {
    type Error = HeaderError;

    forward_to_deserialize_any! {
        bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 char str string bytes byte_buf option
        unit unit_struct newtype_struct seq tuple tuple_struct map enum identifier ignored_any
    }

    // Only a struct names the headers to read. Every other shape asks for all headers of the
    // request, including those that no handler names.
    fn deserialize_any<V>(self, _visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>,
    {
        Err(HeaderError::Unsupported)
    }

    fn deserialize_struct<V>(
        self,
        _name: &'static str,
        fields: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>,
    {
        visitor.visit_map(Fields {
            headers: self.0,
            names: fields.iter(),
            current: None,
        })
    }
}

/// The fields of a struct, each read from the header of the same name.
struct Fields<'request> {
    headers: &'request HeaderMap,
    names: slice::Iter<'static, &'static str>,
    current: Option<(&'static str, &'request HeaderValue)>,
}

impl<'de> MapAccess<'de> for Fields<'de> {
    type Error = HeaderError;

    fn next_key_seed<K>(&mut self, seed: K) -> Result<Option<K::Value>, Self::Error>
    where
        K: DeserializeSeed<'de>,
    {
        for &name in &mut self.names {
            let mut values = self.headers.get_all(name).iter();

            // Ignore fields that are not present in the header, so that serde can use the default
            // value
            let Some(value) = values.next() else {
                continue;
            };

            if values.next().is_some() {
                return Err(HeaderError::Repeated { name });
            }

            self.current = Some((name, value));
            return seed.deserialize(name.into_deserializer()).map(Some);
        }

        Ok(None)
    }

    fn next_value_seed<V>(&mut self, seed: V) -> Result<V::Value, Self::Error>
    where
        V: DeserializeSeed<'de>,
    {
        let (name, value) = self.current.take().ok_or(HeaderError::Unsupported)?;

        let text = value.to_str().map_err(|error| HeaderError::Malformed {
            name,
            reason: error.to_string(),
        })?;

        seed.deserialize(serde_plain::Deserializer::new(text))
            .map_err(|error| match error {
                serde_plain::Error::ImpossibleDeserialization(_) => HeaderError::Unsupported,
                serde_plain::Error::ImpossibleSerialization(_)
                | serde_plain::Error::Parse(..)
                | serde_plain::Error::Message(_) => HeaderError::Malformed {
                    name,
                    reason: error.to_string(),
                },
            })
    }
}

/// Header parameters whose rejection is a problem details response.
///
/// `T` is a struct with one field per header, named like the header. A name matches without regard
/// to case. Each field holds a single value, read from the text of the header: [`openapi::build`]
/// panics for an operation with any other header parameter. A header that occurs more than once is
/// rejected. `T` cannot flatten a struct into itself: serde then asks for every header of the
/// request instead of naming the ones it reads.
///
/// [`openapi::build`]: crate::rest::openapi::build
pub(in crate::rest) struct Header<T>(pub T);

impl<T, S> FromRequestParts<S> for Header<T>
where
    T: DeserializeOwned + Send,
    S: Send + Sync,
{
    type Rejection = Rejection<HeaderProblem>;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        future::ready(
            T::deserialize(Headers(&parts.headers))
                .map(Self)
                .map_err(Rejection::from),
        )
    }
}

impl<T> OperationInput for Header<T>
where
    T: JsonSchema,
{
    fn operation_input(ctx: &mut GenContext, operation: &mut Operation) {
        let schema = ctx.schema.subschema_for::<T>();
        let parameters = parameters_from_schema(ctx, schema, ParamLocation::Header);

        add_parameters(ctx, operation, parameters);

        // Documents the variants on the operation itself and infers no responses.
        Rejection::<HeaderProblem>::inferred_responses(ctx, operation);
        MessagePart::HeaderParameters.mark(operation);
    }
}
