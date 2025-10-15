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
use core::{cmp, fmt, num::IntErrorKind, str::FromStr};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
pub use error::{ParseBaseUrlError, ParseDraftInfoError, ParseVersionedUrlError};
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{Deserialize, Deserializer, Serialize, Serializer, de};
use url::Url;
#[cfg(feature = "utoipa")]
use utoipa::{ToSchema, openapi};
use uuid::Uuid;

use self::error::ParseOntologyTypeVersionError;

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

/// Pre-release version information for an ontology type.
///
/// Represents different pre-release stages following semantic versioning conventions.
/// Currently only draft stages are supported, but this can be extended to include
/// alpha, beta, release candidate stages in the future.
#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord)]
#[cfg_attr(feature = "codegen", derive(specta::Type), specta(export = false))]
pub enum PreRelease {
    /// Draft pre-release with lane identifier and revision number
    Draft {
        /// Lane identifier for isolating parallel draft work
        lane: String,
        /// Monotonic revision number within this lane
        revision: u32,
    },
}

impl FromStr for PreRelease {
    type Err = ParseDraftInfoError;

    fn from_str(draft_info: &str) -> Result<Self, Self::Err> {
        draft_info.rsplit_once('.').map_or(
            Err(ParseDraftInfoError::IncorrectFormatting),
            |(lane, revision)| {
                Ok(Self::Draft {
                    lane: lane.to_owned(),
                    revision: u32::from_str(revision).map_err(|error| {
                        if *error.kind() == IntErrorKind::Empty {
                            ParseDraftInfoError::MissingRevision
                        } else {
                            ParseDraftInfoError::InvalidRevision(
                                revision.to_owned(),
                                error.to_string(),
                            )
                        }
                    })?,
                })
            },
        )
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
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
#[cfg_attr(feature = "codegen", derive(specta::Type), specta(transparent))]
pub struct OntologyTypeVersion {
    // We don't really have a way to inform specta that this type is a string so we fake the type
    // to be a transparent type with only a single string type
    #[cfg_attr(feature = "codegen", specta(type = String))]
    pub major: u32,
    #[cfg_attr(feature = "codegen", specta(skip))]
    pub pre_release: Option<PreRelease>,
}

#[cfg(feature = "utoipa")]
impl ToSchema<'_> for OntologyTypeVersion {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "OntologyTypeVersion",
            openapi::schema::ObjectBuilder::new()
                .schema_type(openapi::SchemaType::String)
                .into(),
        )
    }
}

impl fmt::Display for OntologyTypeVersion {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}", self.major)?;

        if let Some(PreRelease::Draft { lane, revision }) = &self.pre_release {
            write!(fmt, "-draft.{lane}.{revision}")?;
        }

        Ok(())
    }
}

impl FromStr for OntologyTypeVersion {
    type Err = ParseOntologyTypeVersionError;

    fn from_str(ontology_version: &str) -> Result<Self, Self::Err> {
        let (version, draft_info) =
            if let Some((version, draft_info)) = ontology_version.rsplit_once("-draft.") {
                (version, Some(draft_info))
            } else {
                (ontology_version, None)
            };

        Ok(Self {
            major: u32::from_str(version).map_err(|error| {
                if *error.kind() == IntErrorKind::Empty {
                    ParseOntologyTypeVersionError::MissingVersion
                } else {
                    ParseOntologyTypeVersionError::ParseVersion(error.to_string())
                }
            })?,
            pre_release: draft_info
                .map(|draft_info| {
                    draft_info.parse().map_err(|error| {
                        ParseOntologyTypeVersionError::InvalidPreRelease(
                            draft_info.to_owned(),
                            error,
                        )
                    })
                })
                .transpose()?,
        })
    }
}

impl Serialize for OntologyTypeVersion {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.to_string().serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for OntologyTypeVersion {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        <&str>::deserialize(deserializer)?
            .parse()
            .map_err(de::Error::custom)
    }
}

impl Ord for OntologyTypeVersion {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        // First compare major version numbers
        match self.major.cmp(&other.major) {
            cmp::Ordering::Equal => {
                // Per SemVer: published versions have higher precedence than pre-release versions
                // i.e., v/2 > v/2-draft.lane.5
                match (&self.pre_release, &other.pre_release) {
                    (None, None) => cmp::Ordering::Equal,
                    (None, Some(_)) => cmp::Ordering::Greater,
                    (Some(_), None) => cmp::Ordering::Less,
                    (Some(pr1), Some(pr2)) => pr1.cmp(pr2),
                }
            }
            ord @ (cmp::Ordering::Less | cmp::Ordering::Greater) => ord,
        }
    }
}

impl PartialOrd for OntologyTypeVersion {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

#[cfg(feature = "postgres")]
impl ToSql for OntologyTypeVersion {
    postgres_types::accepts!(INT8);

    postgres_types::to_sql_checked!();

    #[expect(clippy::todo, reason = "Draft versions are not yet supported")]
    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        if self.pre_release.is_some() {
            todo!("https://linear.app/hash/issue/BE-161/allow-ids-for-pre-release-type-to-be-stored-in-postgres");
        }
        i64::from(self.major).to_sql(ty, out)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for OntologyTypeVersion {
    postgres_types::accepts!(INT8);

    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self {
            major: i64::from_sql(ty, raw)?.try_into()?,
            pre_release: None,
        })
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
            .extend(["v", &self.version.to_string()]);

        url
    }
}

impl fmt::Display for VersionedUrl {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}v/{}", self.base_url.as_str(), self.version)
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
                if version.is_empty() {
                    return Err(ParseVersionedUrlError::MissingVersion);
                }

                Ok(Self {
                    base_url: BaseUrl::new(base_url.to_owned())
                        .map_err(ParseVersionedUrlError::InvalidBaseUrl)?,
                    version: OntologyTypeVersion::from_str(version).map_err(|error| {
                        ParseVersionedUrlError::InvalidVersion(version.to_owned(), error)
                    })?,
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
        write!(fmt, "{}v/{}", self.base_url, self.version)
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
pub struct OntologyTypeUuid(#[serde(with = "hash_codec::serde::valid_uuid")] Uuid);

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

    #[track_caller]
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
        assert_eq!(
            record_id.version,
            OntologyTypeVersion {
                major: 3,
                pre_release: None
            }
        );

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
            &ParseVersionedUrlError::InvalidVersion(
                "0.2".to_owned(),
                ParseOntologyTypeVersionError::ParseVersion(
                    "invalid digit found in string".to_owned(),
                ),
            ),
        );
        versioned_url_test(
            "http://example.com/v//20",
            &ParseVersionedUrlError::InvalidVersion(
                "/20".to_owned(),
                ParseOntologyTypeVersionError::ParseVersion(
                    "invalid digit found in string".to_owned(),
                ),
            ),
        );
        versioned_url_test(
            "http://example.com/v/30/1",
            &ParseVersionedUrlError::InvalidVersion(
                "30/1".to_owned(),
                ParseOntologyTypeVersionError::ParseVersion(
                    "invalid digit found in string".to_owned(),
                ),
            ),
        );
        versioned_url_test(
            "http://example.com/v/foo",
            &ParseVersionedUrlError::InvalidVersion(
                "foo".to_owned(),
                ParseOntologyTypeVersionError::ParseVersion(
                    "invalid digit found in string".to_owned(),
                ),
            ),
        );
    }

    #[test]
    fn ontology_version_parsing() {
        // Test published versions
        let v1: OntologyTypeVersion = "1".parse().expect("should parse v1");
        assert_eq!(v1.major, 1);
        assert_eq!(v1.pre_release, None);
        assert_eq!(v1.to_string(), "1");

        let v42: OntologyTypeVersion = "42".parse().expect("should parse v42");
        assert_eq!(v42.major, 42);
        assert_eq!(v42.pre_release, None);

        // Test draft versions
        let draft: OntologyTypeVersion = "2-draft.abcd1234.5".parse().expect("should parse draft");
        assert_eq!(draft.major, 2);
        let Some(PreRelease::Draft { lane, revision }) = draft.pre_release.as_ref() else {
            panic!("draft should have pre-release information");
        };
        assert_eq!(lane, "abcd1234");
        assert_eq!(*revision, 5);
        assert_eq!(draft.to_string(), "2-draft.abcd1234.5");
    }

    #[test]
    fn ontology_version_roundtrip() {
        let versions = ["1", "42", "2-draft.lane1234.1", "5-draft.xyz98765.999"];

        for v_str in versions {
            let parsed: OntologyTypeVersion = v_str.parse().expect("should parse");
            assert_eq!(parsed.to_string(), v_str, "roundtrip failed for {v_str}");
        }
    }

    #[test]
    fn ontology_version_ordering_same_major() {
        let published = OntologyTypeVersion {
            major: 2,
            pre_release: None,
        };

        let draft1 = OntologyTypeVersion {
            major: 2,
            pre_release: Some(PreRelease::Draft {
                lane: "aaaa1111".to_owned(),
                revision: 1,
            }),
        };

        let draft2 = OntologyTypeVersion {
            major: 2,
            pre_release: Some(PreRelease::Draft {
                lane: "aaaa1111".to_owned(),
                revision: 2,
            }),
        };

        // Per SemVer: published > draft (same major version)
        assert!(published > draft1, "v/2 should be > v/2-draft");
        assert!(published > draft2, "v/2 should be > v/2-draft");

        // Draft with higher revision > lower revision
        assert!(draft2 > draft1, "draft.2 should be > draft.1");
    }

    #[test]
    fn ontology_version_ordering_different_major() {
        let v1 = OntologyTypeVersion {
            major: 1,
            pre_release: None,
        };

        let v2_draft = OntologyTypeVersion {
            major: 2,
            pre_release: Some(PreRelease::Draft {
                lane: "lane1234".to_owned(),
                revision: 1,
            }),
        };

        let v2 = OntologyTypeVersion {
            major: 2,
            pre_release: None,
        };

        let v3 = OntologyTypeVersion {
            major: 3,
            pre_release: None,
        };

        // Major version takes precedence
        assert!(v1 < v2_draft, "v/1 < v/2-draft");
        assert!(
            v2_draft < v2,
            "v/2-draft < v/2 (same major, published > draft)"
        );
        assert!(v2 < v3, "v/2 < v/3");

        // Transitive
        assert!(v1 < v2, "v/1 < v/2");
        assert!(v1 < v3, "v/1 < v/3");
    }

    #[test]
    fn ontology_version_ordering_different_lanes() {
        let draft_lane_a = OntologyTypeVersion {
            major: 2,
            pre_release: Some(PreRelease::Draft {
                lane: "aaaa1111".to_owned(),
                revision: 5,
            }),
        };

        let draft_lane_b = OntologyTypeVersion {
            major: 2,
            pre_release: Some(PreRelease::Draft {
                lane: "bbbb2222".to_owned(),
                revision: 1,
            }),
        };

        // Lexicographic ordering by lane
        assert!(
            draft_lane_a < draft_lane_b,
            "lane 'aaaa' should be < lane 'bbbb'"
        );
    }

    #[test]
    fn ontology_version_equality() {
        let v1_a = OntologyTypeVersion {
            major: 1,
            pre_release: None,
        };

        let v1_b = OntologyTypeVersion {
            major: 1,
            pre_release: None,
        };

        let draft_a = OntologyTypeVersion {
            major: 2,
            pre_release: Some(PreRelease::Draft {
                lane: "lane1234".to_owned(),
                revision: 5,
            }),
        };

        let draft_b = OntologyTypeVersion {
            major: 2,
            pre_release: Some(PreRelease::Draft {
                lane: "lane1234".to_owned(),
                revision: 5,
            }),
        };

        assert_eq!(v1_a, v1_b);
        assert_eq!(draft_a, draft_b);
        assert_ne!(v1_a, draft_a);
    }

    #[test]
    fn draft_url_parsing() {
        let url_str = "https://example.com/person/v/2-draft.abcd1234.3";
        let parsed = VersionedUrl::from_str(url_str).expect("should parse draft URL");

        assert_eq!(parsed.base_url.as_str(), "https://example.com/person/");
        assert_eq!(parsed.version.major, 2);

        let Some(PreRelease::Draft { lane, revision }) = parsed.version.pre_release.as_ref() else {
            panic!("should have pre-release draft info");
        };
        assert_eq!(lane, "abcd1234");
        assert_eq!(*revision, 3);

        // Roundtrip
        assert_eq!(parsed.to_string(), url_str);
    }
}
