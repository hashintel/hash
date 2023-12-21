use serde::{Deserialize, Serialize};
use type_system::{url::VersionedUrl, PropertyType};
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{schema, Ref, RefOr, Schema},
    ToSchema,
};

use crate::ontology::{
    OntologyProvenanceMetadata, OntologyTemporalMetadata, OntologyType,
    OntologyTypeClassificationMetadata, OntologyTypeRecordId, OntologyTypeReference,
    OntologyTypeWithMetadata,
};

/// An [`PropertyTypeMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialPropertyTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub classification: OntologyTypeClassificationMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    #[serde(flatten)]
    pub classification: OntologyTypeClassificationMetadata,
    pub temporal_versioning: OntologyTemporalMetadata,
    pub provenance: OntologyProvenanceMetadata,
}

#[cfg(feature = "utoipa")]
impl ToSchema<'static> for PropertyTypeMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "PropertyTypeMetadata",
            Schema::OneOf(
                schema::OneOfBuilder::new()
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("OwnedPropertyTypeMetadata"))
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
                            .build(),
                    )
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("ExternalPropertyTypeMetadata"))
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
                            .build(),
                    )
                    .build(),
            )
            .into(),
        )
    }
}

impl OntologyType for PropertyType {
    type Metadata = PropertyTypeMetadata;

    fn id(&self) -> &VersionedUrl {
        self.id()
    }

    fn traverse_references(&self) -> Vec<OntologyTypeReference> {
        self.property_type_references()
            .into_iter()
            .map(OntologyTypeReference::PropertyTypeReference)
            .chain(
                self.data_type_references()
                    .into_iter()
                    .map(OntologyTypeReference::DataTypeReference),
            )
            .collect()
    }
}

pub type PropertyTypeWithMetadata = OntologyTypeWithMetadata<PropertyType>;

#[cfg(feature = "utoipa")]
impl ToSchema<'static> for PropertyTypeWithMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "PropertyTypeWithMetadata",
            schema::ObjectBuilder::new()
                .property("schema", Ref::from_schema_name("VAR_PROPERTY_TYPE"))
                .required("schema")
                .property(
                    "metadata",
                    Ref::from_schema_name(PropertyTypeMetadata::schema().0),
                )
                .required("metadata")
                .build()
                .into(),
        )
    }
}
