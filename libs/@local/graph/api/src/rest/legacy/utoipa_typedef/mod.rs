pub(crate) mod subgraph;

use serde::{Deserialize, Serialize};
use type_system::ontology::{
    data_type::{DataType, DataTypeMetadata},
    entity_type::{EntityType, EntityTypeMetadata},
    property_type::{PropertyType, PropertyTypeMetadata},
};
use utoipa::{
    ToSchema,
    openapi::{OneOfBuilder, Ref, RefOr, Schema},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum ListOrValue<T> {
    List(Vec<T>),
    Value(T),
}

// Utoipa doesn't seem to be able to generate sensible interfaces for this, it gets confused by
// the generic
impl<T> ListOrValue<T> {
    fn generate_schema(schema_name: &'static str) -> RefOr<Schema> {
        OneOfBuilder::new()
            .item(Ref::from_schema_name(schema_name))
            .item(Ref::from_schema_name(schema_name).to_array_builder())
            .into()
    }
}

pub(crate) type MaybeListOfDataTypeMetadata = ListOrValue<DataTypeMetadata>;
impl ToSchema<'_> for MaybeListOfDataTypeMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "MaybeListOfDataTypeMetadata",
            Self::generate_schema(DataTypeMetadata::schema().0),
        )
    }
}

pub(crate) type MaybeListOfPropertyTypeMetadata = ListOrValue<PropertyTypeMetadata>;
impl ToSchema<'_> for MaybeListOfPropertyTypeMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "MaybeListOfPropertyTypeMetadata",
            Self::generate_schema(PropertyTypeMetadata::schema().0),
        )
    }
}

pub(crate) type MaybeListOfEntityTypeMetadata = ListOrValue<EntityTypeMetadata>;
impl ToSchema<'_> for MaybeListOfEntityTypeMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "MaybeListOfEntityTypeMetadata",
            Self::generate_schema(EntityTypeMetadata::schema().0),
        )
    }
}

pub(crate) type MaybeListOfDataType = ListOrValue<DataType>;
impl ToSchema<'_> for MaybeListOfDataType {
    fn schema() -> (&'static str, RefOr<Schema>) {
        ("MaybeListOf", Self::generate_schema("DataType"))
    }
}

pub(crate) type MaybeListOfPropertyType = ListOrValue<PropertyType>;
impl ToSchema<'_> for MaybeListOfPropertyType {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "MaybeListOfPropertyType",
            Self::generate_schema("PropertyType"),
        )
    }
}

pub(crate) type MaybeListOfEntityType = ListOrValue<EntityType>;
impl ToSchema<'_> for MaybeListOfEntityType {
    fn schema() -> (&'static str, RefOr<Schema>) {
        ("MaybeListOfEntityType", Self::generate_schema("EntityType"))
    }
}

impl<T> IntoIterator for ListOrValue<T> {
    type IntoIter = alloc::vec::IntoIter<Self::Item>;
    type Item = T;

    fn into_iter(self) -> Self::IntoIter {
        match self {
            Self::List(list) => list.into_iter(),
            Self::Value(value) => vec![value].into_iter(),
        }
    }
}
