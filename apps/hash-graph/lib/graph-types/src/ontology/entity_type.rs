use std::iter::once;

use serde::{Deserialize, Serialize};
use temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use type_system::{
    repr,
    url::{BaseUrl, VersionedUrl},
    EntityType, ParseEntityTypeError,
};
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{schema, Ref, RefOr, Schema},
    ToSchema,
};

use crate::ontology::{
    CustomOntologyMetadata, OntologyElementMetadata, OntologyTemporalMetadata, OntologyType,
    OntologyTypeRecordId, OntologyTypeReference, OntologyTypeWithMetadata,
    PartialCustomOntologyMetadata,
};
#[cfg(feature = "utoipa")]
use crate::provenance::{OwnedById, ProvenanceMetadata};

/// A [`CustomEntityTypeMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialCustomEntityTypeMetadata {
    pub label_property: Option<BaseUrl>,
    pub common: PartialCustomOntologyMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEntityTypeMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_property: Option<BaseUrl>,
    #[serde(flatten)]
    pub common: CustomOntologyMetadata,
}

// Utoipa does not know how to generate a schema for flattend enumerations
#[cfg(feature = "utoipa")]
impl ToSchema<'static> for CustomEntityTypeMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "CustomEntityTypeMetadata",
            Schema::OneOf(
                schema::OneOfBuilder::new()
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("CustomOwnedEntityTypeMetadata"))
                            .property("labelProperty", Ref::from_schema_name("SHARED_BaseUrl"))
                            .property(
                                "provenance",
                                Ref::from_schema_name(ProvenanceMetadata::schema().0),
                            )
                            .required("provenance")
                            .property(
                                "temporalVersioning",
                                Ref::from_schema_name(OntologyTemporalMetadata::schema().0),
                            )
                            .required("temporalVersioning")
                            .property("ownedById", Ref::from_schema_name(OwnedById::schema().0))
                            .required("ownedById")
                            .build(),
                    )
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("CustomExternalEntityTypeMetadata"))
                            .property("labelProperty", Ref::from_schema_name("SHARED_BaseUrl"))
                            .property(
                                "provenance",
                                Ref::from_schema_name(ProvenanceMetadata::schema().0),
                            )
                            .required("provenance")
                            .property(
                                "temporalVersioning",
                                Ref::from_schema_name(OntologyTemporalMetadata::schema().0),
                            )
                            .required("temporalVersioning")
                            .property(
                                "fetchedAt",
                                schema::ObjectBuilder::new()
                                    .schema_type(schema::SchemaType::String),
                            )
                            .required("fetchedAt")
                            .build(),
                    )
                    .build(),
            )
            .into(),
        )
    }
}

/// An [`EntityTypeMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialEntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub custom: PartialCustomEntityTypeMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub custom: CustomEntityTypeMetadata,
}

impl EntityTypeMetadata {
    #[must_use]
    pub fn from_partial(
        partial: PartialEntityTypeMetadata,
        transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    ) -> Self {
        Self {
            record_id: partial.record_id,
            custom: match partial.custom {
                PartialCustomEntityTypeMetadata {
                    label_property,
                    common:
                        PartialCustomOntologyMetadata::Owned {
                            provenance,
                            owned_by_id,
                        },
                } => CustomEntityTypeMetadata {
                    label_property,
                    common: CustomOntologyMetadata::Owned {
                        provenance,
                        temporal_versioning: OntologyTemporalMetadata { transaction_time },
                        owned_by_id,
                    },
                },
                PartialCustomEntityTypeMetadata {
                    label_property,
                    common:
                        PartialCustomOntologyMetadata::External {
                            provenance,
                            fetched_at,
                        },
                } => CustomEntityTypeMetadata {
                    label_property,
                    common: CustomOntologyMetadata::External {
                        provenance,
                        temporal_versioning: OntologyTemporalMetadata { transaction_time },
                        fetched_at,
                    },
                },
            },
        }
    }
}

impl From<EntityTypeMetadata> for OntologyElementMetadata {
    fn from(value: EntityTypeMetadata) -> Self {
        Self {
            record_id: value.record_id,
            custom: value.custom.common,
        }
    }
}

impl OntologyType for EntityType {
    type ConversionError = ParseEntityTypeError;
    type Metadata = EntityTypeMetadata;
    type Representation = repr::EntityType;

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
