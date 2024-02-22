#![feature(lint_reasons)]
#![expect(
    clippy::missing_errors_doc,
    reason = "It's obvious that validation may error on invalid data."
)]

pub mod error;

pub use self::{
    data_type::{DataTypeConstraint, DataValidationError, JsonSchemaValueType},
    entity_type::EntityValidationError,
    property_type::PropertyValidationError,
};

mod data_type;
mod entity_type;
mod property_type;

use std::{borrow::Borrow, future::Future};

use error_stack::{Context, Report};
use graph_types::knowledge::entity::{Entity, EntityId};
use serde::Deserialize;
use type_system::{
    url::{BaseUrl, VersionedUrl},
    EntityType,
};

trait Schema<V: ?Sized, P: Sync> {
    type Error: Context;

    fn validate_value<'a>(
        &'a self,
        value: &'a V,
        profile: ValidationProfile,
        provider: &'a P,
    ) -> impl Future<Output = Result<(), Report<Self::Error>>> + Send + 'a;
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct Valid<T> {
    value: T,
}

impl<T> Valid<T> {
    pub async fn new<S, C>(
        value: T,
        schema: S,
        profile: ValidationProfile,
        context: C,
    ) -> Result<Self, Report<T::Error>>
    where
        T: Validate<S, C> + Send,
        S: Send,
        C: Send,
    {
        value.validate(&schema, profile, &context).await?;
        Ok(Self { value })
    }

    pub fn into_unvalidated(self) -> T {
        self.value
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum ValidationProfile {
    Full,
    Draft,
}

impl<T> AsRef<T> for Valid<T> {
    fn as_ref(&self) -> &T {
        &self.value
    }
}

impl<T> Borrow<T> for Valid<T> {
    fn borrow(&self) -> &T {
        &self.value
    }
}

pub trait Validate<S, C> {
    type Error: Context;

    fn validate(
        &self,
        schema: &S,
        profile: ValidationProfile,
        context: &C,
    ) -> impl Future<Output = Result<(), Report<Self::Error>>> + Send;
}

pub trait OntologyTypeProvider<O> {
    fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> impl Future<Output = Result<impl Borrow<O> + Send, Report<impl Context>>> + Send;
}

pub trait EntityTypeProvider: OntologyTypeProvider<EntityType> {
    fn is_parent_of(
        &self,
        child: &VersionedUrl,
        parent: &BaseUrl,
    ) -> impl Future<Output = Result<bool, Report<impl Context>>> + Send;
}
pub trait EntityProvider {
    fn provide_entity(
        &self,
        entity_id: EntityId,
        include_drafts: bool,
    ) -> impl Future<Output = Result<impl Borrow<Entity> + Send, Report<impl Context>>> + Send;
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use graph_types::knowledge::entity::EntityProperties;
    use serde_json::Value as JsonValue;
    use thiserror::Error;
    use type_system::{DataType, PropertyType};

    use super::*;
    use crate::error::install_error_stack_hooks;

    struct Provider {
        entities: HashMap<EntityId, Entity>,
        entity_types: HashMap<VersionedUrl, EntityType>,
        property_types: HashMap<VersionedUrl, PropertyType>,
        data_types: HashMap<VersionedUrl, DataType>,
    }
    impl Provider {
        fn new(
            entities: impl IntoIterator<Item = Entity>,
            entity_types: impl IntoIterator<Item = EntityType>,
            property_types: impl IntoIterator<Item = PropertyType>,
            data_types: impl IntoIterator<Item = DataType>,
        ) -> Self {
            Self {
                entities: entities
                    .into_iter()
                    .map(|entity| (entity.metadata.record_id.entity_id, entity))
                    .collect(),
                entity_types: entity_types
                    .into_iter()
                    .map(|schema| (schema.id().clone(), schema))
                    .collect(),
                property_types: property_types
                    .into_iter()
                    .map(|schema| (schema.id().clone(), schema))
                    .collect(),
                data_types: data_types
                    .into_iter()
                    .map(|schema| (schema.id().clone(), schema))
                    .collect(),
            }
        }
    }

    #[derive(Debug, Error)]
    #[error("entity was not found: `{id}`")]
    struct InvalidEntity {
        id: EntityId,
    }

    #[derive(Debug, Error)]
    #[error("entity type was not found: `{id}`")]
    struct InvalidEntityType {
        id: VersionedUrl,
    }

    #[derive(Debug, Error)]
    #[error("property type was not found: `{id}`")]
    struct InvalidPropertyType {
        id: VersionedUrl,
    }
    #[derive(Debug, Error)]
    #[error("data type was not found: `{id}`")]
    struct InvalidDataType {
        id: VersionedUrl,
    }

    impl EntityProvider for Provider {
        async fn provide_entity(
            &self,
            entity_id: EntityId,
            _: bool,
        ) -> Result<&Entity, Report<InvalidEntity>> {
            self.entities
                .get(&entity_id)
                .ok_or_else(|| Report::new(InvalidEntity { id: entity_id }))
        }
    }

    impl EntityTypeProvider for Provider {
        async fn is_parent_of(
            &self,
            child: &VersionedUrl,
            parent: &BaseUrl,
        ) -> Result<bool, Report<InvalidEntityType>> {
            Ok(
                OntologyTypeProvider::<EntityType>::provide_type(self, child)
                    .await?
                    .inherits_from()
                    .all_of()
                    .iter()
                    .any(|id| id.url().base_url == *parent),
            )
        }
    }

    impl OntologyTypeProvider<EntityType> for Provider {
        async fn provide_type(
            &self,
            type_id: &VersionedUrl,
        ) -> Result<&EntityType, Report<InvalidEntityType>> {
            self.entity_types.get(type_id).ok_or_else(|| {
                Report::new(InvalidEntityType {
                    id: type_id.clone(),
                })
            })
        }
    }

    impl OntologyTypeProvider<PropertyType> for Provider {
        async fn provide_type(
            &self,
            type_id: &VersionedUrl,
        ) -> Result<&PropertyType, Report<InvalidPropertyType>> {
            self.property_types.get(type_id).ok_or_else(|| {
                Report::new(InvalidPropertyType {
                    id: type_id.clone(),
                })
            })
        }
    }

    impl OntologyTypeProvider<DataType> for Provider {
        async fn provide_type(
            &self,
            type_id: &VersionedUrl,
        ) -> Result<&DataType, Report<InvalidDataType>> {
            self.data_types.get(type_id).ok_or_else(|| {
                Report::new(InvalidDataType {
                    id: type_id.clone(),
                })
            })
        }
    }

    pub(crate) async fn validate_entity(
        entity: &'static str,
        entity_type: &'static str,
        entities: impl IntoIterator<Item = Entity> + Send,
        entity_types: impl IntoIterator<Item = &'static str> + Send,
        property_types: impl IntoIterator<Item = &'static str> + Send,
        data_types: impl IntoIterator<Item = &'static str> + Send,
        profile: ValidationProfile,
    ) -> Result<(), Report<EntityValidationError>> {
        install_error_stack_hooks();

        let provider = Provider::new(
            entities,
            entity_types.into_iter().map(|entity_type| {
                serde_json::from_str(entity_type).expect("failed to parse entity type")
            }),
            property_types.into_iter().map(|property_type| {
                serde_json::from_str(property_type).expect("failed to parse property type")
            }),
            data_types.into_iter().map(|data_type| {
                serde_json::from_str(data_type).expect("failed to parse data type")
            }),
        );

        let entity_type: EntityType =
            serde_json::from_str(entity_type).expect("failed to parse entity type");

        let entity =
            serde_json::from_str::<EntityProperties>(entity).expect("failed to read entity string");

        entity.validate(&entity_type, profile, &provider).await
    }

    pub(crate) async fn validate_property(
        property: JsonValue,
        property_type: &'static str,
        property_types: impl IntoIterator<Item = &'static str> + Send,
        data_types: impl IntoIterator<Item = &'static str> + Send,
        profile: ValidationProfile,
    ) -> Result<(), Report<PropertyValidationError>> {
        install_error_stack_hooks();

        let provider = Provider::new(
            [],
            [],
            property_types.into_iter().map(|property_type| {
                serde_json::from_str(property_type).expect("failed to parse property type")
            }),
            data_types.into_iter().map(|data_type| {
                serde_json::from_str(data_type).expect("failed to parse data type")
            }),
        );

        let property_type: PropertyType =
            serde_json::from_str(property_type).expect("failed to parse property type");

        property.validate(&property_type, profile, &provider).await
    }

    pub(crate) async fn validate_data(
        data: JsonValue,
        data_type: &str,
        profile: ValidationProfile,
    ) -> Result<(), Report<DataValidationError>> {
        install_error_stack_hooks();

        let data_type: DataType =
            serde_json::from_str(data_type).expect("failed to parse data type");

        data.validate(&data_type, profile, &()).await
    }
}
