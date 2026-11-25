//! The bodies of the requests that write a row of the sync table to the Graph, in the shape its
//! entity API reads.
//!
//! The Graph's own request types only deserialize, so these mirror the fields an integration
//! sends.

#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;

use error_stack::{Report, ResultExt as _};
use serde::Serialize;
use serde_json::value::RawValue;
use type_system::{
    knowledge::{
        entity::{
            Link, LinkEndpoint,
            id::{EntityId, EntityUuid},
            provenance::ProvidedEntityEditionProvenance,
        },
        property::{
            PropertyObjectWithMetadata, PropertyWithMetadata, metadata::PropertyProvenance,
        },
    },
    ontology::{BaseUrl, VersionedUrl},
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType, SourceProvenance, SourceType},
};

use crate::sync_table::{Op, SyncRow};

/// The body of a request for an entity could not be built.
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the request for `{entity_id}` could not be built")]
pub(super) struct RequestError {
    pub entity_id: EntityId,
}

/// The body that creates the entity of `row`, with the ends of a link row.
///
/// # Errors
///
/// Returns [`RequestError`] if a link row lacks an end, or if the body cannot be encoded.
pub(super) fn create(
    row: &SyncRow,
    provenance: &ProvidedEntityEditionProvenance,
) -> Result<Box<RawValue>, Report<RequestError>> {
    let link_data = match row.op {
        Op::CreateLink | Op::UpdateLink | Op::ArchiveLink => {
            let (Some(left), Some(right)) = (row.left_entity_id, row.right_entity_id) else {
                return Err(Report::new(RequestError {
                    entity_id: row.entity_id,
                }));
            };
            Some(Link::Directed {
                source: endpoint(left),
                target: endpoint(right),
            })
        }
        Op::CreateEntity | Op::UpdateEntity | Op::ArchiveEntity => None,
    };
    encode(
        row.entity_id,
        &CreateEntity {
            web_id: row.entity_id.web_id,
            entity_uuid: row.entity_id.entity_uuid,
            entity_type_ids: [row.entity_type.clone()],
            properties: row.properties.clone(),
            link_data,
            draft: false,
            provenance: provenance.clone(),
            read_only: true,
        },
    )
}

/// The body that adds the properties of `row` to its entity and revives it if it was archived.
///
/// # Errors
///
/// Returns [`RequestError`] if the body cannot be encoded.
pub(super) fn patch(
    row: &SyncRow,
    provenance: &ProvidedEntityEditionProvenance,
) -> Result<Box<RawValue>, Report<RequestError>> {
    // Patches go in base URL order, as the properties themselves are unordered.
    let properties = row
        .properties
        .value
        .iter()
        .collect::<BTreeMap<_, _>>()
        .into_iter()
        .map(|(base_url, property)| PropertyPatch::Add {
            path: [base_url.clone()],
            property: property.clone(),
        })
        .collect();
    encode(
        row.entity_id,
        &PatchEntity {
            entity_id: row.entity_id,
            entity_type_ids: [row.entity_type.clone()],
            properties,
            archived: false,
            provenance: provenance.clone(),
        },
    )
}

/// The body that archives the entity of `row`.
///
/// # Errors
///
/// Returns [`RequestError`] if the body cannot be encoded.
pub(super) fn archive(
    row: &SyncRow,
    provenance: &ProvidedEntityEditionProvenance,
) -> Result<Box<RawValue>, Report<RequestError>> {
    encode(
        row.entity_id,
        &ArchiveEntity {
            entity_id: row.entity_id,
            archived: true,
            provenance: provenance.clone(),
        },
    )
}

/// The provenance of an edition an integration writes: a machine writing through the API, with
/// `source` describing the material it read.
///
/// `source` is recorded as an integration, whatever kind it states.
pub(super) fn integration_provenance(source: SourceProvenance) -> ProvidedEntityEditionProvenance {
    ProvidedEntityEditionProvenance {
        sources: vec![SourceProvenance {
            ty: SourceType::Integration,
            ..source
        }],
        actor_type: ActorType::Machine,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
    }
}

/// `body` as JSON with every object's keys sorted, so the same row always encodes to the same
/// bytes.
fn encode(
    entity_id: EntityId,
    body: &impl Serialize,
) -> Result<Box<RawValue>, Report<RequestError>> {
    let mut value = serde_json::to_value(body).change_context(RequestError { entity_id })?;
    value.sort_all_objects();
    serde_json::value::to_raw_value(&value).change_context(RequestError { entity_id })
}

fn endpoint(entity_id: EntityId) -> LinkEndpoint {
    LinkEndpoint {
        entity_id,
        confidence: None,
        provenance: PropertyProvenance::default(),
    }
}

/// Creates an entity, as `CreateEntityParams` reads it. Integration entities are read-only, so
/// only the integration changes them.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateEntity {
    web_id: WebId,
    entity_uuid: EntityUuid,
    entity_type_ids: [VersionedUrl; 1],
    properties: PropertyObjectWithMetadata,
    #[serde(skip_serializing_if = "Option::is_none")]
    link_data: Option<Link>,
    draft: bool,
    provenance: ProvidedEntityEditionProvenance,
    read_only: bool,
}

/// Updates an existing entity and revives it if it was archived, as `PatchEntityParams` reads
/// it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchEntity {
    entity_id: EntityId,
    entity_type_ids: [VersionedUrl; 1],
    /// Left out when empty, as the Graph rejects an empty property patch.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    properties: Vec<PropertyPatch>,
    archived: bool,
    provenance: ProvidedEntityEditionProvenance,
}

/// A change to one property, as `PropertyPatchOperation` reads it.
#[derive(Debug, Serialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum PropertyPatch {
    Add {
        path: [BaseUrl; 1],
        property: PropertyWithMetadata,
    },
}

/// Archives an entity, as `PatchEntityParams` reads it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveEntity {
    entity_id: EntityId,
    archived: bool,
    provenance: ProvidedEntityEditionProvenance,
}
