use serde::{Deserialize, Serialize};
use type_system::{schema::EntityType, url::VersionedUrl};
#[cfg(feature = "utoipa")]
use utoipa::{
    ToSchema,
    openapi::{Ref, RefOr, Schema, schema},
};

use crate::{
    Embedding,
    ontology::{
        OntologyProvenance, OntologyTemporalMetadata, OntologyType,
        OntologyTypeClassificationMetadata, OntologyTypeRecordId, OntologyTypeReference,
        OntologyTypeWithMetadata,
    },
};

/// An [`EntityTypeMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialEntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub classification: OntologyTypeClassificationMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    #[serde(flatten)]
    pub classification: OntologyTypeClassificationMetadata,
    pub temporal_versioning: OntologyTemporalMetadata,
    pub provenance: OntologyProvenance,
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
        &self.display_metadata.id
    }

    fn traverse_references(&self) -> Vec<OntologyTypeReference> {
        self.entity_type_references()
            .map(|(reference, _)| OntologyTypeReference::EntityTypeReference(reference))
            .chain(
                self.property_type_references()
                    .map(|(reference, _)| OntologyTypeReference::PropertyTypeReference(reference)),
            )
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
