use core::{borrow::Borrow as _, error::Error, future::Future};

use error_stack::Report;
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
    ontology::{DataTypeLookup, DataTypeWithMetadata, OntologyTypeProvider},
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
    #[error("The property provided is ambiguous, more than one schema passed the validation.")]
    AmbiguousProperty { actual: PropertyWithMetadata },
    #[error("The data type ID was not specified and is ambiguous.")]
    AmbiguousDataType,
    #[error("Could not find a suitable data type for the property")]
    DataTypeUnspecified,

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
    #[error("the value provided does not match the data type")]
    DataTypeUnfulfilled,
    #[error(
        "the value provided does not match the property type. Exactly one constraint has to be \
         fulfilled."
    )]
    PropertyTypeUnfulfilled,
    #[error("the entity provided does not match the entity type")]
    EntityTypeUnfulfilled,
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

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OneOfError<R> {
    UnexpectedType { expected: JsonSchemaValueType },
    Validation(R),
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OneOfVisitationReport<R> {
    report: Vec<OneOfError<R>>,
    passed: usize,
}

#[derive(Debug, serde::Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PropertyVisitationError<V, A, O> {
    Value(OneOfVisitationReport<V>),
    Array(OneOfVisitationReport<A>),
    Object(OneOfVisitationReport<O>),
}

#[must_use]
pub trait PropertyObjectVisitationReport: Default {
    type PropertyValueVisitationReport;
    type PropertyArrayVisitationReport;

    fn capture_unexpected_property(&mut self, key: BaseUrl);
    fn capture_property_type_retrieval_failed(
        &mut self,
        reference: PropertyTypeReference,
        report: Report<impl Error + Send + Sync>,
    );
    fn capture_unexpected_type(
        &mut self,
        key: BaseUrl,
        actual: JsonSchemaValueType,
        expected: JsonSchemaValueType,
    );

    fn capture_property_validation_report(
        &mut self,
        key: BaseUrl,
        report: PropertyVisitationError<
            Self::PropertyValueVisitationReport,
            Self::PropertyArrayVisitationReport,
            Self,
        >,
    );
    fn capture_array_validation_report(
        &mut self,
        key: BaseUrl,
        report: Self::PropertyArrayVisitationReport,
    );
}

#[must_use]
pub trait PropertyValueVisitationReport: Default {
    fn capture_data_type_retrieval_failed(
        &mut self,
        reference: DataTypeReference,
        report: Report<impl Error + Send + Sync>,
    );
}

#[must_use]
pub trait PropertyArrayVisitationReport: Default {
    type PropertyValueVisitationReport;
    type PropertyObjectVisitationReport;

    fn capture_value_validation_report(
        &mut self,
        index: usize,
        report: OneOfVisitationReport<Self::PropertyValueVisitationReport>,
    );

    fn capture_array_validation_report(
        &mut self,
        index: usize,
        report: OneOfVisitationReport<Self>,
    );
    fn capture_object_validation_report(
        &mut self,
        index: usize,
        report: OneOfVisitationReport<Self::PropertyObjectVisitationReport>,
    );
}

#[must_use]
pub trait OneOfPropertyVisitationReport: Default {
    type PropertyValueVisitationReport;

    fn capture_data_type_retrieval_failed(
        &mut self,
        reference: DataTypeReference,
        report: Report<impl Error + Send + Sync>,
    );

    fn capture_validation_report(&mut self, report: Self::PropertyValueVisitationReport);
}

fn result_as_mut_err<E: Default>(result: &mut Result<(), E>) -> &mut E {
    match result {
        Ok(()) => {
            *result = Err(E::default());
            result.as_mut().expect_err("error was just set")
        }
        Err(error) => error,
    }
}

// TODO: Allow usage of other error types
pub trait EntityVisitor: Sized + Send + Sync {
    type ObjectVisitationReport: PropertyObjectVisitationReport<
            PropertyValueVisitationReport = Self::PropertyVisitationReport,
            PropertyArrayVisitationReport = Self::ArrayVisitationReport,
        > + Send;
    type PropertyVisitationReport: PropertyValueVisitationReport + Send;
    type ArrayVisitationReport: PropertyArrayVisitationReport<
            PropertyValueVisitationReport = Self::PropertyVisitationReport,
            PropertyObjectVisitationReport = Self::ObjectVisitationReport,
        > + Send;
    type OneOfPropertyVisitationReport: OneOfPropertyVisitationReport<
            PropertyValueVisitationReport = Self::PropertyVisitationReport,
        > + Send;

    /// Visits a leaf value.
    ///
    /// By default, this does nothing.
    fn visit_value<P>(
        &mut self,
        data_type: &DataTypeWithMetadata,
        value: &mut JsonValue,
        metadata: &mut ValueMetadata,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), Self::PropertyVisitationReport>> + Send
    where
        P: DataTypeLookup + Sync;

    /// Visits a property.
    ///
    /// By default, this forwards to [`walk_property`].
    fn visit_property<P>(
        &mut self,
        schema: &PropertyType,
        property: &mut PropertyWithMetadata,
        type_provider: &P,
    ) -> impl Future<
        Output = Result<
            (),
            PropertyVisitationError<
                Self::PropertyVisitationReport,
                Self::ArrayVisitationReport,
                Self::ObjectVisitationReport,
            >,
        >,
    > + Send
    where
        P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
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
    ) -> impl Future<Output = Result<(), Self::ArrayVisitationReport>> + Send
    where
        T: PropertyValueSchema + Sync,
        P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
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
    ) -> impl Future<Output = Result<(), Self::ObjectVisitationReport>> + Send
    where
        T: PropertyObjectSchema<Value = ValueOrArray<PropertyTypeReference>> + Sync,
        P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
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
    ) -> impl Future<Output = Result<(), OneOfVisitationReport<Self::PropertyVisitationReport>>> + Send
    where
        P: DataTypeLookup + Sync,
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
    ) -> impl Future<Output = Result<(), OneOfVisitationReport<Self::ArrayVisitationReport>>> + Send
    where
        P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
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
    ) -> impl Future<Output = Result<(), OneOfVisitationReport<Self::ObjectVisitationReport>>> + Send
    where
        P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
    {
        walk_one_of_object(self, schema, object, type_provider)
    }
}

// /// Walks through a JSON value using the provided schema.
// ///
// /// For all referenced data types [`EntityVisitor::visit_value`] is called.
// ///
// /// # Errors
// ///
// /// Any error that can be returned by the visitor methods.
// pub async fn walk_value<V, P>(
//     visitor: &mut V,
//     data_type: &DataTypeWithMetadata,
//     value: &mut JsonValue,
//     metadata: &mut ValueMetadata,
//     type_provider: &P,
// ) -> Result<(), Report<[TraversalError]>>
// where
//     V: EntityVisitor,
//     P: DataTypeLookup + Sync,
// {
//     let mut status = ReportSink::new();

//     for parent in &data_type.schema.all_of {
//         match type_provider
//             .lookup_data_type_by_ref(parent)
//             .await
//             .change_context_lazy(|| TraversalError::DataTypeRetrieval { id: parent.clone() })
//         {
//             Ok(parent) => {
//                 if let Err(error) = visitor
//                     .visit_value(parent.borrow(), value, metadata, type_provider)
//                     .await
//                 {
//                     status.append(error);
//                 }
//             }
//             Err(error) => {
//                 status.append(error);

//                 continue;
//             }
//         }
//     }

//     status.finish()
// }

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
) -> Result<
    (),
    PropertyVisitationError<
        V::PropertyVisitationReport,
        V::ArrayVisitationReport,
        V::ObjectVisitationReport,
    >,
>
where
    V: EntityVisitor,
    P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
{
    match property {
        PropertyWithMetadata::Value(value) => visitor
            .visit_one_of_property(&schema.one_of, value, type_provider)
            .await
            .map_err(PropertyVisitationError::Value),
        PropertyWithMetadata::Array(array) => visitor
            .visit_one_of_array(&schema.one_of, array, type_provider)
            .await
            .map_err(PropertyVisitationError::Array),
        PropertyWithMetadata::Object(object) => visitor
            .visit_one_of_object(&schema.one_of, object, type_provider)
            .await
            .map_err(PropertyVisitationError::Object),
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
) -> Result<(), V::ArrayVisitationReport>
where
    V: EntityVisitor,
    S: PropertyValueSchema + Sync,
    P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
{
    let mut validation_report = Ok::<_, V::ArrayVisitationReport>(());

    for (index, property) in array.value.iter_mut().enumerate() {
        let _: Result<(), ()> = match property {
            PropertyWithMetadata::Value(value) => visitor
                .visit_one_of_property(schema.items.possibilities(), value, type_provider)
                .await
                .map_err(|report| {
                    result_as_mut_err(&mut validation_report)
                        .capture_value_validation_report(index, report);
                }),
            PropertyWithMetadata::Array(array) => visitor
                .visit_one_of_array(schema.items.possibilities(), array, type_provider)
                .await
                .map_err(|report| {
                    result_as_mut_err(&mut validation_report)
                        .capture_array_validation_report(index, report);
                }),
            PropertyWithMetadata::Object(object) => visitor
                .visit_one_of_object(schema.items.possibilities(), object, type_provider)
                .await
                .map_err(|report| {
                    result_as_mut_err(&mut validation_report)
                        .capture_object_validation_report(index, report);
                }),
        };
    }

    validation_report
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
) -> Result<(), V::ObjectVisitationReport>
where
    V: EntityVisitor,
    S: PropertyObjectSchema<Value = ValueOrArray<PropertyTypeReference>> + Sync,
    P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
{
    let mut validation_report = Ok::<_, V::ObjectVisitationReport>(());

    for (base_url, property) in &mut object.value {
        let Some(property_type_reference) = schema.properties().get(base_url) else {
            result_as_mut_err(&mut validation_report).capture_unexpected_property(base_url.clone());
            continue;
        };

        match property_type_reference {
            ValueOrArray::Value(property_type_reference) => {
                let Some(property_type) = <P as OntologyTypeProvider<PropertyType>>::provide_type(
                    type_provider,
                    &property_type_reference.url,
                )
                .await
                .map_err(|report| {
                    result_as_mut_err(&mut validation_report)
                        .capture_property_type_retrieval_failed(
                            property_type_reference.clone(),
                            report,
                        );
                })
                .ok() else {
                    continue;
                };

                let _: Result<(), ()> = visitor
                    .visit_property(property_type.borrow(), property, type_provider)
                    .await
                    .map_err(|report| {
                        result_as_mut_err(&mut validation_report)
                            .capture_property_validation_report(base_url.clone(), report);
                    });
            }
            ValueOrArray::Array(array_schema) => match property {
                PropertyWithMetadata::Array(array) => {
                    let Some(property_type) =
                        <P as OntologyTypeProvider<PropertyType>>::provide_type(
                            type_provider,
                            &array_schema.items.url,
                        )
                        .await
                        .map_err(|report| {
                            result_as_mut_err(&mut validation_report)
                                .capture_property_type_retrieval_failed(
                                    array_schema.items.clone(),
                                    report,
                                );
                        })
                        .ok()
                    else {
                        continue;
                    };

                    let _: Result<(), ()> = visitor
                        .visit_array(
                            &PropertyValueArray {
                                items: property_type.borrow(),
                                min_items: array_schema.min_items,
                                max_items: array_schema.max_items,
                            },
                            array,
                            type_provider,
                        )
                        .await
                        .map_err(|report| {
                            result_as_mut_err(&mut validation_report)
                                .capture_array_validation_report(base_url.clone(), report);
                        });
                }
                PropertyWithMetadata::Object { .. } | PropertyWithMetadata::Value(_) => {
                    result_as_mut_err(&mut validation_report).capture_unexpected_type(
                        base_url.clone(),
                        property.json_type(),
                        JsonSchemaValueType::Array,
                    );
                }
            },
        };
    }

    validation_report
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
) -> Result<(), OneOfVisitationReport<V::PropertyVisitationReport>>
where
    V: EntityVisitor,
    P: DataTypeLookup + Sync,
{
    let mut errors = Vec::new();
    let mut passed = 0;

    for schema in schema {
        match schema {
            PropertyValues::DataTypeReference(data_type_ref) => {
                let mut validation_report = Ok::<_, V::OneOfPropertyVisitationReport>(());
                let Some(data_type) = type_provider
                    .lookup_data_type_by_ref(data_type_ref)
                    .await
                    .map_err(|report| {
                        result_as_mut_err(&mut validation_report)
                            .capture_data_type_retrieval_failed(data_type_ref.clone(), report);
                    })
                    .ok()
                else {
                    continue;
                };

                if visitor
                    .visit_value(
                        data_type.borrow(),
                        &mut property.value,
                        &mut property.metadata,
                        type_provider,
                    )
                    .await
                    .map_err(|report| {
                        result_as_mut_err(&mut validation_report).capture_validation_report(report);
                    })
                    .is_ok()
                {
                    passed += 1;
                }
            }
            PropertyValues::ArrayOfPropertyValues(_) | PropertyValues::PropertyTypeObject(_) => {
                errors.push(OneOfError::UnexpectedType {
                    expected: JsonSchemaValueType::Object,
                });
            }
        }
    }

    if passed == 1 {
        Ok(())
    } else {
        Err(OneOfVisitationReport {
            report: errors,
            passed,
        })
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
) -> Result<(), OneOfVisitationReport<V::ArrayVisitationReport>>
where
    V: EntityVisitor,
    P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
{
    let mut errors = Vec::new();
    let mut passed = 0;

    for schema in schema {
        match schema {
            PropertyValues::ArrayOfPropertyValues(array_schema) => {
                if let Err(report) =
                    Box::pin(visitor.visit_array(array_schema, array, type_provider)).await
                {
                    errors.push(OneOfError::Validation(report));
                } else {
                    passed += 1;
                }
            }
            PropertyValues::DataTypeReference(_) | PropertyValues::PropertyTypeObject(_) => {
                errors.push(OneOfError::UnexpectedType {
                    expected: JsonSchemaValueType::Object,
                });
            }
        }
    }

    if passed == 1 {
        Ok(())
    } else {
        Err(OneOfVisitationReport {
            report: errors,
            passed,
        })
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
) -> Result<(), OneOfVisitationReport<V::ObjectVisitationReport>>
where
    V: EntityVisitor,
    P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
{
    let mut errors = Vec::new();
    let mut passed = 0;

    for schema in schema {
        match schema {
            PropertyValues::PropertyTypeObject(object_schema) => {
                if let Err(report) =
                    Box::pin(visitor.visit_object(object_schema, object, type_provider)).await
                {
                    errors.push(OneOfError::Validation(report));
                } else {
                    passed += 1;
                }
            }
            PropertyValues::DataTypeReference(_) | PropertyValues::ArrayOfPropertyValues(_) => {
                errors.push(OneOfError::UnexpectedType {
                    expected: JsonSchemaValueType::Object,
                });
            }
        }
    }

    if passed == 1 {
        Ok(())
    } else {
        Err(OneOfVisitationReport {
            report: errors,
            passed,
        })
    }
}
