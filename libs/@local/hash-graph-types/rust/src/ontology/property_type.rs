use type_system::{raw, url::VersionedUrl, ParsePropertyTypeError, PropertyType};
#[cfg(feature = "utoipa")]
use utoipa::{
    openapi::{schema, Ref, RefOr, Schema},
    ToSchema,
};

use crate::ontology::{
    OntologyElementMetadata, OntologyType, OntologyTypeReference, OntologyTypeWithMetadata,
};

impl OntologyType for PropertyType {
    type ConversionError = ParsePropertyTypeError;
    type Metadata = OntologyElementMetadata;
    type Representation = raw::PropertyType;

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
                    Ref::from_schema_name(OntologyElementMetadata::schema().0),
                )
                .required("metadata")
                .build()
                .into(),
        )
    }
}
