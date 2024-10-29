use core::borrow::Borrow;
use std::collections::{HashSet, hash_map::RawEntryMut};

use error_stack::{Report, ReportSink, ResultExt};
use futures::{StreamExt, TryStreamExt, stream};
use graph_types::{
    knowledge::{
        entity::{Entity, EntityId},
        link::LinkData,
        property::{
            PropertyPath, PropertyWithMetadataArray, PropertyWithMetadataObject,
            PropertyWithMetadataValue, ValueMetadata,
            visitor::{
                EntityVisitor, TraversalError, walk_array, walk_object, walk_one_of_property_value,
                walk_value,
            },
        },
    },
    ontology::{
        DataTypeProvider, DataTypeWithMetadata, EntityTypeProvider, OntologyTypeProvider,
        PropertyTypeProvider,
    },
};
use serde_json::Value as JsonValue;
use thiserror::Error;
use type_system::{
    schema::{
        ClosedEntityType, ClosedMultiEntityType, ConstraintValidator, DataTypeReference,
        JsonSchemaValueType, PropertyObjectSchema, PropertyType, PropertyTypeReference,
        PropertyValueArray, PropertyValueSchema, PropertyValues, ValueOrArray,
    },
    url::{BaseUrl, OntologyTypeVersion, VersionedUrl},
};

use crate::{EntityProvider, Schema, Validate, ValidateEntityComponents};

#[derive(Debug, Error)]
pub enum EntityValidationError {
    #[error("The properties of the entity do not match the schema")]
    InvalidProperties,
    #[error("The entity is not a link but contains link data")]
    UnexpectedLinkData,
    #[error("The entity is a link but does not contain link data")]
    MissingLinkData,
    #[error("Entities without a type are not allowed")]
    EmptyEntityTypes,
    #[error("the validator was unable to read the entity type `{ids:?}`")]
    EntityTypeRetrieval { ids: HashSet<VersionedUrl> },
    #[error("the validator was unable to read the entity `{id}`")]
    EntityRetrieval { id: EntityId },
    #[error("The link type `{link_types:?}` is not allowed")]
    InvalidLinkTypeId { link_types: Vec<VersionedUrl> },
    #[error("The link target `{target_types:?}` is not allowed")]
    InvalidLinkTargetId { target_types: Vec<VersionedUrl> },
    #[error("The property path is invalid: `{path:?}`")]
    InvalidPropertyPath { path: PropertyPath<'static> },
}

impl<P> Validate<ClosedMultiEntityType, P> for Option<&LinkData>
where
    P: EntityProvider
        + EntityTypeProvider
        + OntologyTypeProvider<PropertyType>
        + OntologyTypeProvider<DataTypeWithMetadata>
        + Sync,
{
    type Error = EntityValidationError;

    async fn validate(
        &self,
        schema: &ClosedMultiEntityType,
        components: ValidateEntityComponents,
        context: &P,
    ) -> Result<(), Report<[Self::Error]>> {
        if !components.link_data {
            return Ok(());
        }

        let mut status = ReportSink::new();

        // TODO: The link type should be a const but the type system crate does not allow
        //       to make this a `const` variable.
        //   see https://linear.app/hash/issue/BP-57
        let link_type_id = VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/entity-type/link/".to_owned(),
            )
            .expect("Not a valid URL"),
            version: OntologyTypeVersion::new(1),
        };

        let mut is_link = false;
        for entity_type in &schema.all_of {
            if context
                .is_super_type_of(&link_type_id, &entity_type.id)
                .await
                .change_context_lazy(|| EntityValidationError::EntityTypeRetrieval {
                    ids: HashSet::from([entity_type.id.clone()]),
                })?
            {
                is_link = true;
                break;
            }
        }

        if let Some(link_data) = self {
            if !is_link {
                status.capture(EntityValidationError::UnexpectedLinkData);
            }

            if let Err(error) = schema.validate_value(*link_data, components, context).await {
                status.append(error);
            }
        } else if is_link {
            status.capture(EntityValidationError::MissingLinkData);
        }

        status.finish()
    }
}

impl<P> Validate<ClosedMultiEntityType, P> for Entity
where
    P: EntityProvider
        + EntityTypeProvider
        + OntologyTypeProvider<PropertyType>
        + DataTypeProvider
        + Sync,
{
    type Error = EntityValidationError;

    async fn validate(
        &self,
        schema: &ClosedMultiEntityType,
        components: ValidateEntityComponents,
        context: &P,
    ) -> Result<(), Report<[Self::Error]>> {
        let mut status = ReportSink::new();

        if self.metadata.entity_type_ids.is_empty() {
            status.capture(EntityValidationError::EmptyEntityTypes);
        }

        if let Err(error) = self
            .link_data
            .as_ref()
            .validate(schema, components, context)
            .await
        {
            status.append(error);
        }
        if let Err(error) = self
            .metadata
            .properties
            .validate(&self.properties, components, context)
            .await
        {
            status.append(error);
        }

        status.finish()
    }
}

impl<P> Schema<LinkData, P> for ClosedMultiEntityType
where
    P: EntityProvider + EntityTypeProvider + Sync,
{
    type Error = EntityValidationError;

    // TODO: validate link data
    //   see https://linear.app/hash/issue/H-972
    // TODO: Optimize reading of left/right parent types and/or cache them
    #[expect(clippy::too_many_lines)]
    async fn validate_value<'a>(
        &'a self,
        value: &'a LinkData,
        _: ValidateEntityComponents,
        provider: &'a P,
    ) -> Result<(), Report<[EntityValidationError]>> {
        let mut status = ReportSink::new();

        let left_entity = provider
            .provide_entity(value.left_entity_id)
            .await
            .change_context_lazy(|| EntityValidationError::EntityRetrieval {
                id: value.left_entity_id,
            })?;

        let left_entity_type = Self::from_multi_type_closed_schema(
            stream::iter(&left_entity.borrow().metadata.entity_type_ids)
                .then(|entity_type_url| async {
                    provider
                        .provide_type(entity_type_url)
                        .await
                        .map(|entity_type| entity_type.borrow().clone())
                })
                .try_collect::<Vec<ClosedEntityType>>()
                .await
                .change_context_lazy(|| EntityValidationError::EntityRetrieval {
                    id: value.left_entity_id,
                })?,
        )
        .change_context_lazy(|| EntityValidationError::EntityRetrieval {
            id: value.left_entity_id,
        })?;

        let right_entity = provider
            .provide_entity(value.right_entity_id)
            .await
            .change_context_lazy(|| EntityValidationError::EntityRetrieval {
                id: value.right_entity_id,
            })?;

        let right_entity_type = Self::from_multi_type_closed_schema(
            stream::iter(&right_entity.borrow().metadata.entity_type_ids)
                .then(|entity_type_url| async {
                    provider
                        .provide_type(entity_type_url)
                        .await
                        .map(|entity_type| entity_type.borrow().clone())
                })
                .try_collect::<Vec<ClosedEntityType>>()
                .await
                .change_context_lazy(|| EntityValidationError::EntityRetrieval {
                    id: value.right_entity_id,
                })?,
        )
        .change_context_lazy(|| EntityValidationError::EntityRetrieval {
            id: value.right_entity_id,
        })?;

        // We track that at least one link type was found to avoid reporting an error if no
        // link type was found.
        let mut found_link_target = false;
        let entity_type_ids = self
            .all_of
            .iter()
            .map(|entity_type| entity_type.id.clone())
            .collect::<Vec<_>>();
        let parent_entity_type_ids = provider
            .find_parents(&entity_type_ids)
            .await
            .change_context_lazy(|| EntityValidationError::EntityTypeRetrieval {
                ids: entity_type_ids.iter().cloned().collect(),
            })?;
        for link_type_id in entity_type_ids.into_iter().chain(parent_entity_type_ids) {
            let Some(maybe_allowed_targets) = left_entity_type.constraints.links.get(&link_type_id)
            else {
                continue;
            };

            // At least one link type was found
            found_link_target = true;

            let Some(allowed_targets) = &maybe_allowed_targets.items else {
                // For a given target there was an unconstrained link destination, so we can
                // skip the rest of the checks
                break;
            };

            // Link destinations are constrained, search for the right entity's type
            let mut found_match = false;
            'targets: for allowed_target in &allowed_targets.possibilities {
                if right_entity_type
                    .all_of
                    .iter()
                    .any(|entity_type| entity_type.id.base_url == allowed_target.url.base_url)
                {
                    found_match = true;
                    break;
                }
                for right_entity_type in &right_entity_type.all_of {
                    if provider
                        .is_super_type_of(&allowed_target.url, &right_entity_type.id)
                        .await
                        .change_context_lazy(|| EntityValidationError::EntityTypeRetrieval {
                            ids: HashSet::from([
                                right_entity_type.id.clone(),
                                allowed_target.url.clone(),
                            ]),
                        })?
                    {
                        found_match = true;
                        break 'targets;
                    }
                }
            }

            if found_match {
                break;
            }
            status.capture(EntityValidationError::InvalidLinkTargetId {
                target_types: right_entity_type
                    .all_of
                    .iter()
                    .map(|entity_type| entity_type.id.clone())
                    .collect(),
            });
        }

        if !found_link_target {
            status.capture(EntityValidationError::InvalidLinkTypeId {
                link_types: self
                    .all_of
                    .iter()
                    .map(|entity_type| entity_type.id.clone())
                    .collect(),
            });
        }

        status.finish()
    }
}

pub struct EntityPreprocessor {
    pub components: ValidateEntityComponents,
}

struct ValueValidator;

impl EntityVisitor for ValueValidator {
    async fn visit_value<P>(
        &mut self,
        data_type: &DataTypeWithMetadata,
        value: &mut JsonValue,
        metadata: &mut ValueMetadata,
        _: &P,
    ) -> Result<(), Report<[TraversalError]>>
    where
        P: DataTypeProvider + Sync,
    {
        let mut status = ReportSink::new();

        status.attempt(
            data_type
                .schema
                .constraints
                .validate_value(value)
                .change_context(TraversalError::ConstraintUnfulfilled),
        );

        if metadata.data_type_id.as_ref() == Some(&data_type.schema.id)
            && data_type.schema.r#abstract
        {
            status.capture(TraversalError::AbstractDataType {
                id: data_type.schema.id.clone(),
            });
        }

        status.finish()
    }
}

impl EntityVisitor for EntityPreprocessor {
    async fn visit_value<P>(
        &mut self,
        data_type: &DataTypeWithMetadata,
        value: &mut JsonValue,
        metadata: &mut ValueMetadata,
        type_provider: &P,
    ) -> Result<(), Report<[TraversalError]>>
    where
        P: DataTypeProvider + Sync,
    {
        let mut status = ReportSink::new();

        if let Some(data_type_url) = &metadata.data_type_id {
            if data_type.schema.id != *data_type_url {
                let is_compatible = type_provider
                    .is_parent_of(data_type_url, &data_type.schema.id.base_url)
                    .await
                    .change_context_lazy(|| TraversalError::DataTypeRetrieval {
                        id: DataTypeReference {
                            url: data_type.schema.id.clone(),
                        },
                    })?;

                if !is_compatible {
                    status.capture(TraversalError::InvalidDataType {
                        actual: data_type_url.clone(),
                        expected: data_type.schema.id.clone(),
                    });
                }

                let desired_data_type = type_provider
                    .provide_type(data_type_url)
                    .await
                    .change_context_lazy(|| TraversalError::DataTypeRetrieval {
                        id: DataTypeReference {
                            url: data_type.schema.id.clone(),
                        },
                    })?;

                if let Err(error) = ValueValidator
                    .visit_value(desired_data_type.borrow(), value, metadata, type_provider)
                    .await
                {
                    status.append(error);
                }
            }
        } else {
            status.capture(TraversalError::AmbiguousDataType);
        }

        if let Err(error) = ValueValidator
            .visit_value(data_type, value, metadata, type_provider)
            .await
        {
            status.append(error);
        }

        walk_value(
            &mut ValueValidator,
            data_type,
            value,
            metadata,
            type_provider,
        )
        .await?;

        status.finish()
    }

    #[expect(clippy::too_many_lines, reason = "Need to refactor this function")]
    async fn visit_one_of_property<P>(
        &mut self,
        schema: &[PropertyValues],
        property: &mut PropertyWithMetadataValue,
        type_provider: &P,
    ) -> Result<(), Report<[TraversalError]>>
    where
        P: DataTypeProvider + Sync,
    {
        let mut status = ReportSink::new();

        // We try to infer the data type ID
        // TODO: Remove when the data type ID is forced to be passed
        //   see https://linear.app/hash/issue/H-2800/validate-that-a-data-type-id-is-always-specified
        if property.metadata.data_type_id.is_none() {
            let mut infer_status = ReportSink::new();
            let mut possible_data_types = HashSet::new();

            for values in schema {
                if let PropertyValues::DataTypeReference(data_type_ref) = values {
                    let Some(data_type) = infer_status.attempt(
                        type_provider
                            .provide_type(&data_type_ref.url)
                            .await
                            .change_context_lazy(|| TraversalError::DataTypeRetrieval {
                                id: data_type_ref.clone(),
                            }),
                    ) else {
                        continue;
                    };

                    if data_type.borrow().schema.r#abstract {
                        infer_status.capture(TraversalError::AbstractDataType {
                            id: data_type_ref.url.clone(),
                        });
                        continue;
                    }

                    possible_data_types.insert(data_type_ref.url.clone());
                }
            }

            let inferred_successfully = status
                .attempt(
                    infer_status
                        .finish()
                        .change_context(TraversalError::DataTypeUnspecified),
                )
                .is_some();

            // Only if there is really a single valid data type ID, we set it. Note, that this is
            // done before the actual validation step.
            if inferred_successfully {
                if possible_data_types.len() == 1 {
                    property.metadata.data_type_id = possible_data_types.into_iter().next();
                } else {
                    status.capture(TraversalError::AmbiguousDataType);
                }
            }
        }

        if property.metadata.original_data_type_id.is_none() {
            // We fall back to the data type ID if the original data type ID is not set
            property
                .metadata
                .original_data_type_id
                .clone_from(&property.metadata.data_type_id);
        } else if let (Some(source_data_type_id), Some(target_data_type_id)) = (
            &property.metadata.original_data_type_id,
            &property.metadata.data_type_id,
        ) {
            if source_data_type_id != target_data_type_id {
                let conversions = type_provider
                    .find_conversion(source_data_type_id, target_data_type_id)
                    .await
                    .change_context_lazy(|| TraversalError::ConversionRetrieval {
                        current: DataTypeReference {
                            url: source_data_type_id.clone(),
                        },
                        target: DataTypeReference {
                            url: target_data_type_id.clone(),
                        },
                    })?;

                if let Some(mut value) = property.value.as_f64() {
                    for conversion in conversions.borrow() {
                        value = conversion.evaluate(value);
                    }
                    property.value = JsonValue::from(value);
                } else {
                    status.capture(TraversalError::InvalidType {
                        actual: JsonSchemaValueType::from(&property.value),
                        expected: JsonSchemaValueType::Number,
                    });
                }
            }
        }

        if let Some(data_type_id) = &property.metadata.data_type_id {
            property
                .metadata
                .canonical
                .insert(data_type_id.base_url.clone(), property.value.clone());

            let data_type_result = type_provider
                .provide_type(data_type_id)
                .await
                .change_context_lazy(|| TraversalError::DataTypeRetrieval {
                    id: DataTypeReference {
                        url: data_type_id.clone(),
                    },
                });

            match data_type_result {
                Ok(data_type) => {
                    if !data_type.borrow().metadata.conversions.is_empty() {
                        // We only support conversion of numbers for now
                        if let Some(value) = property.value.as_f64() {
                            for (target, conversion) in &data_type.borrow().metadata.conversions {
                                let converted_value = conversion.to.expression.evaluate(value);
                                match property.metadata.canonical.raw_entry_mut().from_key(target) {
                                    RawEntryMut::Occupied(entry) => {
                                        if let Some(current_value) = entry.get().as_f64() {
                                            #[expect(
                                                clippy::float_arithmetic,
                                                reason = "We properly checked for error margin"
                                            )]
                                            if f64::abs(current_value - converted_value)
                                                > f64::EPSILON
                                            {
                                                status.capture(
                                                    TraversalError::InvalidCanonicalValue {
                                                        key: target.clone(),
                                                        actual: current_value,
                                                        expected: converted_value,
                                                    },
                                                );
                                            }
                                        } else {
                                            status.append(
                                                Report::new(TraversalError::InvalidType {
                                                    actual: JsonSchemaValueType::from(
                                                        &property.value,
                                                    ),
                                                    expected: JsonSchemaValueType::Number,
                                                })
                                                .attach_printable(
                                                    "Values other than numbers are not yet \
                                                     supported for conversions",
                                                ),
                                            );
                                        }
                                    }
                                    RawEntryMut::Vacant(entry) => {
                                        entry.insert(
                                            target.clone(),
                                            JsonValue::from(converted_value),
                                        );
                                    }
                                }
                            }
                        } else {
                            status.append(
                                Report::new(TraversalError::InvalidType {
                                    actual: JsonSchemaValueType::from(&property.value),
                                    expected: JsonSchemaValueType::Number,
                                })
                                .attach_printable(
                                    "Values other than numbers are not yet supported for \
                                     conversions",
                                ),
                            );
                        }
                    }
                }
                Err(error) => {
                    status.append(error);
                }
            }
        }

        if let Err(error) = walk_one_of_property_value(self, schema, property, type_provider).await
        {
            status.append(error);
        }

        status.finish()
    }

    async fn visit_array<T, P>(
        &mut self,
        schema: &PropertyValueArray<T>,
        array: &mut PropertyWithMetadataArray,
        type_provider: &P,
    ) -> Result<(), Report<[TraversalError]>>
    where
        T: PropertyValueSchema + Sync,
        P: DataTypeProvider + PropertyTypeProvider + Sync,
    {
        let mut status = ReportSink::new();
        if let Err(error) = walk_array(self, schema, array, type_provider).await {
            status.append(error);
        }

        if self.components.num_items {
            if let Some(min) = schema.min_items {
                if array.value.len() < min {
                    status.capture(TraversalError::TooFewItems {
                        actual: array.value.len(),
                        min,
                    });
                }
            }

            if let Some(max) = schema.max_items {
                if array.value.len() > max {
                    status.capture(TraversalError::TooManyItems {
                        actual: array.value.len(),
                        max,
                    });
                }
            }
        }

        status.finish()
    }

    async fn visit_object<T, P>(
        &mut self,
        schema: &T,
        object: &mut PropertyWithMetadataObject,
        type_provider: &P,
    ) -> Result<(), Report<[TraversalError]>>
    where
        T: PropertyObjectSchema<Value = ValueOrArray<PropertyTypeReference>> + Sync,
        P: DataTypeProvider + PropertyTypeProvider + Sync,
    {
        let mut status = ReportSink::new();
        if let Err(error) = walk_object(self, schema, object, type_provider).await {
            status.append(error);
        }

        if self.components.required_properties {
            for required_property in schema.required() {
                if !object.value.contains_key(required_property) {
                    status.capture(TraversalError::MissingRequiredProperty {
                        key: required_property.clone(),
                    });
                }
            }
        }

        status.finish()
    }
}

#[cfg(test)]
mod tests {
    use crate::{ValidateEntityComponents, tests::validate_entity};

    #[tokio::test]
    async fn address() {
        let entities = [];
        let entity_types = [];
        let property_types = [
            graph_test_data::property_type::ADDRESS_LINE_1_V1,
            graph_test_data::property_type::POSTCODE_NUMBER_V1,
            graph_test_data::property_type::CITY_V1,
        ];
        let data_types = [
            graph_test_data::data_type::VALUE_V1,
            graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            graph_test_data::entity::ADDRESS_V1,
            graph_test_data::entity_type::UK_ADDRESS_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn block() {
        let entities = [];
        let entity_types = [];
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [
            graph_test_data::data_type::VALUE_V1,
            graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            graph_test_data::entity::BLOCK_V1,
            graph_test_data::entity_type::BLOCK_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn book() {
        let entities = [];
        let entity_types = [];
        let property_types = [
            graph_test_data::property_type::NAME_V1,
            graph_test_data::property_type::BLURB_V1,
            graph_test_data::property_type::PUBLISHED_ON_V1,
        ];
        let data_types = [
            graph_test_data::data_type::VALUE_V1,
            graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            graph_test_data::entity::BOOK_V1,
            graph_test_data::entity_type::BOOK_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn building() {
        let entities = [];
        let entity_types = [];
        let property_types = [];
        let data_types = [];

        validate_entity(
            graph_test_data::entity::BUILDING_V1,
            graph_test_data::entity_type::BUILDING_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn organization() {
        let entities = [];
        let entity_types = [];
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [
            graph_test_data::data_type::VALUE_V1,
            graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            graph_test_data::entity::ORGANIZATION_V1,
            graph_test_data::entity_type::ORGANIZATION_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn page() {
        let entities = [];
        let entity_types = [];
        let property_types = [graph_test_data::property_type::TEXT_V1];
        let data_types = [
            graph_test_data::data_type::VALUE_V1,
            graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            graph_test_data::entity::PAGE_V1,
            graph_test_data::entity_type::PAGE_V1,
            entities.to_vec(),
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");

        validate_entity(
            graph_test_data::entity::PAGE_V2,
            graph_test_data::entity_type::PAGE_V2,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn person() {
        let entities = [];
        let entity_types = [];
        let property_types = [
            graph_test_data::property_type::NAME_V1,
            graph_test_data::property_type::AGE_V1,
        ];
        let data_types = [
            graph_test_data::data_type::VALUE_V1,
            graph_test_data::data_type::TEXT_V1,
            graph_test_data::data_type::NUMBER_V1,
        ];

        validate_entity(
            graph_test_data::entity::PERSON_ALICE_V1,
            graph_test_data::entity_type::PERSON_V1,
            entities.to_vec(),
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");

        validate_entity(
            graph_test_data::entity::PERSON_BOB_V1,
            graph_test_data::entity_type::PERSON_V1,
            entities.to_vec(),
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");

        validate_entity(
            graph_test_data::entity::PERSON_CHARLES_V1,
            graph_test_data::entity_type::PERSON_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn playlist() {
        let entities = [];
        let entity_types = [];
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [
            graph_test_data::data_type::VALUE_V1,
            graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            graph_test_data::entity::PLAYLIST_V1,
            graph_test_data::entity_type::PLAYLIST_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn song() {
        let entities = [];
        let entity_types = [];
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [
            graph_test_data::data_type::VALUE_V1,
            graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            graph_test_data::entity::SONG_V1,
            graph_test_data::entity_type::SONG_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }
}
