//! # HASH Graph Validation
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(extend_one)]

extern crate alloc;

pub use self::entity_type::{EntityPreprocessor, EntityValidationError};

mod entity_type;
mod property;
mod test_data_type;
mod test_property_type;

use core::{borrow::Borrow, error::Error};

use error_stack::Report;
use hash_graph_store::entity::ValidateEntityComponents;
use type_system::knowledge::{Entity, entity::EntityId};

pub trait Validate<S, C> {
    type Report: Send + Sync;

    fn validate(
        &self,
        schema: &S,
        components: ValidateEntityComponents,
        context: &C,
    ) -> impl Future<Output = Self::Report> + Send;
}

pub trait EntityProvider {
    fn provide_entity(
        &self,
        entity_id: EntityId,
    ) -> impl Future<
        Output = Result<
            impl Borrow<Entity> + Send + Sync,
            Report<impl Error + Send + Sync + 'static>,
        >,
    > + Send;
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::iter;
    use std::collections::HashMap;

    use error_stack::ResultExt as _;
    use hash_graph_store::entity::ValidateEntityComponents;
    use hash_graph_temporal_versioning::{
        ClosedTemporalBound, Interval, OpenTemporalBound, Timestamp,
    };
    use hash_graph_types::{
        knowledge::property::visitor::{
            EntityVisitor as _, ObjectValidationReport, PropertyValidationReport,
            ValueValidationReport,
        },
        ontology::{DataTypeLookup, OntologyTypeProvider},
    };
    use serde::Deserialize as _;
    use serde_json::Value as JsonValue;
    use thiserror::Error;
    use type_system::{
        knowledge::{
            entity::id::EntityUuid,
            property::{
                Property, PropertyObject, PropertyObjectWithMetadata, PropertyValueWithMetadata,
                PropertyWithMetadata, metadata::PropertyMetadata,
            },
            value::{ValueMetadata, metadata::ValueProvenance},
        },
        ontology::{
            DataTypeWithMetadata, OntologyTemporalMetadata,
            data_type::{
                ClosedDataType, ConversionExpression, DataType, DataTypeMetadata, DataTypeUuid,
                schema::DataTypeReference,
            },
            entity_type::{ClosedEntityType, ClosedMultiEntityType, EntityType, EntityTypeUuid},
            id::{BaseUrl, OntologyTypeRecordId, VersionedUrl},
            json_schema::OntologyTypeResolver,
            property_type::PropertyType,
            provenance::{
                OntologyEditionProvenance, OntologyOwnership, OntologyProvenance,
                ProvidedOntologyEditionProvenance,
            },
        },
        principal::{
            actor::{ActorEntityUuid, ActorType},
            actor_group::WebId,
        },
        provenance::{OriginProvenance, OriginType},
    };
    use uuid::Uuid;

    use super::*;

    fn generate_data_type_metadata(schema: DataType) -> DataTypeWithMetadata {
        let actor = EntityUuid::new(Uuid::nil());
        DataTypeWithMetadata {
            metadata: DataTypeMetadata {
                record_id: OntologyTypeRecordId::from(schema.id.clone()),
                ownership: OntologyOwnership::Local {
                    web_id: WebId::new(actor),
                },
                temporal_versioning: OntologyTemporalMetadata {
                    transaction_time: Interval::new(
                        ClosedTemporalBound::Inclusive(Timestamp::now()),
                        OpenTemporalBound::Unbounded,
                    ),
                },
                provenance: OntologyProvenance {
                    edition: OntologyEditionProvenance {
                        created_by_id: ActorEntityUuid::new(actor),
                        archived_by_id: None,
                        user_defined: ProvidedOntologyEditionProvenance {
                            actor_type: ActorType::User,
                            origin: OriginProvenance::from_empty_type(OriginType::Api),
                            sources: Vec::new(),
                        },
                    },
                },
                conversions: HashMap::default(),
            },
            schema,
        }
    }

    struct Provider {
        entities: HashMap<EntityId, Entity>,
        entity_types: HashMap<VersionedUrl, Arc<ClosedEntityType>>,
        property_types: HashMap<VersionedUrl, Arc<PropertyType>>,
        data_types: HashMap<DataTypeUuid, Arc<DataTypeWithMetadata>>,
    }
    impl Provider {
        fn new(
            entities: impl IntoIterator<Item = Entity>,
            entity_types: impl IntoIterator<Item = ClosedEntityType>,
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
                    .map(|schema| (schema.id.clone(), Arc::new(schema)))
                    .collect(),
                property_types: property_types
                    .into_iter()
                    .map(|schema| (schema.id.clone(), Arc::new(schema)))
                    .collect(),
                data_types: data_types
                    .into_iter()
                    .map(|schema| {
                        (
                            DataTypeUuid::from_url(&schema.id),
                            Arc::new(generate_data_type_metadata(schema)),
                        )
                    })
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
    #[error("data type was not found")]
    struct InvalidDataType;

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

    impl OntologyTypeProvider<ClosedEntityType> for Provider {
        type Value = Arc<ClosedEntityType>;

        #[expect(refining_impl_trait)]
        async fn provide_type(
            &self,
            type_id: &VersionedUrl,
        ) -> Result<Arc<ClosedEntityType>, Report<InvalidEntityType>> {
            self.entity_types
                .get(type_id)
                .map(Arc::clone)
                .ok_or_else(|| {
                    Report::new(InvalidEntityType {
                        id: type_id.clone(),
                    })
                })
        }
    }

    impl OntologyTypeProvider<PropertyType> for Provider {
        type Value = Arc<PropertyType>;

        #[expect(refining_impl_trait)]
        async fn provide_type(
            &self,
            type_id: &VersionedUrl,
        ) -> Result<Arc<PropertyType>, Report<InvalidPropertyType>> {
            self.property_types
                .get(type_id)
                .map(Arc::clone)
                .ok_or_else(|| {
                    Report::new(InvalidPropertyType {
                        id: type_id.clone(),
                    })
                })
        }
    }

    impl DataTypeLookup for Provider {
        type ClosedDataType = ClosedDataType;
        type DataTypeWithMetadata = Arc<DataTypeWithMetadata>;
        type Error = InvalidDataType;

        async fn lookup_data_type_by_uuid(
            &self,
            data_type_uuid: DataTypeUuid,
        ) -> Result<Arc<DataTypeWithMetadata>, Report<InvalidDataType>> {
            self.data_types
                .get(&data_type_uuid)
                .map(Arc::clone)
                .ok_or_else(|| Report::new(InvalidDataType))
        }

        async fn lookup_closed_data_type_by_uuid(
            &self,
            data_type_uuid: DataTypeUuid,
        ) -> Result<Self::ClosedDataType, Report<Self::Error>> {
            let mut ontology_type_resolver = OntologyTypeResolver::default();

            for (data_type_id, data_type) in &self.data_types {
                ontology_type_resolver
                    .add_unresolved_data_type(*data_type_id, Arc::new(data_type.schema.clone()));
            }

            let schema_metadata = ontology_type_resolver
                .resolve_data_type_metadata(data_type_uuid)
                .change_context(InvalidDataType)?;
            let data_type = self
                .data_types
                .get(&data_type_uuid)
                .ok_or_else(|| Report::new(InvalidDataType))?;

            ClosedDataType::from_resolve_data(data_type.schema.clone(), &schema_metadata)
                .change_context(InvalidDataType)
        }

        async fn is_parent_of(
            &self,
            child: &DataTypeReference,
            parent: &BaseUrl,
        ) -> Result<bool, Report<InvalidDataType>> {
            Ok(self
                .lookup_data_type_by_ref(child)
                .await?
                .schema
                .all_of
                .iter()
                .any(|id| id.url.base_url == *parent))
        }

        #[expect(refining_impl_trait)]
        async fn find_conversion(
            &self,
            _: &DataTypeReference,
            _: &DataTypeReference,
        ) -> Result<Vec<ConversionExpression>, Report<InvalidDataType>> {
            Ok(Vec::new())
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
    ) -> Result<PropertyObjectWithMetadata, ObjectValidationReport> {
        let mut ontology_type_resolver = OntologyTypeResolver::default();
        let entity_types = entity_types
            .into_iter()
            .map(|entity_type| {
                let entity_type = serde_json::from_str::<EntityType>(entity_type)
                    .expect("failed to parse entity type");
                let entity_type_id = EntityTypeUuid::from_url(&entity_type.id);
                ontology_type_resolver
                    .add_unresolved_entity_type(entity_type_id, Arc::new(entity_type.clone()));
                (entity_type_id, entity_type)
            })
            .collect::<Vec<_>>();

        let entity_type =
            serde_json::from_str::<EntityType>(entity_type).expect("failed to parse entity type");
        let entity_type_uuid = EntityTypeUuid::from_url(&entity_type.id);
        ontology_type_resolver
            .add_unresolved_entity_type(entity_type_uuid, Arc::new(entity_type.clone()));

        let resolved_data = ontology_type_resolver
            .resolve_entity_type_metadata(entity_type_uuid)
            .expect("entity type not resolved");
        let closed_entity_type = ClosedEntityType::from_resolve_data(entity_type, &resolved_data)
            .expect("Could not close entity type");
        let closed_multi_entity_type =
            ClosedMultiEntityType::from_multi_type_closed_schema(iter::once(closed_entity_type))
                .expect("Could not close multi entity type");

        let entity_types = entity_types
            .into_iter()
            .map(|(entity_type_uuid, entity_type)| {
                let resolved_data = ontology_type_resolver
                    .resolve_entity_type_metadata(entity_type_uuid)
                    .expect("entity type not resolved");
                ClosedEntityType::from_resolve_data(entity_type, &resolved_data)
                    .expect("Could not close entity type")
            })
            .collect::<Vec<_>>();

        let provider = Provider::new(
            entities,
            entity_types,
            property_types.into_iter().map(|property_type| {
                serde_json::from_str(property_type).expect("failed to parse property type")
            }),
            data_types.into_iter().map(|data_type| {
                serde_json::from_str(data_type).expect("failed to parse data type")
            }),
        );

        let mut properties = PropertyObjectWithMetadata::from_parts(
            serde_json::from_str::<PropertyObject>(entity).expect("failed to read entity string"),
            None,
        )
        .expect("failed to create property with metadata");

        EntityPreprocessor { components }
            .visit_object(&closed_multi_entity_type, &mut properties, &provider)
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
    ) -> Result<PropertyWithMetadata, PropertyValidationReport> {
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
        value: JsonValue,
        data_type: &str,
        data_types: impl IntoIterator<Item = &'static str> + Send,
        components: ValidateEntityComponents,
    ) -> Result<PropertyValueWithMetadata, ValueValidationReport> {
        let mut value = serde_json::from_value(value).expect("failed to parse value");
        let mut provider = Provider::new(
            [],
            [],
            [],
            data_types.into_iter().map(|data_type| {
                serde_json::from_str(data_type)
                    .attach_printable(data_type)
                    .expect("failed to parse data type")
            }),
        );

        let data_type = serde_json::from_str::<DataType>(data_type)
            .attach_printable(data_type.to_owned())
            .expect("failed to parse data type");
        let data_type_ref = DataTypeReference {
            url: data_type.id.clone(),
        };
        provider.data_types.insert(
            DataTypeUuid::from_url(&data_type.id),
            Arc::new(generate_data_type_metadata(data_type)),
        );

        let mut metadata = ValueMetadata {
            data_type_id: Some(data_type_ref.url.clone()),
            original_data_type_id: Some(data_type_ref.url.clone()),
            provenance: ValueProvenance::default(),
            confidence: None,
            canonical: HashMap::default(),
        };

        EntityPreprocessor { components }
            .visit_value(&data_type_ref, &mut value, &mut metadata, &provider)
            .await?;
        Ok(PropertyValueWithMetadata { value, metadata })
    }
}
