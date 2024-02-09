use std::iter::once;

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

use crate::ontology::{
    OntologyProvenanceMetadata, OntologyTemporalMetadata, OntologyType,
    OntologyTypeClassificationMetadata, OntologyTypeRecordId, OntologyTypeReference,
    OntologyTypeWithMetadata,
};

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
    pub provenance: OntologyProvenanceMetadata,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_property: Option<BaseUrl>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
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
                            .property(
                                "provenance",
                                Ref::from_schema_name("OntologyProvenanceMetadata"),
                            )
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
                            .property(
                                "provenance",
                                Ref::from_schema_name("OntologyProvenanceMetadata"),
                            )
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
