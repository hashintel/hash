#[cfg(feature = "utoipa")]
use utoipa::{
    ToSchema,
    openapi::{Ref, RefOr, Schema, schema},
};

use super::PropertyType;
use crate::{
    ontology::{
        OntologyTemporalMetadata, OntologyTypeWithMetadata,
        provenance::{OntologyOwnership, OntologyProvenance},
    },
    url::OntologyTypeRecordId,
};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    #[serde(flatten)]
    pub ownership: OntologyOwnership,
    pub temporal_versioning: OntologyTemporalMetadata,
    pub provenance: OntologyProvenance,
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
                            .property("provenance", Ref::from_schema_name("OntologyProvenance"))
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

pub type PropertyTypeWithMetadata = OntologyTypeWithMetadata<PropertyType>;

#[cfg(feature = "utoipa")]
impl ToSchema<'static> for PropertyTypeWithMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "PropertyTypeWithMetadata",
            schema::ObjectBuilder::new()
                .property("schema", Ref::from_schema_name("PropertyType"))
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
