//! Where the data of an entity edition comes from, and how it reached HASH.
//!
//! Requests and responses use the source types HASH stores. A request's provenance is checked
//! with [`ProvenanceValidator`] before anything is written. A response shows stored provenance
//! without checking it again, and leaves out draft IDs and the origin fields
//! [`Provenance::from_stored`] lists.
//!
//! [`ProvenanceValidator`]: type_system::provenance::validation::ProvenanceValidator

use hash_codec::serde::non_null;
use http::{HeaderMap, header::USER_AGENT};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::{
        entity::provenance::ProvidedEntityEditionProvenance, property::metadata::PropertyProvenance,
    },
    principal::actor::ActorType,
    provenance::{
        OriginProvenance, OriginType, SourceProvenance,
        validation::{MAX_SHORT_TEXT_LENGTH, MAX_SOURCES},
    },
};

/// The application that sends an entity, as it names itself.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NewOrigin {
    /// The name of the application.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "String", length(max = MAX_SHORT_TEXT_LENGTH))]
    id: Option<String>,
    /// The version of the application, in any format.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "String", length(max = MAX_SHORT_TEXT_LENGTH))]
    version: Option<String>,
    /// The version of the application in Semantic Versioning 2.0, at most 255 characters.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "semver::Version")]
    semantic_version: Option<semver::Version>,
}

/// Where the data of an entity comes from, and which application sends it.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NewProvenance {
    /// The application that sends the entity, as it names itself. HASH stores it unconfirmed.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "NewOrigin")]
    origin: Option<NewOrigin>,
    /// The material the entity was produced from.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "Vec<SourceProvenance>", length(max = MAX_SOURCES))]
    sources: Option<Vec<SourceProvenance>>,
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
            sources: sources.unwrap_or_default(),
            actor_type,
            origin: OriginProvenance {
                ty: OriginType::External,
                id,
                version,
                semantic_version,
                environment: None,
                device_id: None,
                session_id: None,
                api_key_public_id: None,
                user_agent,
            },
        }
    }
}

/// The `User-Agent` header of a request, cut to at most [`MAX_SHORT_TEXT_LENGTH`] characters.
///
/// A header that is not visible ASCII is left out.
pub(super) fn user_agent(headers: &HeaderMap) -> Option<String> {
    let user_agent = headers.get(USER_AGENT)?.to_str().ok()?;
    Some(user_agent.chars().take(MAX_SHORT_TEXT_LENGTH).collect())
}

/// `sources` with the draft IDs left out of the entities they name.
fn without_draft_ids(mut sources: Vec<SourceProvenance>) -> Vec<SourceProvenance> {
    for entity_id in sources
        .iter_mut()
        .filter_map(|source| source.entity_id.as_mut())
    {
        entity_id.draft_id = None;
    }
    sources
}

/// The public form of a property's stored sources, or [`None`] if there are none.
pub(super) fn property_provenance(sources: Vec<SourceProvenance>) -> Option<PropertyProvenance> {
    (!sources.is_empty()).then(|| PropertyProvenance {
        sources: without_draft_ids(sources),
    })
}

/// How an edition reached HASH. More types may follow.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct Origin {
    #[serde(flatten)]
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
}

impl From<OriginProvenance> for Origin {
    fn from(
        OriginProvenance {
            ty,
            id,
            version,
            semantic_version,
            environment: _,
            device_id: _,
            session_id: _,
            api_key_public_id: _,
            user_agent: _,
        }: OriginProvenance,
    ) -> Self {
        Self {
            r#type: ty,
            id,
            version,
            semantic_version,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    sources: Vec<SourceProvenance>,
}

impl Provenance {
    /// The public form of an edition's provenance.
    ///
    /// It leaves out the API token, the user agent, the session, the device and the environment
    /// of the origin, and the draft IDs of the entities the sources name.
    pub(super) fn from_stored(provenance: ProvidedEntityEditionProvenance) -> Self {
        let ProvidedEntityEditionProvenance {
            sources,
            actor_type,
            origin,
        } = provenance;
        Self {
            actor_type,
            origin: Origin::from(origin),
            sources: without_draft_ids(sources),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use http::{HeaderMap, HeaderValue, header::USER_AGENT};
    use serde_json::json;
    use type_system::{
        knowledge::entity::provenance::ProvidedEntityEditionProvenance,
        principal::actor::ActorType,
        provenance::{OriginProvenance, OriginType},
    };

    use super::{NewProvenance, Provenance, user_agent};

    const ID: &str = "8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d";
    const DRAFT_ID: &str = "4b2a7c1e-9f3d-4e8a-b6c5-d1e2f3a4b5c6";

    fn parse(value: serde_json::Value) -> Result<NewProvenance, serde_json::Error> {
        serde_json::from_value(value)
    }

    #[test]
    fn origin_type_named() {
        assert_matches!(
            parse(json!({ "origin": { "type": "flow" } })),
            Err(error) if error.to_string().contains("unknown field `type`")
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
        let origin = OriginProvenance {
            id: Some("run".to_owned()),
            version: Some("v1".to_owned()),
            semantic_version: Some(semver::Version::new(1, 2, 3)),
            device_id: Some("device".to_owned()),
            session_id: Some("session".to_owned()),
            api_key_public_id: Some("token".to_owned()),
            user_agent: Some("agent".to_owned()),
            environment: Some("production".to_owned()),
            ..OriginProvenance::from_empty_type(OriginType::Flow {
                step_ids: ["f", "c", "a", "e", "b", "d"]
                    .into_iter()
                    .map(str::to_owned)
                    .collect(),
            })
        };
        let provenance = Provenance::from_stored(ProvidedEntityEditionProvenance {
            sources: serde_json::from_value(json!([
                { "type": "document", "entityId": format!("{ID}~{DRAFT_ID}") },
            ]))
            .expect("should be stored sources"),
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
                "sources": [{ "type": "document", "entityId": ID }],
            }),
            "the token, the user agent, the session, the device, the environment and the draft ID \
             should be left out, and the step IDs should be sorted"
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
