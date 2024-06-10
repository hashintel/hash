use core::iter::once;

#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use type_system::{
    url::{BaseUrl, VersionedUrl},
    EntityType,
};
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{schema, Ref, RefOr, Schema, SchemaType},
    ToSchema,
};
use uuid::Uuid;

use crate::{
    ontology::{
        OntologyProvenance, OntologyTemporalMetadata, OntologyType,
        OntologyTypeClassificationMetadata, OntologyTypeRecordId, OntologyTypeReference,
        OntologyTypeWithMetadata,
    },
    Embedding,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[repr(transparent)]
pub struct EntityTypeId(Uuid);

impl EntityTypeId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub fn from_url(url: &VersionedUrl) -> Self {
        Self(Uuid::new_v5(
            &Uuid::NAMESPACE_URL,
            url.to_string().as_bytes(),
        ))
    }

    #[must_use]
    pub fn from_record_id(record_id: &OntologyTypeRecordId) -> Self {
        Self(Uuid::new_v5(
            &Uuid::NAMESPACE_URL,
            record_id.to_string().as_bytes(),
        ))
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

/// An [`EntityTypeMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialEntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub classification: OntologyTypeClassificationMetadata,
    pub label_property: Option<BaseUrl>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    #[serde(flatten)]
    pub classification: OntologyTypeClassificationMetadata,
    pub temporal_versioning: OntologyTemporalMetadata,
    pub provenance: OntologyProvenance,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_property: Option<BaseUrl>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeEmbedding<'e> {
    pub entity_type_id: VersionedUrl,
    pub embedding: Embedding<'e>,
}

#[cfg(feature = "utoipa")]
impl ToSchema<'static> for EntityTypeMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "EntityTypeMetadata",
            Schema::OneOf(
                schema::OneOfBuilder::new()
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("OwnedEntityTypeMetadata"))
                            .property("recordId", Ref::from_schema_name("OntologyTypeRecordId"))
                            .required("recordId")
                            .property("ownedById", Ref::from_schema_name("OwnedById"))
                            .required("ownedById")
                            .property(
                                "temporalVersioning",
                                Ref::from_schema_name("OntologyTemporalMetadata"),
                            )
                            .required("temporalVersioning")
                            .property("provenance", Ref::from_schema_name("OntologyProvenance"))
                            .required("provenance")
                            .property("labelProperty", Ref::from_schema_name("BaseUrl"))
                            .property(
                                "icon",
                                schema::ObjectBuilder::new()
                                    .schema_type(SchemaType::String)
                                    .build(),
                            )
                            .build(),
                    )
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("ExternalEntityTypeMetadata"))
                            .property("recordId", Ref::from_schema_name("OntologyTypeRecordId"))
                            .required("recordId")
                            .property("fetchedAt", Ref::from_schema_name("Timestamp"))
                            .required("fetchedAt")
                            .property(
                                "temporalVersioning",
                                Ref::from_schema_name("OntologyTemporalMetadata"),
                            )
                            .required("temporalVersioning")
                            .property("provenance", Ref::from_schema_name("OntologyProvenance"))
                            .required("provenance")
                            .property("labelProperty", Ref::from_schema_name("BaseUrl"))
                            .property(
                                "icon",
                                schema::ObjectBuilder::new()
                                    .schema_type(SchemaType::String)
                                    .build(),
                            )
                            .build(),
                    )
                    .build(),
            )
            .into(),
        )
    }
}

impl OntologyType for EntityType {
    type Metadata = EntityTypeMetadata;

    fn id(&self) -> &VersionedUrl {
        self.id()
    }

    fn traverse_references(&self) -> Vec<OntologyTypeReference> {
        self.property_type_references()
            .into_iter()
            .map(OntologyTypeReference::PropertyTypeReference)
            .chain(
                self.inherits_from()
                    .all_of()
                    .iter()
                    .map(OntologyTypeReference::EntityTypeReference),
            )
            .chain(self.link_mappings().into_iter().flat_map(
                |(link_entity_type, destination_entity_type_constraint)| {
                    {
                        once(link_entity_type)
                            .chain(destination_entity_type_constraint.unwrap_or_default())
                    }
                    .map(OntologyTypeReference::EntityTypeReference)
                },
            ))
            .collect()
    }
}

pub type EntityTypeWithMetadata = OntologyTypeWithMetadata<EntityType>;

#[cfg(feature = "utoipa")]
impl ToSchema<'static> for EntityTypeWithMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "EntityTypeWithMetadata",
            schema::ObjectBuilder::new()
                .property("schema", Ref::from_schema_name("VAR_ENTITY_TYPE"))
                .required("schema")
                .property(
                    "metadata",
                    Ref::from_schema_name(EntityTypeMetadata::schema().0),
                )
                .required("metadata")
                .build()
                .into(),
        )
    }
}
