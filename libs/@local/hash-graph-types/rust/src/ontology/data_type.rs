use type_system::{raw, url::VersionedUrl, DataType, ParseDataTypeError};
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{schema, Ref, RefOr, Schema},
    ToSchema,
};

use crate::ontology::{
    OntologyElementMetadata, OntologyType, OntologyTypeReference, OntologyTypeWithMetadata,
};

impl OntologyType for DataType {
    type ConversionError = ParseDataTypeError;
    type Metadata = OntologyElementMetadata;
    type Representation = raw::DataType;

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
                    Ref::from_schema_name(OntologyElementMetadata::schema().0),
                )
                .required("metadata")
                .build()
                .into(),
        )
    }
}
