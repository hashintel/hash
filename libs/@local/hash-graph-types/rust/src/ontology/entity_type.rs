use std::iter::once;

use serde::{Deserialize, Serialize};
use temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use type_system::{
    raw,
    url::{BaseUrl, VersionedUrl},
    EntityType, ParseEntityTypeError,
};
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{schema, Ref, RefOr, Schema},
    ToSchema,
};

use crate::{
    ontology::{
        CustomOntologyMetadata, OntologyElementMetadata, OntologyTemporalMetadata, OntologyType,
        OntologyTypeRecordId, OntologyTypeReference, OntologyTypeWithMetadata,
        PartialCustomOntologyMetadata,
    },
    provenance::ProvenanceMetadata,
};

/// An [`EntityTypeMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialEntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub label_property: Option<BaseUrl>,
    pub icon: Option<String>,
    pub custom: PartialCustomOntologyMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_property: Option<BaseUrl>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub custom: CustomOntologyMetadata,
}

impl EntityTypeMetadata {
    #[must_use]
    pub fn from_partial(
        partial: PartialEntityTypeMetadata,
        provenance: ProvenanceMetadata,
        transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    ) -> Self {
        Self {
            record_id: partial.record_id,
            label_property: partial.label_property,
            icon: partial.icon,
            custom: match partial.custom {
                PartialCustomOntologyMetadata::Owned { owned_by_id } => {
                    CustomOntologyMetadata::Owned {
                        provenance,
                        temporal_versioning: OntologyTemporalMetadata { transaction_time },
                        owned_by_id,
                    }
                }
                PartialCustomOntologyMetadata::External { fetched_at } => {
                    CustomOntologyMetadata::External {
                        provenance,
                        temporal_versioning: OntologyTemporalMetadata { transaction_time },
                        fetched_at,
                    }
                }
            },
        }
    }
}

impl From<EntityTypeMetadata> for OntologyElementMetadata {
    fn from(value: EntityTypeMetadata) -> Self {
        Self {
            record_id: value.record_id,
            custom: value.custom,
        }
    }
}

impl OntologyType for EntityType {
    type ConversionError = ParseEntityTypeError;
    type Metadata = EntityTypeMetadata;
    type Representation = raw::EntityType;

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
