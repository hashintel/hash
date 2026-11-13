//! Canonical request bodies in the Graph entity API's wire format.

use serde::Serialize;
use type_system::{
    knowledge::{
        entity::{
            Link, LinkEndpoint,
            id::{EntityId, EntityUuid},
            provenance::ProvidedEntityEditionProvenance,
        },
        property::{PropertyObjectWithMetadata, metadata::PropertyProvenance},
    },
    ontology::{BaseUrl, VersionedUrl},
    principal::actor_group::WebId,
};

use super::super::{Archive, EntityUpsert, LinkUpsert};

pub(super) struct UpsertBodies {
    pub create: Box<str>,
    pub patch: Box<str>,
}

pub(super) fn upsert_entity(upsert: EntityUpsert) -> Result<UpsertBodies, serde_json::Error> {
    upsert_bodies(
        upsert.entity_id,
        upsert.entity_type,
        upsert.properties,
        None,
        upsert.provenance,
    )
}

pub(super) fn upsert_link(upsert: LinkUpsert) -> Result<UpsertBodies, serde_json::Error> {
    upsert_bodies(
        upsert.link_id,
        upsert.link_type,
        upsert.properties,
        Some(Link::Directed {
            source: endpoint(upsert.left_entity_id),
            target: endpoint(upsert.right_entity_id),
        }),
        upsert.provenance,
    )
}

pub(super) fn archive(archive: Archive) -> Result<Box<str>, serde_json::Error> {
    sorted_json(serde_json::to_value(ArchiveEntity {
        entity_id: archive.entity_id,
        archived: true,
        provenance: archive.provenance,
    })?)
}

fn upsert_bodies(
    entity_id: EntityId,
    entity_type: VersionedUrl,
    properties: PropertyObjectWithMetadata,
    link_data: Option<Link>,
    provenance: ProvidedEntityEditionProvenance,
) -> Result<UpsertBodies, serde_json::Error> {
    let patch = PatchEntity {
        entity_id,
        entity_type_ids: [entity_type.clone()],
        properties: [PropertyPatch::Replace {
            path: [],
            property: properties.clone(),
        }],
        archived: false,
        provenance: provenance.clone(),
    };
    let create = CreateEntity {
        web_id: entity_id.web_id,
        entity_uuid: entity_id.entity_uuid,
        entity_type_ids: [entity_type],
        properties,
        link_data,
        draft: false,
        provenance,
        read_only: true,
    };
    Ok(UpsertBodies {
        create: sorted_json(serde_json::to_value(create)?)?,
        patch: sorted_json(serde_json::to_value(patch)?)?,
    })
}

fn sorted_json(mut value: serde_json::Value) -> Result<Box<str>, serde_json::Error> {
    value.sort_all_objects();
    serde_json::to_string(&value).map(String::into_boxed_str)
}

fn endpoint(entity_id: EntityId) -> LinkEndpoint {
    LinkEndpoint {
        entity_id,
        confidence: None,
        provenance: PropertyProvenance::default(),
    }
}

/// Integrations create read-only, non-draft entities and retain that policy on retry.
#[derive(Serialize)]
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchEntity {
    entity_id: EntityId,
    entity_type_ids: [VersionedUrl; 1],
    properties: [PropertyPatch; 1],
    archived: bool,
    provenance: ProvidedEntityEditionProvenance,
}

#[derive(Serialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum PropertyPatch {
    Replace {
        path: [BaseUrl; 0],
        property: PropertyObjectWithMetadata,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveEntity {
    entity_id: EntityId,
    archived: bool,
    provenance: ProvidedEntityEditionProvenance,
}
