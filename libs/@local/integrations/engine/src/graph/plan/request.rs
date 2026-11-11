//! The requests that write an operation to the Graph, in the shape its entity API reads.
//!
//! The Graph's own request types only deserialize, so these mirror the fields an integration
//! sends.

use alloc::collections::BTreeMap;

use serde::Serialize;
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
    principal::actor_group::WebId,
};

use super::{
    super::{Archive, EntityUpsert, GraphOperation, LinkUpsert},
    Payload,
};

/// The version of the delivery format, so a later engine can still read saved requests.
const DELIVERY_VERSION: u8 = 1;

/// Everything delivery needs to write one operation, saved before anything is sent.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Delivery {
    version: u8,
    entity_id: EntityId,
    request: Request,
}

impl Delivery {
    pub(super) const fn entity_id(&self) -> EntityId {
        self.entity_id
    }

    /// The delivery as JSON with every object's keys sorted, so the same operation always
    /// encodes to the same text.
    pub(super) fn encode(&self) -> Result<Payload, serde_json::Error> {
        let mut value = serde_json::to_value(self)?;
        value.sort_all_objects();
        serde_json::value::to_raw_value(&value).map(Payload)
    }
}

impl Delivery {
    const fn new(entity_id: EntityId, request: Request) -> Self {
        Self {
            version: DELIVERY_VERSION,
            entity_id,
            request,
        }
    }
}

impl From<GraphOperation> for Delivery {
    fn from(operation: GraphOperation) -> Self {
        match operation {
            GraphOperation::UpsertEntity(EntityUpsert {
                entity_id,
                entity_type,
                properties,
                provenance,
            }) => Self::new(
                entity_id,
                Request::upsert(entity_id, entity_type, properties, None, provenance),
            ),
            GraphOperation::UpsertLink(LinkUpsert {
                link_id,
                link_type,
                left_entity_id,
                right_entity_id,
                properties,
                provenance,
            }) => Self::new(
                link_id,
                Request::upsert(
                    link_id,
                    link_type,
                    properties.unwrap_or_default(),
                    Some(Link::Directed {
                        source: endpoint(left_entity_id),
                        target: endpoint(right_entity_id),
                    }),
                    provenance,
                ),
            ),
            GraphOperation::ArchiveLink(archive) | GraphOperation::ArchiveEntity(archive) => {
                Self::new(
                    archive.entity_id,
                    Request::Archive {
                        archive: archive.into(),
                    },
                )
            }
        }
    }
}

/// The requests for one operation.
#[derive(Debug, Serialize)]
#[expect(
    clippy::large_enum_variant,
    reason = "built once per operation and encoded straight away"
)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Request {
    /// Creates the entity, patches it instead if it exists, and keeps the archive request for
    /// when the record later disappears from the source.
    Upsert {
        create: CreateEntity,
        patch: PatchEntity,
        archive: ArchiveEntity,
    },
    Archive {
        archive: ArchiveEntity,
    },
}

impl Request {
    fn upsert(
        entity_id: EntityId,
        entity_type: VersionedUrl,
        properties: PropertyObjectWithMetadata,
        link_data: Option<Link>,
        provenance: ProvidedEntityEditionProvenance,
    ) -> Self {
        // Patches go in base URL order, as the properties themselves are unordered.
        let patches = properties
            .value
            .iter()
            .collect::<BTreeMap<_, _>>()
            .into_iter()
            .map(|(base_url, property)| PropertyPatch::Add {
                path: [base_url.clone()],
                property: property.clone(),
            })
            .collect();
        Self::Upsert {
            patch: PatchEntity {
                entity_id,
                entity_type_ids: [entity_type.clone()],
                properties: patches,
                archived: false,
                provenance: provenance.clone(),
            },
            archive: ArchiveEntity {
                entity_id,
                archived: true,
                provenance: provenance.clone(),
            },
            create: CreateEntity {
                web_id: entity_id.web_id,
                entity_uuid: entity_id.entity_uuid,
                entity_type_ids: [entity_type],
                properties,
                link_data,
                draft: false,
                provenance,
                read_only: true,
            },
        }
    }
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

impl From<Archive> for ArchiveEntity {
    fn from(
        Archive {
            entity_id,
            provenance,
        }: Archive,
    ) -> Self {
        Self {
            entity_id,
            archived: true,
            provenance,
        }
    }
}
