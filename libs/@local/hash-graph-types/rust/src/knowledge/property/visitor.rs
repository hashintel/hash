use core::{borrow::Borrow, future::Future};

use error_stack::{bail, Report, ReportSink, ResultExt};
use serde_json::Value as JsonValue;
use type_system::{
    schema::{
        DataTypeReference, JsonSchemaValueType, PropertyObjectSchema, PropertyType,
        PropertyTypeReference, PropertyValueArray, PropertyValueSchema, PropertyValues,
        ValueOrArray,
    },
    url::{BaseUrl, VersionedUrl},
};

use crate::{
    knowledge::property::{
        PropertyWithMetadata, PropertyWithMetadataArray, PropertyWithMetadataObject,
        PropertyWithMetadataValue, ValueMetadata,
    },
    ontology::{
        DataTypeProvider, DataTypeWithMetadata, OntologyTypeProvider, PropertyTypeProvider,
    },
};

#[derive(Debug, thiserror::Error)]
pub enum TraversalError {
    #[error("the validator was unable to read the data type `{}`", id.url)]
    DataTypeRetrieval { id: DataTypeReference },
    #[error(
        "the validator was unable to read the data type conversion from `{}` to `{}`", current.url, target.url
    )]
    ConversionRetrieval {
        current: DataTypeReference,
        target: DataTypeReference,
    },
    #[error("the validator was unable to read the property type `{}`", id.url)]
    PropertyTypeRetrieval { id: PropertyTypeReference },

    #[error("the property `{key}` was specified, but not in the schema")]
    UnexpectedProperty { key: BaseUrl },
    #[error(
        "the value provided does not match the property type schema, expected `{expected}`, got \
         `{actual}`"
    )]
    InvalidType {
        actual: JsonSchemaValueType,
        expected: JsonSchemaValueType,
    },
    #[error("a value was expected, but the property provided was of type `{actual}`")]
    ExpectedValue { actual: JsonSchemaValueType },
    #[error("The property provided is ambiguous")]
    AmbiguousProperty { actual: PropertyWithMetadata },
    #[error("The data type ID was not specified and is ambiguous.")]
    AmbiguousDataType,

    #[error(
        "the value provided does not match the data type in the metadata, expected `{expected}` \
         or a child of it, got `{actual}`"
    )]
    InvalidDataType {
        actual: VersionedUrl,
        expected: VersionedUrl,
    },
    #[error("Values cannot be assigned to an abstract data type. `{id}` is abstract.")]
    AbstractDataType { id: VersionedUrl },
    #[error("the value provided does not match the constraints of the data type")]
    ConstraintUnfulfilled,
    #[error("the property `{key}` was required, but not specified")]
    MissingRequiredProperty { key: BaseUrl },
    #[error(
        "the number of items in the array is too small, expected at least {min}, but found \
         {actual}"
    )]
    TooFewItems { actual: usize, min: usize },
    #[error(
        "the number of items in the array is too large, expected at most {max}, but found {actual}"
    )]
    TooManyItems { actual: usize, max: usize },
    #[error(
        "The provided canonical value `{actual}` for `{key}` is different than the calculated \
         value `{expected}`"
    )]
    InvalidCanonicalValue {
        key: BaseUrl,
        expected: f64,
        actual: f64,
    },
}

// TODO: Allow usage of other error types
pub trait EntityVisitor: Sized + Send + Sync {
    /// Visits a leaf value.
    ///
    /// By default, this does nothing.
    fn visit_value<P>(
        &mut self,
        data_type: &DataTypeWithMetadata,
        value: &mut JsonValue,
        metadata: &mut ValueMetadata,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), Report<[TraversalError]>>> + Send
    where
        P: DataTypeProvider + Sync,
    {
        walk_value(self, data_type, value, metadata, type_provider)
    }

    /// Visits a property.
    ///
    /// By default, this forwards to [`walk_property`].
    fn visit_property<P>(
        &mut self,
        schema: &PropertyType,
        property: &mut PropertyWithMetadata,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), Report<[TraversalError]>>> + Send
    where
        P: DataTypeProvider + PropertyTypeProvider + Sync,
    {
        walk_property(self, schema, property, type_provider)
    }

    /// Visits an array property.
    ///
    /// By default, this forwards to [`walk_array`].
    fn visit_array<T, P>(
        &mut self,
        schema: &PropertyValueArray<T>,
        array: &mut PropertyWithMetadataArray,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), Report<[TraversalError]>>> + Send
    where
        T: PropertyValueSchema + Sync,
        P: DataTypeProvider + PropertyTypeProvider + Sync,
    {
        walk_array(self, schema, array, type_provider)
    }

    /// Visits an object property.
    ///
    /// By default, this forwards to [`walk_object`].
    fn visit_object<T, P>(
        &mut self,
        schema: &T,
        object: &mut PropertyWithMetadataObject,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), Report<[TraversalError]>>> + Send
    where
        T: PropertyObjectSchema<Value = ValueOrArray<PropertyTypeReference>> + Sync,
        P: DataTypeProvider + PropertyTypeProvider + Sync,
    {
        walk_object(self, schema, object, type_provider)
    }

    /// Visits a property value using the [`PropertyValues`] from a one-of schema.
    ///
    /// By default, this forwards to [`walk_one_of_property_value`].
    fn visit_one_of_property<P>(
        &mut self,
        schema: &[PropertyValues],
        property: &mut PropertyWithMetadataValue,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), Report<[TraversalError]>>> + Send
    where
        P: DataTypeProvider + Sync,
    {
        walk_one_of_property_value(self, schema, property, type_provider)
    }

    /// Visits an array property using the [`PropertyValues`] from a one-of schema.
    ///
    /// By default, this forwards to [`walk_one_of_array`].
    fn visit_one_of_array<P>(
        &mut self,
        schema: &[PropertyValues],
        array: &mut PropertyWithMetadataArray,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), Report<[TraversalError]>>> + Send
    where
        P: DataTypeProvider + PropertyTypeProvider + Sync,
    {
        walk_one_of_array(self, schema, array, type_provider)
    }

    /// Visits an object property using the [`PropertyValues`] from a one-of schema.
    ///
    /// By default, this forwards to [`walk_one_of_object`].
    fn visit_one_of_object<P>(
        &mut self,
        schema: &[PropertyValues],
        object: &mut PropertyWithMetadataObject,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), Report<[TraversalError]>>> + Send
    where
        P: DataTypeProvider + PropertyTypeProvider + Sync,
    {
        walk_one_of_object(self, schema, object, type_provider)
    }
}

/// Walks through a JSON value using the provided schema.
///
/// For all referenced data types [`EntityVisitor::visit_value`] is called.
///
/// # Errors
///
/// Any error that can be returned by the visitor methods.
pub async fn walk_value<V, P>(
    visitor: &mut V,
    data_type: &DataTypeWithMetadata,
    value: &mut JsonValue,
    metadata: &mut ValueMetadata,
    type_provider: &P,
) -> Result<(), Report<[TraversalError]>>
where
    V: EntityVisitor,
    P: DataTypeProvider + Sync,
{
    let mut status = ReportSink::new();

    for parent in &data_type.schema.all_of {
        match type_provider
            .provide_type(&parent.url)
            .await
            .change_context_lazy(|| TraversalError::DataTypeRetrieval { id: parent.clone() })
        {
            Ok(parent) => {
                if let Err(error) = visitor
                    .visit_value(parent.borrow(), value, metadata, type_provider)
                    .await
                {
                    status.append(error);
                }
            }
            Err(error) => {
                status.append(error);

                continue;
            }
        }
    }

    status.finish()
}

/// Walks through a property using the provided schema.
///
/// Depending on the property, [`EntityVisitor::visit_one_of_property`],
/// [`EntityVisitor::visit_one_of_array`], or [`EntityVisitor::visit_one_of_object`] is called.
///
/// # Errors
///
/// Any error that can be returned by the visitor methods.
pub async fn walk_property<V, P>(
    visitor: &mut V,
    schema: &PropertyType,
    property: &mut PropertyWithMetadata,
    type_provider: &P,
) -> Result<(), Report<[TraversalError]>>
where
    V: EntityVisitor,
    P: DataTypeProvider + PropertyTypeProvider + Sync,
{
    match property {
        PropertyWithMetadata::Value(value) => {
            visitor
                .visit_one_of_property(&schema.one_of, value, type_provider)
                .await
        }
        PropertyWithMetadata::Array(array) => {
            visitor
                .visit_one_of_array(&schema.one_of, array, type_provider)
                .await
        }
        PropertyWithMetadata::Object(object) => {
            visitor
                .visit_one_of_object(&schema.one_of, object, type_provider)
                .await
        }
    }
}

/// Walks through an array property using the provided schema.
///
/// Depending on the property, [`EntityVisitor::visit_one_of_property`],
/// [`EntityVisitor::visit_one_of_array`], or [`EntityVisitor::visit_one_of_object`] is called.
///
/// # Errors
///
/// Any error that can be returned by the visitor methods.
pub async fn walk_array<V, S, P>(
    visitor: &mut V,
    schema: &PropertyValueArray<S>,
    array: &mut PropertyWithMetadataArray,
    type_provider: &P,
) -> Result<(), Report<[TraversalError]>>
where
    V: EntityVisitor,
    S: PropertyValueSchema + Sync,
    P: DataTypeProvider + PropertyTypeProvider + Sync,
{
    let mut status = ReportSink::new();

    for property in &mut array.value {
        match property {
            PropertyWithMetadata::Value(value) => {
                if let Err(error) = visitor
                    .visit_one_of_property(schema.items.possibilities(), value, type_provider)
                    .await
                {
                    status.append(error);
                }
            }
            PropertyWithMetadata::Array(array) => {
                if let Err(error) = visitor
                    .visit_one_of_array(schema.items.possibilities(), array, type_provider)
                    .await
                {
                    status.append(error);
                }
            }
            PropertyWithMetadata::Object(object) => {
                if let Err(error) = visitor
                    .visit_one_of_object(schema.items.possibilities(), object, type_provider)
                    .await
                {
                    status.append(error);
                }
            }
        }
    }

    status.finish()
}

/// Walks through a property object using the provided schema.
///
/// For each url/property pair in the `properties` map, the property type is retrieved from `schema`
/// and the `visitor` is called to further traverse the property object. The `type_provider` is used
/// to resolve the property types specified in the `schema`.
///
/// Depending on the property, [`EntityVisitor::visit_property`] or [`EntityVisitor::visit_array`]
/// is called.
///
/// # Errors
///
/// - [`UnexpectedProperty`] if a property is specified that is not in the schema.
/// - [`PropertyTypeRetrieval`] if a property type could not be retrieved from the `type_provider`.
/// - [`InvalidType`] if the schema expects an array, but a value or object is provided.
/// - Any error that can be returned by the visitor methods.
///
/// [`UnexpectedProperty`]: TraversalError::UnexpectedProperty
/// [`PropertyTypeRetrieval`]: TraversalError::PropertyTypeRetrieval
/// [`InvalidType`]: TraversalError::InvalidType
pub async fn walk_object<V, S, P>(
    visitor: &mut V,
    schema: &S,
    object: &mut PropertyWithMetadataObject,
    type_provider: &P,
) -> Result<(), Report<[TraversalError]>>
where
    V: EntityVisitor,
    S: PropertyObjectSchema<Value = ValueOrArray<PropertyTypeReference>> + Sync,
    P: DataTypeProvider + PropertyTypeProvider + Sync,
{
    let mut status = ReportSink::new();

    for (base_url, property) in &mut object.value {
        let Some(property_type_reference) = schema.properties().get(base_url) else {
            status.capture(TraversalError::UnexpectedProperty {
                key: base_url.clone(),
            });

            continue;
        };

        match property_type_reference {
            ValueOrArray::Value(property_type_reference) => {
                let property_type = <P as OntologyTypeProvider<PropertyType>>::provide_type(
                    type_provider,
                    &property_type_reference.url,
                )
                .await
                .change_context_lazy(|| TraversalError::PropertyTypeRetrieval {
                    id: property_type_reference.clone(),
                })?;
                visitor
                    .visit_property(property_type.borrow(), property, type_provider)
                    .await?;
            }
            ValueOrArray::Array(array_schema) => match property {
                PropertyWithMetadata::Array(array) => {
                    let property_type = <P as OntologyTypeProvider<PropertyType>>::provide_type(
                        type_provider,
                        &array_schema.items.url,
                    )
                    .await
                    .change_context_lazy(|| {
                        TraversalError::PropertyTypeRetrieval {
                            id: array_schema.items.clone(),
                        }
                    })?;
                    let result = visitor
                        .visit_array(
                            &PropertyValueArray {
                                items: property_type.borrow(),
                                min_items: array_schema.min_items,
                                max_items: array_schema.max_items,
                            },
                            array,
                            type_provider,
                        )
                        .await;
                    if let Err(error) = result {
                        status.append(error);
                    }
                }
                PropertyWithMetadata::Object { .. } | PropertyWithMetadata::Value(_) => {
                    bail![TraversalError::InvalidType {
                        actual: property.json_type(),
                        expected: JsonSchemaValueType::Array,
                    },]
                }
            },
        };
    }

    status.finish()
}

/// Walks through a property value using the provided schema list.
///
/// # Errors
///
/// - [`ExpectedValue`] if an array or object is provided.
/// - [`DataTypeRetrieval`] if a data type could not be retrieved from the `type_provider`.
/// - [`AmbiguousProperty`] if more than one schema is passed.
/// - Any error that can be returned by the visitor methods.
///
/// [`ExpectedValue`]: TraversalError::ExpectedValue
/// [`DataTypeRetrieval`]: TraversalError::DataTypeRetrieval
/// [`AmbiguousProperty`]: TraversalError::AmbiguousProperty
pub async fn walk_one_of_property_value<V, P>(
    visitor: &mut V,
    schema: &[PropertyValues],
    property: &mut PropertyWithMetadataValue,
    type_provider: &P,
) -> Result<(), Report<[TraversalError]>>
where
    V: EntityVisitor,
    P: DataTypeProvider + Sync,
{
    let mut status = ReportSink::new();
    let mut passed: usize = 0;

    for schema in schema {
        match schema {
            PropertyValues::DataTypeReference(data_type_ref) => {
                let data_type = type_provider
                    .provide_type(&data_type_ref.url)
                    .await
                    .change_context_lazy(|| TraversalError::DataTypeRetrieval {
                        id: data_type_ref.clone(),
                    })?;
                if let Err(error) = visitor
                    .visit_value(
                        data_type.borrow(),
                        &mut property.value,
                        &mut property.metadata,
                        type_provider,
                    )
                    .await
                {
                    status.append(error);
                } else {
                    passed += 1;
                }
            }
            PropertyValues::ArrayOfPropertyValues(_) => {
                status.capture(TraversalError::ExpectedValue {
                    actual: JsonSchemaValueType::Array,
                });
            }
            PropertyValues::PropertyTypeObject(_) => {
                status.capture(TraversalError::ExpectedValue {
                    actual: JsonSchemaValueType::Object,
                });
            }
        }
    }

    match passed {
        0 => status.finish(),
        1 => Ok(()),
        _ => {
            status.capture(TraversalError::AmbiguousProperty {
                actual: PropertyWithMetadata::Value(property.clone()),
            });
            status.finish()
        }
    }
}

/// Walks through an array property using the provided schema list.
///
/// # Errors
///
/// - [`ExpectedValue`] if a value or object is provided.
/// - [`AmbiguousProperty`] if more than one schema is passed.
/// - Any error that can be returned by the visitor methods.
///
/// [`ExpectedValue`]: TraversalError::ExpectedValue
/// [`AmbiguousProperty`]: TraversalError::AmbiguousProperty
pub async fn walk_one_of_array<V, P>(
    visitor: &mut V,
    schema: &[PropertyValues],
    array: &mut PropertyWithMetadataArray,
    type_provider: &P,
) -> Result<(), Report<[TraversalError]>>
where
    V: EntityVisitor,
    P: DataTypeProvider + PropertyTypeProvider + Sync,
{
    let mut status = ReportSink::new();
    let mut passed: usize = 0;

    for schema in schema {
        match schema {
            PropertyValues::DataTypeReference(_) => {
                status.capture(TraversalError::ExpectedValue {
                    actual: JsonSchemaValueType::Array,
                });
            }
            PropertyValues::ArrayOfPropertyValues(array_schema) => {
                if let Err(error) =
                    Box::pin(visitor.visit_array(array_schema, array, type_provider)).await
                {
                    status.append(error);
                } else {
                    passed += 1;
                }
            }
            PropertyValues::PropertyTypeObject(_) => {
                status.capture(TraversalError::ExpectedValue {
                    actual: JsonSchemaValueType::Object,
                });
            }
        }
    }

    match passed {
        0 => status.finish(),
        1 => Ok(()),
        _ => {
            status.capture(TraversalError::AmbiguousProperty {
                actual: PropertyWithMetadata::Array(array.clone()),
            });

            status.finish()
        }
    }
}

/// Walks through an object property using the provided schema list.
///
/// # Errors
///
/// - [`ExpectedValue`] if a value or array is provided.
/// - [`AmbiguousProperty`] if more than one schema is passed.
/// - Any error that can be returned by the visitor methods.
///
/// [`ExpectedValue`]: TraversalError::ExpectedValue
/// [`AmbiguousProperty`]: TraversalError::AmbiguousProperty
pub async fn walk_one_of_object<V, P>(
    visitor: &mut V,
    schema: &[PropertyValues],
    object: &mut PropertyWithMetadataObject,
    type_provider: &P,
) -> Result<(), Report<[TraversalError]>>
where
    V: EntityVisitor,
    P: DataTypeProvider + PropertyTypeProvider + Sync,
{
    let mut status = ReportSink::new();
    let mut passed: usize = 0;

    for schema in schema {
        match schema {
            PropertyValues::DataTypeReference(_) => {
                status.capture(TraversalError::ExpectedValue {
                    actual: JsonSchemaValueType::Array,
                });
            }
            PropertyValues::ArrayOfPropertyValues(_) => {
                status.capture(TraversalError::ExpectedValue {
                    actual: JsonSchemaValueType::Object,
                });
            }
            PropertyValues::PropertyTypeObject(object_schema) => {
                if let Err(error) =
                    Box::pin(visitor.visit_object(object_schema, object, type_provider)).await
                {
                    status.append(error);
                } else {
                    passed += 1;
                }
            }
        }
    }

    match passed {
        0 => status.finish(),
        1 => Ok(()),
        _ => {
            status.capture(TraversalError::AmbiguousProperty {
                actual: PropertyWithMetadata::Object(object.clone()),
            });

            status.finish()
        }
    }
}
