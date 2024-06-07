#[cfg(feature = "postgres")]
use postgres_types::FromSql;
#[cfg(feature = "postgres")]
use postgres_types::ToSql;
use serde::{Deserialize, Serialize};
use type_system::{url::VersionedUrl, DataType};
#[cfg(feature = "utoipa")]
use utoipa::openapi::schema;
#[cfg(feature = "utoipa")]
use utoipa::openapi::Ref;
#[cfg(feature = "utoipa")]
use utoipa::openapi::RefOr;
#[cfg(feature = "utoipa")]
use utoipa::openapi::Schema;
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;
use uuid::Uuid;

use crate::ontology::{
    OntologyProvenance, OntologyTemporalMetadata, OntologyType, OntologyTypeClassificationMetadata,
    OntologyTypeRecordId, OntologyTypeReference, OntologyTypeWithMetadata,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[repr(transparent)]
pub struct DataTypeId(Uuid);

impl DataTypeId {
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

/// A [`DataTypeMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialDataTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub classification: OntologyTypeClassificationMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    #[serde(flatten)]
    pub classification: OntologyTypeClassificationMetadata,
    pub temporal_versioning: OntologyTemporalMetadata,
    pub provenance: OntologyProvenance,
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
                            .build(),
                    )
                    .build(),
            )
            .into(),
        )
    }
}

impl OntologyType for DataType {
    type Metadata = DataTypeMetadata;

    fn id(&self) -> &VersionedUrl {
        self.id()
    }

    fn traverse_references(&self) -> Vec<OntologyTypeReference> {
        vec![]
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
                .property("schema", Ref::from_schema_name("VAR_DATA_TYPE"))
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
