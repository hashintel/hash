use alloc::collections::BTreeSet;
use core::borrow::Borrow as _;
use std::collections::{HashSet, hash_map::RawEntryMut};

use error_stack::{FutureExt as _, Report, ReportSink, ResultExt as _, TryReportStreamExt as _};
use futures::{StreamExt as _, TryStreamExt as _, stream};
use hash_graph_store::entity::{
    EntityRetrieval, EntityTypeRetrieval, LinkDataStateError, LinkDataValidationReport, LinkError,
    LinkTargetError, LinkValidationReport, LinkedEntityError, MissingLinkData,
    PropertyMetadataValidationReport, UnexpectedEntityType, UnexpectedLinkData,
    ValidateEntityComponents,
};
use hash_graph_types::{
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
    ontology::{DataTypeLookup, DataTypeWithMetadata, OntologyTypeProvider},
};
use serde_json::Value as JsonValue;
use thiserror::Error;
use type_system::{
    schema::{
        ClosedEntityType, ClosedMultiEntityType, ConstraintValidator as _, DataTypeReference,
        JsonSchemaValueType, PropertyObjectSchema, PropertyType, PropertyTypeReference,
        PropertyValueArray, PropertyValueSchema, PropertyValues, ValueOrArray,
    },
    url::VersionedUrl,
};

use crate::{EntityProvider, Validate};

#[derive(Debug, Error)]
pub enum EntityValidationError {
    #[error("The properties of the entity do not match the schema")]
    InvalidProperties,
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
        + OntologyTypeProvider<ClosedEntityType>
        + OntologyTypeProvider<PropertyType>
        + DataTypeLookup
        + Sync,
{
    type Report = LinkValidationReport;

    async fn validate(
        &self,
        schema: &ClosedMultiEntityType,
        components: ValidateEntityComponents,
        context: &P,
    ) -> Self::Report {
        let mut validation_report = LinkValidationReport::default();

        let is_link = schema.is_link();
        if let Some(link_data) = self {
            if !is_link {
                validation_report.link_data = Some(LinkDataStateError::Unexpected(Report::new(
                    UnexpectedLinkData,
                )));
            }

            if components.link_validation {
                validation_report.link_data_validation =
                    link_data.validate(schema, components, context).await;
            }
        } else if is_link {
            validation_report.link_data =
                Some(LinkDataStateError::Missing(Report::new(MissingLinkData)));
        }

        validation_report
    }
}

#[derive(Debug)]
#[must_use]
pub struct PostInsertionEntityValidationReport {
    pub link: LinkValidationReport,
    pub property_metadata: PropertyMetadataValidationReport,
}

impl PostInsertionEntityValidationReport {
    #[must_use]
    pub const fn is_valid(&self) -> bool {
        self.link.is_valid() && self.property_metadata.is_valid()
    }
}

impl<P> Validate<ClosedMultiEntityType, P> for Entity
where
    P: EntityProvider
        + OntologyTypeProvider<ClosedEntityType>
        + OntologyTypeProvider<PropertyType>
        + DataTypeLookup
        + Sync,
{
    type Report = PostInsertionEntityValidationReport;

    async fn validate(
        &self,
        schema: &ClosedMultiEntityType,
        components: ValidateEntityComponents,
        context: &P,
    ) -> Self::Report {
        PostInsertionEntityValidationReport {
            link: self
                .link_data
                .as_ref()
                .validate(schema, components, context)
                .await,
            property_metadata: self
                .metadata
                .properties
                .validate(&self.properties, components, context)
                .await,
        }
    }
}

async fn read_entity_type<P>(
    entity_id: EntityId,
    provider: &P,
) -> Result<ClosedMultiEntityType, LinkedEntityError>
where
    P: EntityProvider + OntologyTypeProvider<ClosedEntityType> + Sync,
{
    let entity = provider
        .provide_entity(entity_id)
        .await
        .change_context(EntityRetrieval { entity_id })
        .map_err(LinkedEntityError::EntityRetrieval)?;

    let entity_types = stream::iter(&entity.borrow().metadata.entity_type_ids)
        .then(|entity_type_url| {
            provider
                .provide_type(entity_type_url)
                .change_context_lazy(|| EntityTypeRetrieval {
                    entity_type_url: entity_type_url.clone(),
                })
        })
        .map_ok(|entity_type| entity_type.borrow().clone())
        .try_collect_reports::<Vec<ClosedEntityType>>()
        .await
        .map_err(LinkedEntityError::EntityTypeRetrieval)?;

    ClosedMultiEntityType::from_multi_type_closed_schema(entity_types)
        .map_err(LinkedEntityError::ResolveClosedEntityType)
}

impl<P> Validate<ClosedMultiEntityType, P> for LinkData
where
    P: EntityProvider + OntologyTypeProvider<ClosedEntityType> + Sync,
{
    type Report = LinkDataValidationReport;

    // TODO: validate link data
    //   see https://linear.app/hash/issue/H-972
    // TODO: Optimize reading of left/right parent types and/or cache them
    async fn validate(
        &self,
        schema: &ClosedMultiEntityType,
        _: ValidateEntityComponents,
        context: &P,
    ) -> Self::Report {
        let mut validation_report = LinkDataValidationReport::default();

        let left_entity_type = read_entity_type(self.left_entity_id, context)
            .await
            .map_err(|link_data_error| {
                validation_report.left_entity = Some(link_data_error);
            })
            .ok();
        let right_entity_type = read_entity_type(self.right_entity_id, context)
            .await
            .map_err(|link_data_error| {
                validation_report.right_entity = Some(link_data_error);
            })
            .ok();

        // We cannot further validate the links if the left type is not known
        let Some(left_entity_type) = left_entity_type else {
            return validation_report;
        };
        let link_entity_ids = schema
            .all_of
            .iter()
            .flat_map(|entity_type| &entity_type.all_of)
            .map(|entity_type| (entity_type.depth, &entity_type.id))
            .collect::<BTreeSet<_>>();

        let Some(maybe_allowed_targets) = link_entity_ids
            .iter()
            .find_map(|(_, link_type_id)| left_entity_type.constraints.links.get(link_type_id))
        else {
            validation_report.link_type = Some(LinkError::UnexpectedEntityType {
                data: UnexpectedEntityType {
                    actual: schema
                        .all_of
                        .iter()
                        .flat_map(|entity_type| &entity_type.all_of)
                        .map(|entity_type| entity_type.id.clone())
                        .collect(),
                    expected: left_entity_type.constraints.links.keys().cloned().collect(),
                },
            });
            return validation_report;
        };

        let Some(allowed_targets) = &maybe_allowed_targets.items else {
            // For a given target there was an unconstrained link destination, so we can
            // skip the rest of the checks
            return validation_report;
        };

        let Some(right_entity_type) = &right_entity_type else {
            // We cannot further validate the links if the right type is not known.
            return validation_report;
        };

        // Link destinations are constrained, search for the right entity's type
        let found_match = allowed_targets.possibilities.iter().any(|allowed_target| {
            right_entity_type.all_of.iter().any(|entity_type| {
                // We check that the base URL matches for the exact type or the versioned URL
                // for the parent types
                entity_type.id.base_url == allowed_target.url.base_url
                    || entity_type
                        .all_of
                        .iter()
                        .any(|entity_type| entity_type.id == allowed_target.url)
            })
        });

        if !found_match {
            validation_report.target_type = Some(LinkTargetError::UnexpectedEntityType {
                data: UnexpectedEntityType {
                    actual: link_entity_ids
                        .into_iter()
                        .map(|(_, entity_type_id)| entity_type_id.clone())
                        .collect(),
                    expected: allowed_targets
                        .possibilities
                        .iter()
                        .map(|entity_type| entity_type.url.clone())
                        .collect(),
                },
            });
        }

        validation_report
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
        P: DataTypeLookup + Sync,
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
        P: DataTypeLookup + Sync,
    {
        let mut status = ReportSink::new();

        if let Some(data_type_url) = &metadata.data_type_id {
            let data_type_ref: &DataTypeReference = data_type_url.into();
            if data_type.schema.id != *data_type_url {
                let is_compatible = type_provider
                    .is_parent_of(data_type_ref, &data_type.schema.id.base_url)
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
                    .lookup_data_type_by_ref(data_type_ref)
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
        P: DataTypeLookup + Sync,
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
                            .lookup_data_type_by_ref(data_type_ref)
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
            let source_data_type_ref: &DataTypeReference = source_data_type_id.into();
            let target_data_type_ref: &DataTypeReference = target_data_type_id.into();

            if source_data_type_ref != target_data_type_ref {
                let conversions = type_provider
                    .find_conversion(source_data_type_ref, target_data_type_ref)
                    .await
                    .change_context_lazy(|| TraversalError::ConversionRetrieval {
                        current: source_data_type_ref.clone(),
                        target: target_data_type_ref.clone(),
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
                .lookup_data_type_by_ref(<&DataTypeReference>::from(data_type_id))
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
        P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
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
        P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
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
    use hash_graph_store::entity::ValidateEntityComponents;

    use crate::tests::validate_entity;

    #[tokio::test]
    async fn address() {
        let entities = [];
        let entity_types = [];
        let property_types = [
            hash_graph_test_data::property_type::ADDRESS_LINE_1_V1,
            hash_graph_test_data::property_type::POSTCODE_NUMBER_V1,
            hash_graph_test_data::property_type::CITY_V1,
        ];
        let data_types = [
            hash_graph_test_data::data_type::VALUE_V1,
            hash_graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            hash_graph_test_data::entity::ADDRESS_V1,
            hash_graph_test_data::entity_type::UK_ADDRESS_V1,
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
        let property_types = [hash_graph_test_data::property_type::NAME_V1];
        let data_types = [
            hash_graph_test_data::data_type::VALUE_V1,
            hash_graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            hash_graph_test_data::entity::BLOCK_V1,
            hash_graph_test_data::entity_type::BLOCK_V1,
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
            hash_graph_test_data::property_type::NAME_V1,
            hash_graph_test_data::property_type::BLURB_V1,
            hash_graph_test_data::property_type::PUBLISHED_ON_V1,
        ];
        let data_types = [
            hash_graph_test_data::data_type::VALUE_V1,
            hash_graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            hash_graph_test_data::entity::BOOK_V1,
            hash_graph_test_data::entity_type::BOOK_V1,
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
            hash_graph_test_data::entity::BUILDING_V1,
            hash_graph_test_data::entity_type::BUILDING_V1,
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
        let property_types = [hash_graph_test_data::property_type::NAME_V1];
        let data_types = [
            hash_graph_test_data::data_type::VALUE_V1,
            hash_graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            hash_graph_test_data::entity::ORGANIZATION_V1,
            hash_graph_test_data::entity_type::ORGANIZATION_V1,
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
        let property_types = [hash_graph_test_data::property_type::TEXT_V1];
        let data_types = [
            hash_graph_test_data::data_type::VALUE_V1,
            hash_graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            hash_graph_test_data::entity::PAGE_V1,
            hash_graph_test_data::entity_type::PAGE_V1,
            entities.to_vec(),
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");

        validate_entity(
            hash_graph_test_data::entity::PAGE_V2,
            hash_graph_test_data::entity_type::PAGE_V2,
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
            hash_graph_test_data::property_type::NAME_V1,
            hash_graph_test_data::property_type::AGE_V1,
        ];
        let data_types = [
            hash_graph_test_data::data_type::VALUE_V1,
            hash_graph_test_data::data_type::TEXT_V1,
            hash_graph_test_data::data_type::NUMBER_V1,
        ];

        validate_entity(
            hash_graph_test_data::entity::PERSON_ALICE_V1,
            hash_graph_test_data::entity_type::PERSON_V1,
            entities.to_vec(),
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");

        validate_entity(
            hash_graph_test_data::entity::PERSON_BOB_V1,
            hash_graph_test_data::entity_type::PERSON_V1,
            entities.to_vec(),
            entity_types,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");

        validate_entity(
            hash_graph_test_data::entity::PERSON_CHARLES_V1,
            hash_graph_test_data::entity_type::PERSON_V1,
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
        let property_types = [hash_graph_test_data::property_type::NAME_V1];
        let data_types = [
            hash_graph_test_data::data_type::VALUE_V1,
            hash_graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            hash_graph_test_data::entity::PLAYLIST_V1,
            hash_graph_test_data::entity_type::PLAYLIST_V1,
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
        let property_types = [hash_graph_test_data::property_type::NAME_V1];
        let data_types = [
            hash_graph_test_data::data_type::VALUE_V1,
            hash_graph_test_data::data_type::TEXT_V1,
        ];

        validate_entity(
            hash_graph_test_data::entity::SONG_V1,
            hash_graph_test_data::entity_type::SONG_V1,
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
