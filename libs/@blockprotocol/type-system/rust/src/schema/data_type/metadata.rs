use std::collections::HashMap;

#[cfg(feature = "utoipa")]
use utoipa::{
    ToSchema,
    openapi::{ObjectBuilder, Ref, RefOr, Schema, schema},
};

use super::{Conversions, DataType};
use crate::{
    ontology::{
        OntologyTemporalMetadata, OntologyTypeWithMetadata,
        provenance::{OntologyOwnership, OntologyProvenance},
    },
    url::{BaseUrl, OntologyTypeRecordId},
};

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    #[serde(flatten)]
    pub ownership: OntologyOwnership,
    pub temporal_versioning: OntologyTemporalMetadata,
    pub provenance: OntologyProvenance,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub conversions: HashMap<BaseUrl, Conversions>,
}

#[cfg(feature = "utoipa")]
impl ToSchema<'static> for DataTypeMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "DataTypeMetadata",
            Schema::OneOf(
                schema::OneOfBuilder::new()
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("OwnedDataTypeMetadata"))
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
                            .property(
                                "conversions",
                                ObjectBuilder::new().additional_properties(Some(
                                    Ref::from_schema_name("Conversions"),
                                )),
                            )
                            .build(),
                    )
                    .item(
                        schema::ObjectBuilder::new()
                            .title(Some("ExternalDataTypeMetadata"))
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
                            .property(
                                "conversions",
                                ObjectBuilder::new().additional_properties(Some(
                                    Ref::from_schema_name("Conversions"),
                                )),
                            )
                            .build(),
                    )
                    .build(),
            )
            .into(),
        )
    }
}

pub type DataTypeWithMetadata = OntologyTypeWithMetadata<DataType>;

#[cfg(feature = "utoipa")]
// Utoipa's signature is too... not generic enough, thus we have to implement it for all ontology
// types.
impl ToSchema<'static> for DataTypeWithMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "DataTypeWithMetadata",
            schema::ObjectBuilder::new()
                .property("schema", Ref::from_schema_name("DataType"))
                .required("schema")
                .property(
                    "metadata",
                    Ref::from_schema_name(DataTypeMetadata::schema().0),
                )
                .required("metadata")
                .build()
                .into(),
        )
    }
}
