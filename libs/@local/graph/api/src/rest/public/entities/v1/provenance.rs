//! Where the data of an entity edition comes from, and how it reached HASH.
//!
//! Requests and responses share the types of sources. Their limits apply when a request is read;
//! a response shows stored data as it is.

use alloc::borrow::Cow;
use core::error::Error;
use std::collections::HashSet;

use http::{HeaderMap, header::USER_AGENT};
use schemars::{JsonSchema, Schema, SchemaGenerator, json_schema};
use serde::{Deserialize, Serialize, Serializer};
use time::OffsetDateTime;
use type_system::{
    knowledge::entity::{EntityId, provenance::ProvidedEntityEditionProvenance},
    principal::actor::ActorType,
    provenance::{self as stored, SourceType},
};
use url::Url;

use super::entity::LiveEntityId;
use crate::rest::public::present::present;

/// The most characters a request may give a name, a version or an author.
const SHORT_TEXT: usize = 255;

/// The most characters a request may give a URI or a description.
const LONG_TEXT: usize = 4095;

/// The most sources a request may give an edition or a property.
const MAX_SOURCES: usize = 127;

/// The text is longer than allowed.
#[derive(Debug, derive_more::Display)]
#[display("the text has {length} characters, but at most {max} are allowed")]
pub(super) struct TextTooLong {
    length: usize,
    max: usize,
}

impl Error for TextTooLong {}

/// Checks that `text` has at most `max` characters.
fn check_length(text: &str, max: usize) -> Result<(), TextTooLong> {
    let length = text.chars().count();
    if length > max {
        return Err(TextTooLong { length, max });
    }
    Ok(())
}

/// Text that a request may give at most `MAX` characters.
#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "String")]
pub(super) struct Text<const MAX: usize>(String);

impl<const MAX: usize> TryFrom<String> for Text<MAX> {
    type Error = TextTooLong;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        check_length(&text, MAX)?;
        Ok(Self(text))
    }
}

impl<const MAX: usize> JsonSchema for Text<MAX> {
    fn inline_schema() -> bool {
        true
    }

    fn schema_name() -> Cow<'static, str> {
        Cow::Owned(format!("Text{MAX}"))
    }

    fn json_schema(_: &mut SchemaGenerator) -> Schema {
        json_schema!({ "type": "string", "maxLength": MAX })
    }
}

/// The semantic version is too long or does not follow Semantic Versioning 2.0.
#[derive(Debug, derive_more::Display)]
pub(super) enum SemanticVersionError {
    #[display("{_0}")]
    TooLong(TextTooLong),
    #[display("the version does not follow Semantic Versioning 2.0: {_0}")]
    Invalid(semver::Error),
}

impl Error for SemanticVersionError {}

/// A version in the format of Semantic Versioning 2.0.
#[derive(Debug, Deserialize)]
#[serde(try_from = "String")]
pub(super) struct SemanticVersion(semver::Version);

impl TryFrom<String> for SemanticVersion {
    type Error = SemanticVersionError;

    fn try_from(version: String) -> Result<Self, Self::Error> {
        check_length(&version, SHORT_TEXT).map_err(SemanticVersionError::TooLong)?;
        semver::Version::parse(&version)
            .map(Self)
            .map_err(SemanticVersionError::Invalid)
    }
}

impl JsonSchema for SemanticVersion {
    fn inline_schema() -> bool {
        true
    }

    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("SemanticVersion")
    }

    fn json_schema(_: &mut SchemaGenerator) -> Schema {
        json_schema!({
            "type": "string",
            "maxLength": SHORT_TEXT,
            "description": "A version in the format of Semantic Versioning 2.0.",
            "examples": ["1.2.3"],
        })
    }
}

/// The URI is not an absolute `http` or `https` URI, or it is too long.
#[derive(Debug, derive_more::Display)]
pub(super) enum UriError {
    #[display("the URI is not valid: {_0}")]
    Invalid(url::ParseError),
    #[display("the URI has the scheme `{_0}`, but only `http` and `https` are allowed")]
    Scheme(String),
    #[display("{_0}")]
    TooLong(TextTooLong),
}

impl Error for UriError {}

/// An absolute `http` or `https` URI.
#[derive(Debug, PartialEq, Deserialize)]
#[serde(try_from = "String")]
pub(super) struct Uri(Url);

impl TryFrom<String> for Uri {
    type Error = UriError;

    fn try_from(uri: String) -> Result<Self, Self::Error> {
        let uri = Url::parse(&uri).map_err(UriError::Invalid)?;
        if !matches!(uri.scheme(), "http" | "https") {
            return Err(UriError::Scheme(uri.scheme().to_owned()));
        }
        // Parsing encodes characters outside ASCII, which can make the URI longer than the input.
        check_length(uri.as_str(), LONG_TEXT).map_err(UriError::TooLong)?;
        Ok(Self(uri))
    }
}

impl Serialize for Uri {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.0.as_str())
    }
}

impl JsonSchema for Uri {
    fn inline_schema() -> bool {
        true
    }

    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("Uri")
    }

    fn json_schema(_: &mut SchemaGenerator) -> Schema {
        json_schema!({ "type": "string", "format": "uri", "maxLength": LONG_TEXT })
    }
}

/// The year of a point in time is outside 0 to 9999.
#[derive(Debug, derive_more::Display)]
#[display("the year {_0} is outside 0 to 9999")]
pub(super) struct YearOutOfRange(i32);

impl Error for YearOutOfRange {}

/// A point in time in any year.
#[derive(Deserialize)]
struct AnyDateTime(#[serde(with = "hash_codec::serde::time")] OffsetDateTime);

/// A point in time in the years 0 to 9999.
#[derive(Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "AnyDateTime")]
#[schemars(
    with = "String",
    description = "A point in time, with its offset from UTC.",
    extend("format" = "date-time")
)]
pub(super) struct DateTime(#[serde(with = "hash_codec::serde::time")] OffsetDateTime);

impl TryFrom<AnyDateTime> for DateTime {
    type Error = YearOutOfRange;

    fn try_from(AnyDateTime(time): AnyDateTime) -> Result<Self, Self::Error> {
        if !(0..=9999).contains(&time.year()) {
            return Err(YearOutOfRange(time.year()));
        }
        Ok(Self(time))
    }
}

/// Where the material came from.
#[derive(Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Location {
    /// The name of the place.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Text<SHORT_TEXT>")]
    name: Option<Text<SHORT_TEXT>>,
    /// The `http` or `https` URI the material was retrieved from.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Uri")]
    uri: Option<Uri>,
    /// A description of the place for a reader.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Text<LONG_TEXT>")]
    description: Option<Text<LONG_TEXT>>,
}

/// Material that data was produced from.
#[derive(Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Source {
    /// The kind of material.
    #[serde(rename = "type")]
    ty: SourceType,
    /// The entity in HASH that stands for the material.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "LiveEntityId")]
    entity_id: Option<LiveEntityId>,
    /// The people or organizations that wrote the material.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Vec<Text<SHORT_TEXT>>")]
    authors: Option<Vec<Text<SHORT_TEXT>>>,
    /// Where the material came from.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Location")]
    location: Option<Location>,
    /// When the material was first published.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "DateTime")]
    first_published: Option<DateTime>,
    /// When the material was last changed.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "DateTime")]
    last_updated: Option<DateTime>,
    /// When the material was retrieved.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "DateTime")]
    loaded_at: Option<DateTime>,
}

impl From<Location> for stored::Location {
    fn from(location: Location) -> Self {
        let Location {
            name,
            uri,
            description,
        } = location;
        Self {
            name: name.map(|Text(name)| name),
            uri: uri.map(|Uri(uri)| uri),
            description: description.map(|Text(description)| description),
        }
    }
}

impl From<stored::Location> for Location {
    fn from(location: stored::Location) -> Self {
        let stored::Location {
            name,
            uri,
            description,
        } = location;
        Self {
            name: name.map(Text),
            uri: uri.map(Uri),
            description: description.map(Text),
        }
    }
}

impl From<Source> for stored::SourceProvenance {
    fn from(source: Source) -> Self {
        let Source {
            ty,
            entity_id,
            authors,
            location,
            first_published,
            last_updated,
            loaded_at,
        } = source;
        Self {
            ty,
            entity_id: entity_id.map(EntityId::from),
            authors: authors
                .unwrap_or_default()
                .into_iter()
                .map(|Text(author)| author)
                .collect(),
            location: location.map(stored::Location::from),
            first_published: first_published.map(|DateTime(time)| time),
            last_updated: last_updated.map(|DateTime(time)| time),
            loaded_at: loaded_at.map(|DateTime(time)| time),
        }
    }
}

impl From<stored::SourceProvenance> for Source {
    fn from(source: stored::SourceProvenance) -> Self {
        let stored::SourceProvenance {
            ty,
            entity_id,
            authors,
            location,
            first_published,
            last_updated,
            loaded_at,
        } = source;
        Self {
            ty,
            // The ID names the live entity; a stored draft ID is left out.
            entity_id: entity_id
                .map(|entity_id| LiveEntityId::new(entity_id.web_id, entity_id.entity_uuid)),
            authors: (!authors.is_empty()).then(|| authors.into_iter().map(Text).collect()),
            location: location.map(Location::from),
            first_published: first_published.map(DateTime),
            last_updated: last_updated.map(DateTime),
            loaded_at: loaded_at.map(DateTime),
        }
    }
}

/// The list has more sources than allowed.
#[derive(Debug, derive_more::Display)]
#[display("the list has {_0} sources, but at most {MAX_SOURCES} are allowed")]
pub(super) struct TooManySources(usize);

impl Error for TooManySources {}

/// Material that data was produced from. A request may give at most 127 sources.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "Vec<Source>")]
#[schemars(inline, extend("maxItems" = MAX_SOURCES))]
pub(super) struct Sources(Vec<Source>);

impl TryFrom<Vec<Source>> for Sources {
    type Error = TooManySources;

    fn try_from(sources: Vec<Source>) -> Result<Self, Self::Error> {
        if sources.len() > MAX_SOURCES {
            return Err(TooManySources(sources.len()));
        }
        Ok(Self(sources))
    }
}

impl Sources {
    const fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    fn into_stored(self) -> Vec<stored::SourceProvenance> {
        self.0
            .into_iter()
            .map(stored::SourceProvenance::from)
            .collect()
    }

    fn from_stored(sources: Vec<stored::SourceProvenance>) -> Self {
        Self(sources.into_iter().map(Source::from).collect())
    }
}

/// Where a property comes from: a value, a list, or properties keyed by base URL.
#[derive(Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PropertyProvenance {
    /// The material the property was produced from.
    sources: Sources,
}

impl PropertyProvenance {
    /// The sources HASH stores for the property.
    pub(super) fn into_stored(self) -> Vec<stored::SourceProvenance> {
        let Self { sources } = self;
        sources.into_stored()
    }

    /// The public form of a property's stored sources, or [`None`] if there are none.
    pub(super) fn from_stored(sources: Vec<stored::SourceProvenance>) -> Option<Self> {
        if sources.is_empty() {
            return None;
        }
        Some(Self {
            sources: Sources::from_stored(sources),
        })
    }
}

/// The application that sends an entity, as it names itself.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NewOrigin {
    /// The name of the application.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Text<SHORT_TEXT>")]
    id: Option<Text<SHORT_TEXT>>,
    /// The version of the application, in any format.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Text<SHORT_TEXT>")]
    version: Option<Text<SHORT_TEXT>>,
    /// The version of the application in the format of Semantic Versioning 2.0.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "SemanticVersion")]
    semantic_version: Option<SemanticVersion>,
}

/// Where the data of an entity comes from, and which application sends it.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NewProvenance {
    /// The application that sends the entity, as it names itself. HASH stores it unconfirmed.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "NewOrigin")]
    origin: Option<NewOrigin>,
    /// The material the entity was produced from.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Sources")]
    sources: Option<Sources>,
}

impl NewProvenance {
    /// The provenance HASH stores for an edition the public API writes.
    ///
    /// The origin's type is always `external`. `actor_type` comes from the credentials of the
    /// request and `user_agent` from its `User-Agent` header.
    pub(super) fn into_stored(
        self,
        actor_type: ActorType,
        user_agent: Option<String>,
    ) -> ProvidedEntityEditionProvenance {
        let Self { origin, sources } = self;
        let NewOrigin {
            id,
            version,
            semantic_version,
        } = origin.unwrap_or_default();
        ProvidedEntityEditionProvenance {
            sources: sources.map_or_default(Sources::into_stored),
            actor_type,
            origin: stored::OriginProvenance {
                ty: stored::OriginType::External,
                id: id.map(|Text(id)| id),
                version: version.map(|Text(version)| version),
                semantic_version: semantic_version.map(|SemanticVersion(version)| version),
                environment: None,
                device_id: None,
                session_id: None,
                api_key_public_id: None,
                user_agent,
            },
        }
    }
}

/// The `User-Agent` header of a request, cut to at most 255 characters.
///
/// A header that is not visible ASCII is left out.
pub(super) fn user_agent(headers: &HeaderMap) -> Option<String> {
    let user_agent = headers.get(USER_AGENT)?.to_str().ok()?;
    Some(user_agent.chars().take(SHORT_TEXT).collect())
}

/// How an edition reached HASH; `external` means through the public API. More may follow.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
enum OriginType {
    WebApp,
    MobileApp,
    BrowserExtension,
    Api,
    Flow,
    Migration,
    External,
}

/// How an edition reached HASH.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct Origin {
    /// What sent the edition. HASH sets it.
    r#type: OriginType,
    /// What sent the edition: for `external` the name it gave, for `flow` the flow run's ID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    id: Option<String>,
    /// The version of what sent the edition, in any format.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    version: Option<String>,
    /// The version of what sent the edition in the format of Semantic Versioning 2.0.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "semver::Version")]
    semantic_version: Option<semver::Version>,
    /// For `flow`, the IDs of the flow steps that wrote the edition.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    step_ids: Vec<String>,
}

impl From<stored::OriginProvenance> for Origin {
    fn from(
        stored::OriginProvenance {
            ty,
            id,
            version,
            semantic_version,
            environment: _,
            device_id: _,
            session_id: _,
            api_key_public_id: _,
            user_agent: _,
        }: stored::OriginProvenance,
    ) -> Self {
        let (r#type, step_ids) = match ty {
            stored::OriginType::WebApp => (OriginType::WebApp, HashSet::new()),
            stored::OriginType::MobileApp => (OriginType::MobileApp, HashSet::new()),
            stored::OriginType::BrowserExtension => (OriginType::BrowserExtension, HashSet::new()),
            stored::OriginType::Api => (OriginType::Api, HashSet::new()),
            stored::OriginType::Flow { step_ids } => (OriginType::Flow, step_ids),
            stored::OriginType::Migration => (OriginType::Migration, HashSet::new()),
            stored::OriginType::External => (OriginType::External, HashSet::new()),
        };
        let mut step_ids = step_ids.into_iter().collect::<Vec<_>>();
        step_ids.sort_unstable();

        Self {
            r#type,
            id,
            version,
            semantic_version,
            step_ids,
        }
    }
}

/// Where the data of an entity edition comes from, and how it reached HASH.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct Provenance {
    /// The kind of actor that wrote the edition.
    actor_type: ActorType,
    /// How the edition reached HASH.
    origin: Origin,
    /// The material the edition was produced from.
    #[serde(default, skip_serializing_if = "Sources::is_empty")]
    sources: Sources,
}

impl Provenance {
    /// The public form of an edition's provenance.
    ///
    /// It leaves out the API token, the user agent, the session, the device and the environment
    /// of the origin.
    pub(super) fn from_stored(provenance: ProvidedEntityEditionProvenance) -> Self {
        let ProvidedEntityEditionProvenance {
            sources,
            actor_type,
            origin,
        } = provenance;
        Self {
            actor_type,
            origin: Origin::from(origin),
            sources: Sources::from_stored(sources),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;
    use std::collections::HashSet;

    use http::{HeaderMap, HeaderValue, header::USER_AGENT};
    use serde_json::json;
    use type_system::{
        knowledge::entity::provenance::ProvidedEntityEditionProvenance,
        principal::actor::ActorType,
        provenance::{self as stored, SourceType},
    };

    use super::{DateTime, NewProvenance, Provenance, Source, Uri, user_agent};

    const ID: &str = "8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d";
    const DRAFT_ID: &str = "4b2a7c1e-9f3d-4e8a-b6c5-d1e2f3a4b5c6";

    fn parse(value: serde_json::Value) -> Result<NewProvenance, serde_json::Error> {
        serde_json::from_value(value)
    }

    /// A source in its public form, every field with a value of its own.
    fn public_source() -> serde_json::Value {
        json!({
            "type": "document",
            "entityId": ID,
            "authors": ["Alice", "Bob"],
            "location": {
                "name": "Example",
                "uri": "https://example.com/report",
                "description": "The annual report",
            },
            "firstPublished": "2001-01-01T01:01:01.000000000+01:00",
            "lastUpdated": "2002-02-02T02:02:02.000000000+02:00",
            "loadedAt": "2003-03-03T03:03:03.000000000+03:00",
        })
    }

    #[test]
    fn origin_type_named() {
        assert_matches!(
            parse(json!({ "origin": { "type": "flow" } })),
            Err(error) if error.to_string().contains("unknown field `type`")
        );
    }

    #[test]
    fn origin_id_length() {
        parse(json!({ "origin": { "id": "a".repeat(255) } }))
            .expect("should accept an ID of 255 characters");
        assert_matches!(
            parse(json!({ "origin": { "id": "\u{e4}".repeat(256) } })),
            Err(error) if error.to_string().contains("the text has 256 characters")
        );
    }

    #[test]
    fn origin_semantic_version_invalid() {
        assert_matches!(
            parse(json!({ "origin": { "semanticVersion": "v1.2.3" } })),
            Err(error) if error.to_string().contains("Semantic Versioning 2.0")
        );
    }

    #[test]
    fn origin_null() {
        assert_matches!(
            parse(json!({ "origin": null })),
            Err(error) if error.to_string().contains("invalid type: null")
        );
    }

    #[test]
    fn sources_count() {
        let source = json!({ "type": "webpage" });
        parse(json!({ "sources": vec![source.clone(); 127] })).expect("should accept 127 sources");
        assert_matches!(
            parse(json!({ "sources": vec![source; 128] })),
            Err(error) if error.to_string().contains("the list has 128 sources")
        );
    }

    #[test]
    fn uri_length() {
        let base = "https://example.com/";
        let uri = |length: usize| format!("{base}{}", "a".repeat(length - base.len()));

        serde_json::from_value::<Uri>(json!(uri(4095)))
            .expect("should accept a URI of 4095 characters");
        assert_matches!(
            serde_json::from_value::<Uri>(json!(uri(4096))),
            Err(error) if error.to_string().contains("the text has 4096 characters")
        );
    }

    #[test]
    fn uri_length_encoded() {
        // 520 characters as sent, 4520 once each euro sign is percent-encoded.
        let uri = format!("https://example.com/{}", "\u{20ac}".repeat(500));
        assert_matches!(
            serde_json::from_value::<Uri>(json!(uri)),
            Err(error) if error.to_string().contains("the text has 4520 characters")
        );
    }

    #[test]
    fn uri_scheme() {
        assert_matches!(
            serde_json::from_value::<Uri>(json!("javascript:alert(1)")),
            Err(error) if error.to_string().contains("the scheme `javascript`")
        );
    }

    #[test]
    fn date_time_year() {
        for time in [
            "0000-01-01T00:00:00.000000000Z",
            "9999-12-31T23:59:59.000000000Z",
        ] {
            let parsed = serde_json::from_value::<DateTime>(json!(time))
                .expect("should accept a year from 0 to 9999");
            assert_eq!(
                serde_json::to_value(parsed).expect("should write the point in time"),
                json!(time),
                "the point in time should be written as it was read"
            );
        }
        assert_matches!(
            serde_json::from_value::<DateTime>(json!("-000001-01-01T00:00:00Z")),
            Err(error) if error.to_string().contains("the year -1 is outside")
        );
        // The parser itself rejects years after 9999.
        assert_matches!(
            serde_json::from_value::<DateTime>(json!("+010000-01-01T00:00:00Z")),
            Err(_)
        );
    }

    #[test]
    fn source_into_stored() {
        let source = serde_json::from_value::<Source>(public_source()).expect("should be a source");

        assert_eq!(
            serde_json::to_value(stored::SourceProvenance::from(source))
                .expect("should serialize the source"),
            public_source(),
            "every field should be stored under its own name"
        );
    }

    #[test]
    fn source_from_stored() {
        let mut stored = public_source();
        stored["entityId"] = json!(format!("{ID}~{DRAFT_ID}"));
        let stored = serde_json::from_value::<stored::SourceProvenance>(stored)
            .expect("should be a stored source");

        assert_eq!(
            serde_json::to_value(Source::from(stored)).expect("should serialize the source"),
            public_source(),
            "every field should be shown under its own name, and the draft ID should be left out"
        );
    }

    #[test]
    fn into_stored_external() {
        let stored = parse(json!({
            "origin": { "id": "importer", "version": "v1.2.3", "semanticVersion": "1.2.3" },
            "sources": [{ "type": "webpage" }],
        }))
        .expect("should be provenance")
        .into_stored(ActorType::Machine, Some("importer/1.2.3".to_owned()));

        assert_eq!(
            serde_json::to_value(&stored).expect("should serialize the provenance"),
            json!({
                "actorType": "machine",
                "origin": {
                    "type": "external",
                    "id": "importer",
                    "version": "v1.2.3",
                    "semanticVersion": "1.2.3",
                    "userAgent": "importer/1.2.3",
                },
                "sources": [{ "type": "webpage" }],
            }),
            "the caller's fields should be kept and the type should be `external`"
        );
    }

    #[test]
    fn into_stored_empty() {
        let stored = parse(json!({}))
            .expect("should be provenance")
            .into_stored(ActorType::User, Some("agent".to_owned()));

        assert_eq!(
            serde_json::to_value(Provenance::from_stored(stored))
                .expect("should serialize the provenance"),
            json!({ "actorType": "user", "origin": { "type": "external" } }),
            "an entity without provenance should show only the actor type and `external`"
        );
    }

    #[test]
    fn from_stored_hidden() {
        let origin = stored::OriginProvenance {
            id: Some("run".to_owned()),
            version: Some("v1".to_owned()),
            semantic_version: Some(semver::Version::new(1, 2, 3)),
            device_id: Some("device".to_owned()),
            session_id: Some("session".to_owned()),
            api_key_public_id: Some("token".to_owned()),
            user_agent: Some("agent".to_owned()),
            environment: Some("production".to_owned()),
            ..stored::OriginProvenance::from_empty_type(stored::OriginType::Flow {
                step_ids: ["f", "c", "a", "e", "b", "d"]
                    .into_iter()
                    .map(str::to_owned)
                    .collect::<HashSet<_>>(),
            })
        };
        let provenance = Provenance::from_stored(ProvidedEntityEditionProvenance {
            sources: vec![stored::SourceProvenance {
                ty: SourceType::Document,
                entity_id: None,
                authors: Vec::new(),
                location: None,
                first_published: None,
                last_updated: None,
                loaded_at: None,
            }],
            actor_type: ActorType::Ai,
            origin,
        });

        assert_eq!(
            serde_json::to_value(provenance).expect("should serialize the provenance"),
            json!({
                "actorType": "ai",
                "origin": {
                    "type": "flow",
                    "id": "run",
                    "version": "v1",
                    "semanticVersion": "1.2.3",
                    "stepIds": ["a", "b", "c", "d", "e", "f"],
                },
                "sources": [{ "type": "document" }],
            }),
            "the token, the user agent, the session, the device and the environment should be \
             left out, and the step IDs should be sorted"
        );
    }

    #[test]
    fn user_agent_missing() {
        assert_eq!(
            user_agent(&HeaderMap::new()),
            None,
            "a missing header should give no user agent"
        );
    }

    #[test]
    fn user_agent_cut() {
        let mut headers = HeaderMap::new();
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&format!("{}{}", "a".repeat(255), "b".repeat(45)))
                .expect("should be a header value"),
        );
        assert_eq!(
            user_agent(&headers),
            Some("a".repeat(255)),
            "the user agent should keep its first 255 characters"
        );
    }

    #[test]
    fn user_agent_non_ascii() {
        let mut headers = HeaderMap::new();
        headers.insert(
            USER_AGENT,
            HeaderValue::from_bytes("caf\u{e9}".as_bytes()).expect("should be a header value"),
        );
        assert_eq!(
            user_agent(&headers),
            None,
            "a header that is not visible ASCII should give no user agent"
        );
    }
}
