use serde::{Deserialize, Serialize};
use type_system::repr;
use utoipa::{
    openapi::{OneOfBuilder, Ref, RefOr, Schema},
    ToSchema,
};

use crate::ontology::{EntityTypeMetadata, OntologyElementMetadata};

pub mod subgraph;

#[derive(Debug, Copy, Clone)]
enum Action {
    Load,
    Reference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ListOrValue<T> {
    List(Vec<T>),
    Value(T),
}

// Utoipa doesn't seem to be able to generate sensible interfaces for this, it gets confused by
// the generic
impl<T> ListOrValue<T> {
    fn generate_schema(schema_name: &'static str, action: Action) -> RefOr<Schema> {
        let schema_name = match action {
            Action::Load => format!("VAR_{schema_name}"),
            Action::Reference => schema_name.to_owned(),
        };

        OneOfBuilder::new()
            .item(Ref::from_schema_name(&schema_name))
            .item(Ref::from_schema_name(schema_name).to_array_builder())
            .into()
    }
}

pub type MaybeListOfOntologyElementMetadata = ListOrValue<OntologyElementMetadata>;
impl ToSchema<'_> for MaybeListOfOntologyElementMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "MaybeListOfOntologyElementMetadata",
            Self::generate_schema(OntologyElementMetadata::schema().0, Action::Reference),
        )
    }
}

pub type MaybeListOfEntityTypeMetadata = ListOrValue<EntityTypeMetadata>;
impl ToSchema<'_> for MaybeListOfEntityTypeMetadata {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "MaybeListOfEntityTypeMetadata",
            Self::generate_schema(EntityTypeMetadata::schema().0, Action::Reference),
        )
    }
}

pub type MaybeListOfDataType = ListOrValue<repr::DataType>;
impl ToSchema<'_> for MaybeListOfDataType {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "MaybeListOf",
            Self::generate_schema("data_type", Action::Load),
        )
    }
}

pub type MaybeListOfPropertyType = ListOrValue<repr::PropertyType>;
impl ToSchema<'_> for MaybeListOfPropertyType {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "MaybeListOfPropertyType",
            Self::generate_schema("property_type", Action::Load),
        )
    }
}

pub type MaybeListOfEntityType = ListOrValue<repr::EntityType>;
impl ToSchema<'_> for MaybeListOfEntityType {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "MaybeListOfEntityType",
            Self::generate_schema("entity_type", Action::Load),
        )
    }
}

impl<T> IntoIterator for ListOrValue<T> {
    type IntoIter = std::vec::IntoIter<Self::Item>;
    type Item = T;

    fn into_iter(self) -> Self::IntoIter {
        match self {
            Self::List(list) => list.into_iter(),
            Self::Value(value) => vec![value].into_iter(),
        }
    }
}
