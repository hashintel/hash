use core::{borrow::Borrow as _, future::Future};
use std::collections::{HashMap, HashSet};

use error_stack::Report;
use futures::FutureExt as _;
use type_system::{
    knowledge::{
        PropertyValue,
        property::{
            PropertyArrayWithMetadata, PropertyObjectWithMetadata, PropertyValueWithMetadata,
            PropertyWithMetadata,
        },
        value::ValueMetadata,
    },
    ontology::{
        BaseUrl, VersionedUrl,
        data_type::schema::DataTypeReference,
        json_schema::{ConstraintError, JsonSchemaValueType},
        property_type::{
            PropertyType,
            schema::{
                PropertyObjectSchema, PropertyTypeReference, PropertyValueArray,
                PropertyValueSchema, PropertyValueType, PropertyValues, ValueOrArray,
            },
        },
    },
};

use crate::ontology::{DataTypeLookup, OntologyTypeProvider};

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Could not read the data type {}", data_type_reference.url)]
#[must_use]
pub struct DataTypeRetrieval {
    pub data_type_reference: DataTypeReference,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Could not read the property type {}", property_type_reference.url)]
#[must_use]
pub struct PropertyTypeRetrieval {
    pub property_type_reference: PropertyTypeReference,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Could not find a conversion from {} to {}", current.url, target.url)]
#[must_use]
pub struct ConversionRetrieval {
    pub current: DataTypeReference,
    pub target: DataTypeReference,
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct JsonSchemaValueTypeMismatch {
    pub actual: JsonSchemaValueType,
    pub expected: JsonSchemaValueType,
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct PropertyValueTypeMismatch {
    pub actual: PropertyValueType,
    pub expected: PropertyValueType,
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum DataTypeInferenceError {
    Retrieval {
        error: Report<DataTypeRetrieval>,
    },
    Abstract {
        data: VersionedUrl,
    },
    Ambiguous {
        #[cfg_attr(feature = "utoipa", schema(value_type = [VersionedUrl]))]
        data: HashSet<VersionedUrl>,
    },
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum DataTypeConversionError {
    Retrieval { error: Report<ConversionRetrieval> },
    WrongType { data: JsonSchemaValueTypeMismatch },
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum DataTypeCanonicalCalculation {
    Retrieval { error: Report<DataTypeRetrieval> },
    WrongType { data: JsonSchemaValueTypeMismatch },
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum ValueValidationError {
    Retrieval { error: Report<DataTypeRetrieval> },
    Constraints { error: Report<[ConstraintError]> },
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[must_use]
pub struct ValueValidationReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provided: Option<ValueValidationError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<ValueValidationError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#abstract: Option<VersionedUrl>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incompatible: Option<VersionedUrl>,
}

impl ValueValidationReport {
    #[must_use]
    pub const fn is_valid(&self) -> bool {
        self.provided.is_none()
            && self.target.is_none()
            && self.r#abstract.is_none()
            && self.incompatible.is_none()
    }
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum PropertyValueValidationReport {
    WrongType { data: PropertyValueTypeMismatch },
    ValueValidation { data: ValueValidationReport },
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct OneOfPropertyValidationReports {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validations: Option<Vec<PropertyValueValidationReport>>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub data_type_inference: Vec<DataTypeInferenceError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_conversion: Option<DataTypeConversionError>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub canonical_value: Vec<DataTypeCanonicalCalculation>,
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
#[must_use]
pub enum PropertyArrayValidationReport {
    WrongType(PropertyValueTypeMismatch),
    ArrayValidation(ArrayValidationReport),
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct OneOfArrayValidationReports {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validations: Option<Vec<PropertyArrayValidationReport>>,
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum PropertyObjectValidationReport {
    WrongType { data: PropertyValueTypeMismatch },
    ObjectValidation(ObjectValidationReport),
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct OneOfObjectValidationReports {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validations: Option<Vec<PropertyObjectValidationReport>>,
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum PropertyValidationReport {
    Value(OneOfPropertyValidationReports),
    Array(OneOfArrayValidationReports),
    Object(OneOfObjectValidationReports),
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
#[must_use]
pub enum ArrayItemNumberMismatch {
    TooFew { actual: usize, min: usize },
    TooMany { actual: usize, max: usize },
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[must_use]
pub struct ArrayValidationReport {
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub items: HashMap<usize, PropertyValidationReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_items: Option<ArrayItemNumberMismatch>,
}

impl ArrayValidationReport {
    #[must_use]
    pub fn is_valid(&self) -> bool {
        self.items.is_empty() && self.num_items.is_none()
    }
}

#[derive(Debug, Default, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[must_use]
pub struct ObjectValidationReport {
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub properties: HashMap<BaseUrl, ObjectPropertyValidationReport>,
}

impl ObjectValidationReport {
    #[must_use]
    pub fn is_valid(&self) -> bool {
        self.properties.is_empty()
    }
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub enum ObjectPropertyValidationReport {
    Unexpected,
    Retrieval {
        error: Report<PropertyTypeRetrieval>,
    },
    WrongType {
        data: PropertyValueTypeMismatch,
    },
    Value(OneOfPropertyValidationReports),
    Array(OneOfArrayValidationReports),
    Object(OneOfObjectValidationReports),
    PropertyArray(ArrayValidationReport),
    Missing,
}

impl From<PropertyValidationReport> for ObjectPropertyValidationReport {
    fn from(property_validation: PropertyValidationReport) -> Self {
        match property_validation {
            PropertyValidationReport::Value(report) => Self::Value(report),
            PropertyValidationReport::Array(report) => Self::Array(report),
            PropertyValidationReport::Object(report) => Self::Object(report),
        }
    }
}

// TODO: Allow usage of other error types
pub trait EntityVisitor: Sized + Send + Sync {
    /// Visits a leaf value.
    ///
    /// By default, this does nothing.
    fn visit_value<P>(
        &mut self,
        desired_data_type_reference: &DataTypeReference,
        value: &mut PropertyValue,
        metadata: &mut ValueMetadata,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), ValueValidationReport>> + Send
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
    ) -> impl Future<Output = Result<(), PropertyValidationReport>> + Send
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
        array: &mut PropertyArrayWithMetadata,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), ArrayValidationReport>> + Send
    where
        T: PropertyValueSchema + Sync,
        P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
    {
        walk_array(self, schema, array, type_provider).map(|properties| {
            if properties.is_empty() {
                Ok(())
            } else {
                Err(ArrayValidationReport {
                    items: properties,
                    ..ArrayValidationReport::default()
                })
            }
        })
    }

    /// Visits an object property.
    ///
    /// By default, this forwards to [`walk_object`].
    fn visit_object<T, P>(
        &mut self,
        schema: &T,
        object: &mut PropertyObjectWithMetadata,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), ObjectValidationReport>> + Send
    where
        T: PropertyObjectSchema<Value = ValueOrArray<PropertyTypeReference>> + Sync,
        P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
    {
        walk_object(self, schema, object, type_provider).map(|properties| {
            if properties.is_empty() {
                Ok(())
            } else {
                Err(ObjectValidationReport { properties })
            }
        })
    }

    /// Visits a property value using the [`PropertyValues`] from a one-of schema.
    ///
    /// By default, this forwards to [`walk_one_of_property_value`].
    fn visit_one_of_property<P>(
        &mut self,
        schema: &[PropertyValues],
        property: &mut PropertyValueWithMetadata,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), OneOfPropertyValidationReports>> + Send
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
        array: &mut PropertyArrayWithMetadata,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), OneOfArrayValidationReports>> + Send
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
        object: &mut PropertyObjectWithMetadata,
        type_provider: &P,
    ) -> impl Future<Output = Result<(), OneOfObjectValidationReports>> + Send
    where
        P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
    {
        walk_one_of_object(self, schema, object, type_provider)
    }
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
) -> Result<(), PropertyValidationReport>
where
    V: EntityVisitor,
    P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
{
    match property {
        PropertyWithMetadata::Value(value) => visitor
            .visit_one_of_property(&schema.one_of, value, type_provider)
            .await
            .map_err(PropertyValidationReport::Value),
        PropertyWithMetadata::Array(array) => visitor
            .visit_one_of_array(&schema.one_of, array, type_provider)
            .await
            .map_err(PropertyValidationReport::Array),
        PropertyWithMetadata::Object(object) => visitor
            .visit_one_of_object(&schema.one_of, object, type_provider)
            .await
            .map_err(PropertyValidationReport::Object),
    }
}

/// Walks through an array property using the provided schema.
///
/// Depending on the property, [`EntityVisitor::visit_one_of_property`],
/// [`EntityVisitor::visit_one_of_array`], or [`EntityVisitor::visit_one_of_object`] is called.
///
/// Returns a detailed report about the validation failures for each property in the array.
pub async fn walk_array<V, S, P>(
    visitor: &mut V,
    schema: &PropertyValueArray<S>,
    array: &mut PropertyArrayWithMetadata,
    type_provider: &P,
) -> HashMap<usize, PropertyValidationReport>
where
    V: EntityVisitor,
    S: PropertyValueSchema + Sync,
    P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
{
    let mut properties = HashMap::new();
    let schema_possibilities = schema.items.possibilities();

    for (index, property) in array.value.iter_mut().enumerate() {
        match property {
            PropertyWithMetadata::Value(value) => {
                let _: Result<(), ()> = visitor
                    .visit_one_of_property(schema_possibilities, value, type_provider)
                    .await
                    .map_err(|report| {
                        properties.insert(index, PropertyValidationReport::Value(report));
                    });
            }
            PropertyWithMetadata::Array(array) => {
                let _: Result<(), ()> = visitor
                    .visit_one_of_array(schema_possibilities, array, type_provider)
                    .await
                    .map_err(|report| {
                        properties.insert(index, PropertyValidationReport::Array(report));
                    });
            }
            PropertyWithMetadata::Object(object) => {
                let _: Result<(), ()> = visitor
                    .visit_one_of_object(schema_possibilities, object, type_provider)
                    .await
                    .map_err(|report| {
                        properties.insert(index, PropertyValidationReport::Object(report));
                    });
            }
        }
    }

    properties
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
/// Returns a detailed report about the validation failures for each property in the object.
pub async fn walk_object<V, S, P>(
    visitor: &mut V,
    schema: &S,
    object: &mut PropertyObjectWithMetadata,
    type_provider: &P,
) -> HashMap<BaseUrl, ObjectPropertyValidationReport>
where
    V: EntityVisitor,
    S: PropertyObjectSchema<Value = ValueOrArray<PropertyTypeReference>> + Sync,
    P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
{
    let mut validation_map = HashMap::new();

    for (base_url, property) in &mut object.value {
        let Some(property_type_reference) = schema.properties().get(base_url) else {
            validation_map.insert(
                base_url.clone(),
                ObjectPropertyValidationReport::Unexpected {},
            );
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
                    validation_map.insert(
                        base_url.clone(),
                        ObjectPropertyValidationReport::Retrieval {
                            error: report.change_context(PropertyTypeRetrieval {
                                property_type_reference: property_type_reference.clone(),
                            }),
                        },
                    );
                })
                .ok() else {
                    continue;
                };

                let _: Result<(), ()> = visitor
                    .visit_property(property_type.borrow(), property, type_provider)
                    .await
                    .map_err(|property_validation| {
                        validation_map.insert(
                            base_url.clone(),
                            ObjectPropertyValidationReport::from(property_validation),
                        );
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
                            validation_map.insert(
                                base_url.clone(),
                                ObjectPropertyValidationReport::Retrieval {
                                    error: report.change_context(PropertyTypeRetrieval {
                                        property_type_reference: array_schema.items.clone(),
                                    }),
                                },
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
                        .map_err(|array_validation| {
                            validation_map.insert(
                                base_url.clone(),
                                ObjectPropertyValidationReport::PropertyArray(array_validation),
                            );
                        });
                }
                PropertyWithMetadata::Value(_) | PropertyWithMetadata::Object { .. } => {
                    validation_map.insert(
                        base_url.clone(),
                        ObjectPropertyValidationReport::WrongType {
                            data: PropertyValueTypeMismatch {
                                actual: property.property_value_type(),
                                expected: PropertyValueType::Array,
                            },
                        },
                    );
                }
            },
        }
    }

    validation_map
}

/// Walks through a property value using the provided schema list.
///
/// # Errors
///
/// Returns a detailed report about the validation failures for each property value.
pub async fn walk_one_of_property_value<V, P>(
    visitor: &mut V,
    schema: &[PropertyValues],
    property: &mut PropertyValueWithMetadata,
    type_provider: &P,
) -> Result<(), OneOfPropertyValidationReports>
where
    V: EntityVisitor,
    P: DataTypeLookup + Sync,
{
    let mut property_validations = Vec::new();

    for schema in schema {
        match schema {
            PropertyValues::Value(data_type_ref) => {
                if let Err(report) = visitor
                    .visit_value(
                        data_type_ref,
                        &mut property.value,
                        &mut property.metadata,
                        type_provider,
                    )
                    .await
                {
                    property_validations
                        .push(PropertyValueValidationReport::ValueValidation { data: report });
                } else {
                    return Ok(());
                }
            }
            PropertyValues::Array(_) | PropertyValues::Object(_) => {
                property_validations.push(PropertyValueValidationReport::WrongType {
                    data: PropertyValueTypeMismatch {
                        actual: schema.property_value_type(),
                        expected: PropertyValueType::Value,
                    },
                });
            }
        }
    }

    Err(OneOfPropertyValidationReports {
        validations: Some(property_validations),
        ..OneOfPropertyValidationReports::default()
    })
}

/// Walks through an array property using the provided schema list.
///
/// # Errors
///
/// Returns a detailed report about the validation failures for each property value.
pub async fn walk_one_of_array<V, P>(
    visitor: &mut V,
    schema: &[PropertyValues],
    array: &mut PropertyArrayWithMetadata,
    type_provider: &P,
) -> Result<(), OneOfArrayValidationReports>
where
    V: EntityVisitor,
    P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
{
    let mut array_validations = Vec::new();

    for schema in schema {
        match schema {
            PropertyValues::Array(array_schema) => {
                if let Err(report) =
                    Box::pin(visitor.visit_array(array_schema, array, type_provider)).await
                {
                    array_validations.push(PropertyArrayValidationReport::ArrayValidation(report));
                } else {
                    return Ok(());
                }
            }
            PropertyValues::Value(_) | PropertyValues::Object(_) => {
                array_validations.push(PropertyArrayValidationReport::WrongType(
                    PropertyValueTypeMismatch {
                        actual: schema.property_value_type(),
                        expected: PropertyValueType::Array,
                    },
                ));
            }
        }
    }

    Err(OneOfArrayValidationReports {
        validations: Some(array_validations),
    })
}

/// Walks through an object property using the provided schema list.
///
/// # Errors
///
/// Returns a detailed report about the validation failures for each property value.
pub async fn walk_one_of_object<V, P>(
    visitor: &mut V,
    schema: &[PropertyValues],
    object: &mut PropertyObjectWithMetadata,
    type_provider: &P,
) -> Result<(), OneOfObjectValidationReports>
where
    V: EntityVisitor,
    P: DataTypeLookup + OntologyTypeProvider<PropertyType> + Sync,
{
    let mut object_validations = Vec::new();

    for schema in schema {
        match schema {
            PropertyValues::Object(object_schema) => {
                if let Err(report) =
                    Box::pin(visitor.visit_object(object_schema, object, type_provider)).await
                {
                    object_validations
                        .push(PropertyObjectValidationReport::ObjectValidation(report));
                } else {
                    return Ok(());
                }
            }
            PropertyValues::Value(_) | PropertyValues::Array(_) => {
                object_validations.push(PropertyObjectValidationReport::WrongType {
                    data: PropertyValueTypeMismatch {
                        actual: schema.property_value_type(),
                        expected: PropertyValueType::Object,
                    },
                });
            }
        }
    }

    Err(OneOfObjectValidationReports {
        validations: Some(object_validations),
    })
}
