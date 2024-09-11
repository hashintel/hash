#![feature(extend_one)]
#![feature(hash_raw_entry)]

pub mod error;

pub use self::entity_type::{EntityPreprocessor, EntityValidationError};

mod entity_type;
mod property;
mod test_data_type;
mod test_property_type;

use core::borrow::Borrow;

use error_stack::{Context, Report};
use graph_types::knowledge::entity::{Entity, EntityId};
use serde::Deserialize;

pub trait Schema<V: ?Sized, P: Sync> {
    type Error: Context;

    fn validate_value<'a>(
        &'a self,
        value: &'a V,
        components: ValidateEntityComponents,
        provider: &'a P,
    ) -> impl Future<Output = Result<(), Report<Self::Error>>> + Send + 'a;
}

const fn default_true() -> bool {
    true
}

#[derive(Debug, Copy, Clone, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidateEntityComponents {
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default = "default_true")]
    pub link_data: bool,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default = "default_true")]
    pub required_properties: bool,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default = "default_true")]
    pub num_items: bool,
}

impl ValidateEntityComponents {
    #[must_use]
    pub const fn full() -> Self {
        Self {
            link_data: true,
            required_properties: true,
            num_items: true,
        }
    }

    #[must_use]
    pub const fn draft() -> Self {
        Self {
            num_items: false,
            required_properties: false,
            ..Self::full()
        }
    }
}

impl Default for ValidateEntityComponents {
    fn default() -> Self {
        Self::full()
    }
}

pub trait Validate<S, C> {
    type Error: Context;

    fn validate(
        &self,
        schema: &S,
        components: ValidateEntityComponents,
        context: &C,
    ) -> impl Future<Output = Result<(), Report<Self::Error>>> + Send;
}

pub trait EntityProvider {
    fn provide_entity(
        &self,
        entity_id: EntityId,
    ) -> impl Future<Output = Result<impl Borrow<Entity> + Send + Sync, Report<impl Context>>> + Send;
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use graph_types::{
        account::{AccountId, EditionCreatedById},
        knowledge::property::{
            visitor::{EntityVisitor, TraversalError},
            Property, PropertyMetadata, PropertyObject, PropertyProvenance, PropertyWithMetadata,
            PropertyWithMetadataObject, PropertyWithMetadataValue, ValueMetadata,
        },
        ontology::{
            DataTypeMetadata, DataTypeProvider, DataTypeWithMetadata, EntityTypeProvider,
            OntologyEditionProvenance, OntologyProvenance, OntologyTemporalMetadata,
            OntologyTypeClassificationMetadata, OntologyTypeProvider, OntologyTypeRecordId,
            PropertyTypeProvider, ProvidedOntologyEditionProvenance,
        },
        owned_by_id::OwnedById,
    };
    use serde_json::Value as JsonValue;
    use temporal_versioning::{ClosedTemporalBound, Interval, OpenTemporalBound, Timestamp};
    use thiserror::Error;
    use type_system::{
        schema::{ClosedEntityType, DataType, EntityType, PropertyType},
        url::{BaseUrl, VersionedUrl},
    };
    use uuid::Uuid;

    use super::*;
    use crate::error::install_error_stack_hooks;

    fn generate_data_type_metadata(schema: DataType) -> DataTypeWithMetadata {
        let actor = AccountId::new(Uuid::nil());
        DataTypeWithMetadata {
            metadata: DataTypeMetadata {
                record_id: OntologyTypeRecordId::from(schema.id.clone()),
                classification: OntologyTypeClassificationMetadata::Owned {
                    owned_by_id: OwnedById::new(actor.into_uuid()),
                },
                temporal_versioning: OntologyTemporalMetadata {
                    transaction_time: Interval::new(
                        ClosedTemporalBound::Inclusive(Timestamp::now()),
                        OpenTemporalBound::Unbounded,
                    ),
                },
                provenance: OntologyProvenance {
                    edition: OntologyEditionProvenance {
                        created_by_id: EditionCreatedById::new(actor),
                        archived_by_id: None,
                        user_defined: ProvidedOntologyEditionProvenance::default(),
                    },
                },
                conversions: HashMap::default(),
            },
            schema,
        }
    }

    struct Provider {
        entities: HashMap<EntityId, Entity>,
        entity_types: HashMap<VersionedUrl, ClosedEntityType>,
        property_types: HashMap<VersionedUrl, PropertyType>,
        data_types: HashMap<VersionedUrl, DataTypeWithMetadata>,
    }
    impl Provider {
        fn new(
            entities: impl IntoIterator<Item = Entity>,
            entity_types: impl IntoIterator<Item = (VersionedUrl, ClosedEntityType)>,
            property_types: impl IntoIterator<Item = PropertyType>,
            data_types: impl IntoIterator<Item = DataType>,
        ) -> Self {
            Self {
                entities: entities
                    .into_iter()
                    .map(|entity| (entity.metadata.record_id.entity_id, entity))
                    .collect(),
                entity_types: entity_types.into_iter().collect(),
                property_types: property_types
                    .into_iter()
                    .map(|schema| (schema.id.clone(), schema))
                    .collect(),
                data_types: data_types
                    .into_iter()
                    .map(|schema| (schema.id.clone(), generate_data_type_metadata(schema)))
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
        #[expect(refining_impl_trait)]
        async fn provide_entity(
            &self,
            entity_id: EntityId,
        ) -> Result<&Entity, Report<InvalidEntity>> {
            self.entities
                .get(&entity_id)
                .ok_or_else(|| Report::new(InvalidEntity { id: entity_id }))
        }
    }

    impl EntityTypeProvider for Provider {
        #[expect(refining_impl_trait)]
        async fn is_parent_of(
            &self,
            child: &VersionedUrl,
            parent: &BaseUrl,
        ) -> Result<bool, Report<InvalidEntityType>> {
            Ok(
                OntologyTypeProvider::<ClosedEntityType>::provide_type(self, child)
                    .await?
                    .all_of
                    .iter()
                    .any(|id| id.url.base_url == *parent),
            )
        }
    }

    impl OntologyTypeProvider<ClosedEntityType> for Provider {
        #[expect(refining_impl_trait)]
        async fn provide_type(
            &self,
            type_id: &VersionedUrl,
        ) -> Result<&ClosedEntityType, Report<InvalidEntityType>> {
            self.entity_types.get(type_id).ok_or_else(|| {
                Report::new(InvalidEntityType {
                    id: type_id.clone(),
                })
            })
        }
    }

    impl OntologyTypeProvider<PropertyType> for Provider {
        #[expect(refining_impl_trait)]
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

    impl PropertyTypeProvider for Provider {}

    impl OntologyTypeProvider<DataTypeWithMetadata> for Provider {
        #[expect(refining_impl_trait)]
        async fn provide_type(
            &self,
            type_id: &VersionedUrl,
        ) -> Result<&DataTypeWithMetadata, Report<InvalidDataType>> {
            self.data_types.get(type_id).ok_or_else(|| {
                Report::new(InvalidDataType {
                    id: type_id.clone(),
                })
            })
        }
    }

    impl DataTypeProvider for Provider {
        #[expect(refining_impl_trait)]
        async fn is_parent_of(
            &self,
            child: &VersionedUrl,
            parent: &BaseUrl,
        ) -> Result<bool, Report<InvalidDataType>> {
            Ok(
                OntologyTypeProvider::<DataTypeWithMetadata>::provide_type(self, child)
                    .await?
                    .schema
                    .all_of
                    .iter()
                    .any(|id| id.url.base_url == *parent),
            )
        }

        #[expect(refining_impl_trait)]
        async fn has_children(
            &self,
            _data_type: &VersionedUrl,
        ) -> Result<bool, Report<InvalidDataType>> {
            Ok(false)
        }
    }

    pub(crate) async fn validate_entity(
        entity: &'static str,
        entity_type: &'static str,
        entities: impl IntoIterator<Item = Entity> + Send,
        entity_types: impl IntoIterator<Item = &'static str> + Send,
        property_types: impl IntoIterator<Item = &'static str> + Send,
        data_types: impl IntoIterator<Item = &'static str> + Send,
        components: ValidateEntityComponents,
    ) -> Result<PropertyWithMetadataObject, Report<TraversalError>> {
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

        let entity_type = ClosedEntityType::from(
            serde_json::from_str::<EntityType>(entity_type).expect("failed to parse entity type"),
        );

        let mut properties = PropertyWithMetadataObject::from_parts(
            serde_json::from_str::<PropertyObject>(entity).expect("failed to read entity string"),
            None,
        )
        .expect("failed to create property with metadata");

        EntityPreprocessor { components }
            .visit_object(&entity_type, &mut properties, &provider)
            .await?;

        Ok(properties)
    }

    pub(crate) async fn validate_property(
        property: JsonValue,
        metadata: Option<PropertyMetadata>,
        property_type: &'static str,
        property_types: impl IntoIterator<Item = &'static str> + Send,
        data_types: impl IntoIterator<Item = &'static str> + Send,
        components: ValidateEntityComponents,
    ) -> Result<PropertyWithMetadata, Report<TraversalError>> {
        install_error_stack_hooks();
        let property = Property::deserialize(property).expect("failed to deserialize property");

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

        let mut property = PropertyWithMetadata::from_parts(property, metadata)
            .expect("failed to create property with metadata");
        EntityPreprocessor { components }
            .visit_property(&property_type, &mut property, &provider)
            .await?;
        Ok(property)
    }

    pub(crate) async fn validate_data(
        mut value: JsonValue,
        data_type: &str,
        components: ValidateEntityComponents,
    ) -> Result<PropertyWithMetadataValue, Report<TraversalError>> {
        install_error_stack_hooks();

        let provider = Provider::new([], [], [], []);

        let data_type = generate_data_type_metadata(
            serde_json::from_str(data_type).expect("failed to parse data type"),
        );

        let mut metadata = ValueMetadata {
            data_type_id: Some(data_type.schema.id.clone()),
            provenance: PropertyProvenance::default(),
            confidence: None,
        };

        EntityPreprocessor { components }
            .visit_value(&data_type, &mut value, &mut metadata, &provider)
            .await?;
        Ok(PropertyWithMetadataValue { value, metadata })
    }
}
