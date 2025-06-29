//! URL types for the Block Protocol Type System.
//!
//! This module defines structured URL types used throughout the Block Protocol Type System for
//! uniquely identifying types within the ecosystem. It provides:
//!
//! - [`BaseUrl`]: Foundation of type identity representing a base location without versioning
//! - [`VersionedUrl`]: Complete type identifier combining a base URL with version information
//! - [`OntologyTypeVersion`]: Strongly-typed wrapper for version numbers
//! - [`OntologyTypeRecordId`]: Structured representation of an ontology type identifier
//!
//! These types enforce format validation and provide integration with serialization frameworks
//! and database systems (when appropriate feature flags are enabled).
//!
//! # Examples
//!
//! ```
//! use std::str::FromStr;
//!
//! use type_system::ontology::{BaseUrl, VersionedUrl};
//!
//! // Create a base URL
//! let base = BaseUrl::new("https://example.com/types/data-type/text/".to_owned())
//!     .expect("should create a valid BaseUrl");
//!
//! // Parse a versioned URL
//! let versioned = VersionedUrl::from_str("https://example.com/types/data-type/text/v/1")
//!     .expect("should parse a valid VersionedUrl");
//! assert_eq!(
//!     versioned.to_string(),
//!     "https://example.com/types/data-type/text/v/1"
//! );
//! ```

#[cfg(feature = "postgres")]
use core::error::Error;
use core::{fmt, num::IntErrorKind, str::FromStr};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
pub use error::{ParseBaseUrlError, ParseVersionedUrlError};
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{Deserialize, Deserializer, Serialize, Serializer, de};
use url::Url;
#[cfg(feature = "utoipa")]
use utoipa::{ToSchema, openapi};
use uuid::Uuid;

mod error;
// #[cfg(target_arch = "wasm32")]
// mod wasm;

/// A base URL representing the unversioned part of an ontology type identifier.
///
/// Base URLs serve as the foundation for type identification in the Block Protocol Type System.
/// Each valid [`BaseUrl`] must:
///
/// - Be a syntactically valid URL
/// - End with a trailing slash character ('/')
/// - Not exceed 2048 characters in length
/// - Be usable as a base URL (cannot be a relative URL)
///
/// # Examples
///
/// ```
/// use type_system::ontology::BaseUrl;
///
/// let base_url = BaseUrl::new("https://example.com/types/data-type/text/".to_owned())
///     .expect("should create a valid BaseUrl");
/// assert_eq!(
///     base_url.as_str(),
///     "https://example.com/types/data-type/text/"
/// );
/// ```
///
/// # Errors
///
/// - [`TooLong`] if the URL exceeds 2048 characters
/// - [`MissingTrailingSlash`] if the URL doesn't end with '/'
/// - [`UrlParseError`] if the URL is not a valid URL
/// - [`CannotBeABase`] if the URL cannot be used as a base URL
///
/// [`TooLong`]: ParseBaseUrlError::TooLong
/// [`MissingTrailingSlash`]: ParseBaseUrlError::MissingTrailingSlash
/// [`UrlParseError`]: ParseBaseUrlError::UrlParseError
/// [`CannotBeABase`]: ParseBaseUrlError::CannotBeABase
#[derive(Clone, PartialEq, Eq, Ord, PartialOrd, Hash)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "postgres", derive(ToSql), postgres(transparent))]
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

impl From<BaseUrl> for String {
    fn from(base_url: BaseUrl) -> Self {
        base_url.0
    }
}

impl BaseUrl {
    /// Creates a new [`BaseUrl`] from a given URL string
    ///
    /// # Errors
    ///
    /// Returns a [`ParseBaseUrlError`] if the given URL string is invalid:
    ///
    /// - [`TooLong`] if the URL exceeds 2048 characters
    /// - [`MissingTrailingSlash`] if the URL doesn't end with '/'
    /// - [`UrlParseError`] if the URL is not syntactically valid
    /// - [`CannotBeABase`] if the URL cannot be used as a base URL
    ///
    /// [`TooLong`]: ParseBaseUrlError::TooLong
    /// [`MissingTrailingSlash`]: ParseBaseUrlError::MissingTrailingSlash
    /// [`UrlParseError`]: ParseBaseUrlError::UrlParseError
    /// [`CannotBeABase`]: ParseBaseUrlError::CannotBeABase
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
        // Parse the URL, propagating specific error information
        let parsed_url =
            Url::parse(url).map_err(|err| ParseBaseUrlError::UrlParseError(err.to_string()))?;

        // Check if the URL can be used as a base URL
        if parsed_url.cannot_be_a_base() {
            Err(ParseBaseUrlError::CannotBeABase)
        } else {
            Ok(())
        }
    }

    /// Converts this [`BaseUrl`] to a standard [`Url`] instance.
    ///
    /// This method parses the underlying string into a full [`Url`] object that can be used
    /// with HTTP libraries and other URL operations. Since the URL was validated during
    /// construction, this conversion is guaranteed to succeed.
    #[must_use]
    #[expect(
        clippy::missing_panics_doc,
        reason = "The URL is validated on creation"
    )]
    pub fn to_url(&self) -> Url {
        Url::parse(&self.0).expect("invalid Base URL")
    }

    /// Returns a string slice of the underlying URL.
    ///
    /// This method provides direct access to the base URL string without allocating
    /// a new String. The returned string is guaranteed to be a valid URL ending with
    /// a trailing slash.
    #[must_use]
    pub const fn as_str(&self) -> &str {
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

/// A strongly-typed wrapper for ontology type version numbers.
///
/// [`OntologyTypeVersion`] represents the version number component of a [`VersionedUrl`].
/// It ensures that version numbers are always valid unsigned integers and provides
/// type safety throughout the system.
///
/// # Examples
///
/// ```
/// use type_system::ontology::id::OntologyTypeVersion;
///
/// let version = OntologyTypeVersion::new(1);
/// assert_eq!(version.inner(), 1);
/// ```
#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema), schema(value_type = String))]
#[repr(transparent)]
pub struct OntologyTypeVersion(
    // We aim to replace the simple `u32` with a more complex type in the future.
    // For now, we use `u32` to represent the version number. but we export it as an
    // `Opaque` type to ensure that it is not used directly in TypeScript.
    #[cfg_attr(feature = "codegen", specta(type = String))] u32,
);

impl Serialize for OntologyTypeVersion {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.0.to_string().serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for OntologyTypeVersion {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        <&str>::deserialize(deserializer)?
            .parse()
            .map(Self::new)
            .map_err(de::Error::custom)
    }
}

impl OntologyTypeVersion {
    /// Creates a new version identifier with the specified value.
    ///
    /// This constructor creates a strongly-typed version number wrapper that provides
    /// type safety when working with ontology type versions.
    #[must_use]
    pub const fn new(inner: u32) -> Self {
        Self(inner)
    }

    /// Returns the underlying version number.
    ///
    /// This method extracts the raw version number from the wrapper type for when
    /// the numeric value is needed directly.
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
/// A versioned URL that uniquely identifies a specific version of an ontology type.
///
/// [`VersionedUrl`] combines a [`BaseUrl`] with a version number ([`OntologyTypeVersion`])
/// to create a complete identifier for a specific version of a type in the Block Protocol
/// Type System. These URLs are used to reference data types, property types, and entity
/// types throughout the system.
///
/// # Format
///
/// A [`VersionedUrl`] follows the pattern: `{base_url}v/{version}` where:
/// - `{base_url}` is a valid [`BaseUrl`] ending with a trailing slash
/// - `{version}` is a positive integer version number
///
/// Example: `https://example.com/types/data-type/text/v/1`
///
/// # Examples
///
/// ```
/// use std::str::FromStr;
///
/// use type_system::ontology::id::{ParseVersionedUrlError, VersionedUrl};
///
/// let url = VersionedUrl::from_str("https://example.com/types/data-type/text/v/1")?;
/// assert_eq!(
///     url.to_string(),
///     "https://example.com/types/data-type/text/v/1"
/// );
/// # Ok::<(), ParseVersionedUrlError>(())
/// ```
///
/// # Errors
///
/// The [`FromStr`] implementation returns [`ParseVersionedUrlError`] when:
///
/// - [`TooLong`] if the URL exceeds 2048 characters
/// - [`IncorrectFormatting`] if the URL doesn't follow the required pattern
/// - [`MissingVersion`] if no version number is provided after "v/"
/// - [`InvalidVersion`] if the version is not a valid integer
/// - [`AdditionalEndContent`] if there's content after the version number
/// - [`InvalidBaseUrl`] if the base URL part is invalid
///
/// [`TooLong`]: ParseVersionedUrlError::TooLong
/// [`IncorrectFormatting`]: ParseVersionedUrlError::IncorrectFormatting
/// [`MissingVersion`]: ParseVersionedUrlError::MissingVersion
/// [`InvalidVersion`]: ParseVersionedUrlError::InvalidVersion
/// [`AdditionalEndContent`]: ParseVersionedUrlError::AdditionalEndContent
/// [`InvalidBaseUrl`]: ParseVersionedUrlError::InvalidBaseUrl
#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd, Hash)]
#[cfg_attr(feature = "codegen", derive(specta::Type), specta(export = false))]
pub struct VersionedUrl {
    /// The base URL component representing the unversioned part of the type identifier
    pub base_url: BaseUrl,

    /// The version number component specifying the exact version of the type
    pub version: OntologyTypeVersion,
}

#[cfg(target_arch = "wasm32")]
mod patch {
    #[derive(tsify_next::Tsify)]
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
    struct VersionedUrl(#[tsify(type = "`${string}v/${string}`")] String);
}

impl VersionedUrl {
    /// Converts this [`VersionedUrl`] to a standard [`Url`] instance.
    ///
    /// This method constructs a valid [`Url`] by combining the base URL and version
    /// components into a complete URL object that can be used with HTTP libraries.
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
                                    version.find(|ch: char| !ch.is_numeric()).unwrap_or(0);

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
                            IntErrorKind::PosOverflow
                            | IntErrorKind::NegOverflow
                            | IntErrorKind::Zero
                            | _ => ParseVersionedUrlError::InvalidVersion(
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

#[cfg(feature = "postgres")]
impl ToSql for VersionedUrl {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        self.to_string().to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <String as ToSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for VersionedUrl {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::from_str(&<String as FromSql>::from_sql(ty, raw)?)?)
    }

    fn accepts(ty: &Type) -> bool {
        <String as FromSql>::accepts(ty)
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

/// An identifier for an ontology type record consisting of a base URL and version.
///
/// This type provides a structured representation of an ontology type identifier
/// that can be used in database records and type definitions. It contains the same
/// components as a [`VersionedUrl`] but in a structured form rather than a string.
///
/// # Examples
///
/// ```
/// use std::str::FromStr;
///
/// use type_system::ontology::id::{
///     BaseUrl, OntologyTypeRecordId, OntologyTypeVersion, VersionedUrl,
/// };
///
/// // Create from individual components
/// let base_url = BaseUrl::new("https://example.com/types/data-type/text/".to_owned())?;
/// let version = OntologyTypeVersion::new(1);
/// let record_id = OntologyTypeRecordId { base_url, version };
///
/// // Convert between VersionedUrl and OntologyTypeRecordId
/// let url = VersionedUrl::from_str("https://example.com/types/data-type/text/v/1")?;
/// let record_id = OntologyTypeRecordId::from(url.clone());
/// let url2 = VersionedUrl::from(record_id);
/// assert_eq!(url, url2);
/// # Ok::<(), Box<dyn core::error::Error>>(())
/// ```
#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeRecordId {
    /// The base URL component representing the unversioned part of the type identifier
    pub base_url: BaseUrl,

    /// The version number component specifying the exact version of the type
    pub version: OntologyTypeVersion,
}

impl fmt::Display for OntologyTypeRecordId {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}v/{}", self.base_url, self.version.inner())
    }
}

impl From<VersionedUrl> for OntologyTypeRecordId {
    fn from(versioned_url: VersionedUrl) -> Self {
        Self {
            base_url: versioned_url.base_url,
            version: versioned_url.version,
        }
    }
}

impl From<OntologyTypeRecordId> for VersionedUrl {
    fn from(record_id: OntologyTypeRecordId) -> Self {
        Self {
            base_url: record_id.base_url,
            version: record_id.version,
        }
    }
}

/// A unique identifier for an ontology record generated from a [`VersionedUrl`].
///
/// In some contexts it's not known to which schema an ontology record belongs, so this
/// identifier is used to reference the record without knowing its type. When appropriate,
/// this identifier can be converted to a more specific identifier type.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::FromSql, postgres_types::ToSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct OntologyTypeUuid(Uuid);

impl OntologyTypeUuid {
    /// Creates a new instance of the identifier type from a [`VersionedUrl`].
    #[must_use]
    pub fn from_url(url: &VersionedUrl) -> Self {
        Self(Uuid::new_v5(
            &Uuid::NAMESPACE_URL,
            url.to_string().as_bytes(),
        ))
    }

    /// Returns a reference to the inner [`Uuid`].
    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    /// Returns a copy of the inner [`Uuid`].
    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_url_valid() {
        // Test valid base URLs
        let valid_urls = [
            "https://blockprotocol.org/@blockprotocol/types/data-type/list/",
            "https://example.com/types/",
            "https://subdomain.example.org/path/to/resources/",
        ];

        for url_str in valid_urls {
            let result = BaseUrl::new(url_str.to_owned());
            assert!(result.is_ok(), "URL '{url_str}' should be valid");

            let base_url = result.expect("should create a valid BaseUrl");
            assert_eq!(base_url.as_str(), url_str);
            assert_eq!(base_url.to_string(), url_str);
        }
    }

    #[test]
    fn base_url_invalid() {
        // Test URLs without trailing slash
        let result = BaseUrl::new("https://example.com/types".to_owned());
        assert!(matches!(
            result,
            Err(ParseBaseUrlError::MissingTrailingSlash)
        ));

        // Test non-URL strings
        let result = BaseUrl::new("not-a-url/".to_owned());
        assert!(matches!(result, Err(ParseBaseUrlError::UrlParseError(_))));

        // Test URLs that are too long (> 2048 chars)
        let long_url = format!("https://example.com/{}long/", "a".repeat(2030));
        let result = BaseUrl::new(long_url);
        assert!(matches!(result, Err(ParseBaseUrlError::TooLong)));
    }

    #[test]
    fn base_url_serialization() {
        // Test serialization and deserialization
        let url_str = "https://example.com/types/";
        let base_url = BaseUrl::new(url_str.to_owned()).expect("should create a valid BaseUrl");

        let serialized = serde_json::to_string(&base_url).expect("should serialize to JSON");
        let expected = format!("\"{url_str}\"");
        assert_eq!(serialized, expected);

        let deserialized: BaseUrl =
            serde_json::from_str(&serialized).expect("should deserialize from JSON");
        assert_eq!(deserialized.as_str(), url_str);
    }

    #[test]
    fn versioned_url() {
        let input_str = "https://blockprotocol.org/@blockprotocol/types/data-type/list/v/1";
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
    fn ontology_type_record_id() {
        let url_str = "https://example.com/types/data-type/text/v/3";
        let url = VersionedUrl::from_str(url_str).expect("parsing versioned URL failed");
        let record_id = OntologyTypeRecordId::from(url.clone());

        // Check fields
        assert_eq!(
            record_id.base_url.as_str(),
            "https://example.com/types/data-type/text/"
        );
        assert_eq!(record_id.version.inner(), 3);

        // Check round-trip conversion
        let converted_url = VersionedUrl::from(record_id);
        assert_eq!(converted_url, url);
        assert_eq!(converted_url.to_string(), url_str);
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
