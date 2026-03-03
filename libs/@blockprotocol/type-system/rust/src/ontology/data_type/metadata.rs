use std::collections::HashMap;

#[cfg(feature = "utoipa")]
use utoipa::{
    ToSchema,
    openapi::{ObjectBuilder, Ref, RefOr, Schema, schema},
};

use super::{Conversions, DataType};
use crate::ontology::{
    OntologyTemporalMetadata, OntologyTypeWithMetadata,
    id::{BaseUrl, OntologyTypeRecordId},
    provenance::{OntologyOwnership, OntologyProvenance},
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

#[cfg(target_arch = "wasm32")]
#[expect(dead_code, reason = "Used in the generated TypeScript types")]
mod metadata_patch {
    use super::*;

    #[derive(tsify::Tsify)]
    #[serde(untagged)]
    enum DataTypeMetadata {
        #[serde(rename_all = "camelCase")]
        Impl {
            record_id: OntologyTypeRecordId,
            #[serde(flatten)]
            ownership: OntologyOwnership,
            temporal_versioning: OntologyTemporalMetadata,
            provenance: OntologyProvenance,
            #[serde(default, skip_serializing_if = "HashMap::is_empty")]
            conversions: HashMap<BaseUrl, Conversions>,
        },
    }
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
                            .property("webId", Ref::from_schema_name("WebId"))
                            .required("webId")
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

#[cfg(target_arch = "wasm32")]
#[expect(dead_code, reason = "Used in the generated TypeScript types")]
mod with_metadata_patch {
    use super::*;

    #[derive(tsify::Tsify)]
    struct DataTypeWithMetadata {
        schema: DataType,
        metadata: DataTypeMetadata,
    }
}

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
