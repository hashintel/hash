#[cfg(feature = "postgres")]
use std::error::Error;
use std::{fmt, num::IntErrorKind, str::FromStr};

pub use error::{ParseBaseUrlError, ParseVersionedUrlError};
#[cfg(feature = "postgres")]
use postgres_types::{private::BytesMut, FromSql, IsNull, ToSql, Type};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;
use url::Url;
#[cfg(feature = "utoipa")]
use utoipa::{openapi, ToSchema};

mod error;
#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(feature = "postgres", derive(ToSql), postgres(transparent))]
#[derive(Clone, PartialEq, Eq, Ord, PartialOrd, Hash)]
pub struct BaseUrl(String);

impl fmt::Debug for BaseUrl {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for BaseUrl {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl BaseUrl {
    /// Creates a new [`BaseUrl`] from a given URL string
    ///
    /// # Errors
    /// - `ParseBaseUrlError` if the given URL string is invalid
    pub fn new(url: String) -> Result<Self, ParseBaseUrlError> {
        Self::validate_str(&url)?;

        Ok(Self(url))
    }

    fn validate_str(url: &str) -> Result<(), ParseBaseUrlError> {
        if url.len() > 2048 {
            return Err(ParseBaseUrlError::TooLong);
        }
        if !url.ends_with('/') {
            return Err(ParseBaseUrlError::MissingTrailingSlash);
        }
        // TODO: Propagate more useful errors
        if Url::parse(url)
            .map_err(|err| ParseBaseUrlError::UrlParseError(err.to_string()))?
            .cannot_be_a_base()
        {
            Err(ParseBaseUrlError::CannotBeABase)
        } else {
            Ok(())
        }
    }

    #[must_use]
    #[expect(
        clippy::missing_panics_doc,
        reason = "The URL is validated on creation"
    )]
    pub fn to_url(&self) -> Url {
        Url::parse(&self.0).expect("invalid Base URL")
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

impl Serialize for BaseUrl {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.to_string().serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for BaseUrl {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Self::new(String::deserialize(deserializer)?).map_err(de::Error::custom)
    }
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for BaseUrl {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "BaseUrl",
            openapi::schema::ObjectBuilder::new()
                .schema_type(openapi::SchemaType::String)
                .format(Some(openapi::SchemaFormat::KnownFormat(
                    openapi::KnownFormat::Uri,
                )))
                .into(),
        )
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for BaseUrl {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::new(String::from_sql(ty, raw)?)?)
    }

    fn accepts(ty: &Type) -> bool {
        <String as FromSql>::accepts(ty)
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct OntologyTypeVersion(u32);

impl OntologyTypeVersion {
    #[must_use]
    pub const fn new(inner: u32) -> Self {
        Self(inner)
    }

    #[must_use]
    pub const fn inner(self) -> u32 {
        self.0
    }
}

#[cfg(feature = "postgres")]
impl ToSql for OntologyTypeVersion {
    postgres_types::accepts!(INT8);

    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        i64::from(self.0).to_sql(ty, out)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for OntologyTypeVersion {
    postgres_types::accepts!(INT8);

    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::new(i64::from_sql(ty, raw)?.try_into()?))
    }
}

// TODO: can we impl Tsify to turn this into a type: template string
//  if we can then we should delete wasm::VersionedUrlPatch
#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd, Hash)]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql))]
pub struct VersionedUrl {
    pub base_url: BaseUrl,
    pub version: OntologyTypeVersion,
}

impl VersionedUrl {
    #[must_use]
    #[expect(
        clippy::missing_panics_doc,
        reason = "The URL is validated on creation"
    )]
    pub fn to_url(&self) -> Url {
        let mut url = self.base_url.to_url();
        url.path_segments_mut()
            .expect("invalid Base URL, we should have caught an invalid base already")
            .extend(["v", &self.version.0.to_string()]);

        url
    }
}

impl fmt::Display for VersionedUrl {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}v/{}", self.base_url.as_str(), self.version.0)
    }
}

impl FromStr for VersionedUrl {
    type Err = ParseVersionedUrlError;

    fn from_str(url: &str) -> Result<Self, ParseVersionedUrlError> {
        if url.len() > 2048 {
            return Err(ParseVersionedUrlError::TooLong);
        }

        url.rsplit_once("v/").map_or(
            Err(ParseVersionedUrlError::IncorrectFormatting),
            |(base_url, version)| {
                Ok(Self {
                    base_url: BaseUrl::new(base_url.to_owned())
                        .map_err(ParseVersionedUrlError::InvalidBaseUrl)?,
                    version: version.parse().map(OntologyTypeVersion).map_err(
                        |error| match error.kind() {
                            IntErrorKind::Empty => ParseVersionedUrlError::MissingVersion,
                            IntErrorKind::InvalidDigit => {
                                let invalid_digit_index =
                                    version.find(|c: char| !c.is_numeric()).unwrap_or(0);

                                if invalid_digit_index == 0 {
                                    ParseVersionedUrlError::InvalidVersion(
                                        version.to_owned(),
                                        error.to_string(),
                                    )
                                } else {
                                    #[expect(
                                        clippy::string_slice,
                                        reason = "we just found the index of the first \
                                                  non-numeric character"
                                    )]
                                    ParseVersionedUrlError::AdditionalEndContent(
                                        version[invalid_digit_index..].to_owned(),
                                    )
                                }
                            }
                            _ => ParseVersionedUrlError::InvalidVersion(
                                version.to_owned(),
                                error.to_string(),
                            ),
                        },
                    )?,
                })
            },
        )
    }
}

impl Serialize for VersionedUrl {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.to_string().serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for VersionedUrl {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        String::deserialize(deserializer)?
            .parse()
            .map_err(de::Error::custom)
    }
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for VersionedUrl {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "VersionedUrl",
            openapi::schema::ObjectBuilder::new()
                .schema_type(openapi::SchemaType::String)
                .format(Some(openapi::SchemaFormat::KnownFormat(
                    openapi::KnownFormat::Uri,
                )))
                .into(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // TODO: add some unit tests for base URL

    #[test]
    fn versioned_url() {
        let input_str = "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1";
        let url = VersionedUrl::from_str(input_str).expect("parsing versioned URL failed");
        assert_eq!(&url.to_string(), input_str);
    }

    fn versioned_url_test(input_str: &str, expected: &ParseVersionedUrlError) {
        assert_eq!(
            VersionedUrl::from_str(input_str).expect_err("able to parse VersionedUrl"),
            *expected
        );
    }

    #[test]
    fn versioned_url_failed() {
        versioned_url_test(
            "example/v/2",
            &ParseVersionedUrlError::InvalidBaseUrl(ParseBaseUrlError::UrlParseError(
                "relative URL without a base".to_owned(),
            )),
        );
        versioned_url_test(
            "http://example.com",
            &ParseVersionedUrlError::IncorrectFormatting,
        );
        versioned_url_test(
            "http://example.com/v/",
            &ParseVersionedUrlError::MissingVersion,
        );
        versioned_url_test(
            "http://example.com/v/0.2",
            &ParseVersionedUrlError::AdditionalEndContent(".2".to_owned()),
        );
        versioned_url_test(
            "http://example.com/v//20",
            &ParseVersionedUrlError::InvalidVersion(
                "/20".to_owned(),
                "invalid digit found in string".to_owned(),
            ),
        );
        versioned_url_test(
            "http://example.com/v/30/1",
            &ParseVersionedUrlError::AdditionalEndContent("/1".to_owned()),
        );
        versioned_url_test(
            "http://example.com/v/foo",
            &ParseVersionedUrlError::InvalidVersion(
                "foo".to_owned(),
                "invalid digit found in string".to_owned(),
            ),
        );
    }
}
