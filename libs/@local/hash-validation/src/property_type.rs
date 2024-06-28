use core::borrow::Borrow;
use std::collections::HashMap;

use error_stack::{bail, ensure, Report, ResultExt};
use graph_types::knowledge::PropertyWithMetadata;
use thiserror::Error;
use type_system::{
    url::{BaseUrl, VersionedUrl},
    ArraySchema, DataType, JsonSchemaValueType, ObjectSchema, OneOfSchema, PropertyType,
    PropertyTypeReference, PropertyValues, ValueOrArray,
};

use crate::{
    error::{Actual, Expected},
    OntologyTypeProvider, Schema, Validate, ValidateEntityComponents,
};

macro_rules! extend_report {
    ($status:ident, $error:expr $(,)?) => {
        if let Err(ref mut report) = $status {
            report.extend_one(error_stack::report!($error))
        } else {
            $status = Err(error_stack::report!($error))
        }
    };
}

#[derive(Debug, Error)]
pub enum PropertyValidationError {
    #[error("the validator was unable to read the property type `{id}`")]
    PropertyTypeRetrieval { id: VersionedUrl },
    #[error("data type validation failed for data type with id `{id}`")]
    DataTypeValidation { id: VersionedUrl },
    #[error("the property `{key}` was specified, but not in the schema")]
    UnexpectedProperty { key: BaseUrl },
    #[error("the value provided does not match the required schema for `{key}`")]
    InvalidProperty { key: BaseUrl },
    #[error("the property key `{key}` is not a valid Base URL")]
    InvalidPropertyKey { key: String },
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
        "the value provided does not match the property type schema, expected `{expected}`, got \
         `{actual}`"
    )]
    InvalidType {
        actual: JsonSchemaValueType,
        expected: JsonSchemaValueType,
    },
    #[error(
        "The provided data type is not allowed on the property, expected `{expected}`, got \
         `{actual}`"
    )]
    InvalidDataType {
        actual: VersionedUrl,
        expected: VersionedUrl,
    },
}

impl<P> Schema<PropertyWithMetadata, P> for PropertyType
where
    P: OntologyTypeProvider<Self> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a PropertyWithMetadata,
        components: ValidateEntityComponents,
        provider: &'a P,
    ) -> Result<(), Report<PropertyValidationError>> {
        // TODO: Distinguish between format validation and content validation so it's possible
        //       to directly use the correct type.
        //   see https://linear.app/hash/issue/BP-33
        OneOfSchema::new(self.one_of.clone())
            .expect("was validated before")
            .validate_value(value, components, provider)
            .await
            .attach_lazy(|| Expected::PropertyType(self.clone()))
            .attach_lazy(|| Actual::Property(value.clone()))
    }
}

impl<P> Validate<PropertyType, P> for PropertyWithMetadata
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate(
        &self,
        schema: &PropertyType,
        components: ValidateEntityComponents,
        context: &P,
    ) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self, components, context).await
    }
}

impl<P> Schema<PropertyWithMetadata, P> for PropertyTypeReference
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a PropertyWithMetadata,
        components: ValidateEntityComponents,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        let property_type = OntologyTypeProvider::<PropertyType>::provide_type(provider, &self.url)
            .await
            .change_context_lazy(|| PropertyValidationError::PropertyTypeRetrieval {
                id: self.url.clone(),
            })?;
        property_type
            .borrow()
            .validate_value(value, components, provider)
            .await
            .attach_lazy(|| Expected::PropertyType(property_type.borrow().clone()))
            .attach_lazy(|| Actual::Property(value.clone()))
    }
}

impl<P> Validate<PropertyTypeReference, P> for PropertyWithMetadata
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate(
        &self,
        schema: &PropertyTypeReference,
        components: ValidateEntityComponents,
        context: &P,
    ) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self, components, context).await
    }
}

impl<V, P, S> Schema<[V], P> for ArraySchema<S>
where
    V: Sync,
    P: Sync,
    S: Schema<V, P, Error = PropertyValidationError> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a [V],
        components: ValidateEntityComponents,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<PropertyValidationError>> = Ok(());

        if components.num_items {
            if let Some(min) = self.min_items() {
                if value.len() < min {
                    extend_report!(
                        status,
                        PropertyValidationError::TooFewItems {
                            actual: value.len(),
                            min,
                        },
                    );
                }
            }

            if let Some(max) = self.max_items() {
                if value.len() > max {
                    extend_report!(
                        status,
                        PropertyValidationError::TooManyItems {
                            actual: value.len(),
                            max,
                        },
                    );
                }
            }
        }

        for value in value {
            if let Err(report) = self
                .items()
                .validate_value(value, components, provider)
                .await
            {
                extend_report!(status, report);
            }
        }

        status
    }
}

impl<V, P, S> Schema<V, P> for OneOfSchema<S>
where
    V: Sync,
    P: Sync,
    S: Schema<V, P> + Sync,
{
    type Error = S::Error;

    async fn validate_value<'a>(
        &'a self,
        value: &'a V,
        components: ValidateEntityComponents,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<S::Error>> = Ok(());

        for schema in self.possibilities() {
            if let Err(error) = schema.validate_value(value, components, provider).await {
                extend_report!(status, error);
            } else {
                // Only one schema must match
                return Ok(());
            }
        }

        status
    }
}

impl<P, S> Schema<PropertyWithMetadata, P> for ValueOrArray<S>
where
    P: Sync,
    S: Schema<PropertyWithMetadata, P, Error = PropertyValidationError> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a PropertyWithMetadata,
        components: ValidateEntityComponents,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        match (value, self) {
            (value, Self::Value(schema)) => {
                schema.validate_value(value, components, provider).await
            }
            (PropertyWithMetadata::Array { value, metadata: _ }, Self::Array(schema)) => {
                schema.validate_value(value, components, provider).await
            }
            (_, Self::Array(_)) => {
                bail!(PropertyValidationError::InvalidType {
                    actual: value.json_type(),
                    expected: JsonSchemaValueType::Array,
                })
            }
        }
    }
}

impl<P, const MIN: usize> Schema<HashMap<BaseUrl, PropertyWithMetadata>, P>
    for ObjectSchema<ValueOrArray<PropertyTypeReference>, MIN>
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a HashMap<BaseUrl, PropertyWithMetadata>,
        components: ValidateEntityComponents,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<Self::Error>> = Ok(());

        for (key, property) in value {
            if let Some(object_schema) = self.properties().get(key) {
                if let Err(report) = object_schema
                    .validate_value(property, components, provider)
                    .await
                {
                    extend_report!(
                        status,
                        report.change_context(PropertyValidationError::InvalidProperty {
                            key: key.clone(),
                        })
                    );
                }
            } else {
                extend_report!(
                    status,
                    PropertyValidationError::UnexpectedProperty { key: key.clone() }
                );
            }
        }

        if components.required_properties {
            for required_property in self.required() {
                if !value.contains_key(required_property) {
                    extend_report!(
                        status,
                        PropertyValidationError::MissingRequiredProperty {
                            key: required_property.clone(),
                        }
                    );
                }
            }
        }

        status
    }
}

impl<P> Schema<PropertyWithMetadata, P> for PropertyValues
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    fn validate_value<'a>(
        &'a self,
        value: &'a PropertyWithMetadata,
        components: ValidateEntityComponents,
        provider: &'a P,
    ) -> impl Future<Output = Result<(), Report<Self::Error>>> + Send + '_ {
        Box::pin(async move {
            match (value, self) {
                (value, Self::DataTypeReference(reference)) => {
                    if let Some(data_type_id) = value.data_type_id() {
                        ensure!(
                            reference.url == *data_type_id,
                            PropertyValidationError::InvalidDataType {
                                actual: data_type_id.clone(),
                                expected: reference.url.clone(),
                            }
                        );
                    }
                    reference
                        .validate_value(value, components, provider)
                        .await
                        .change_context(PropertyValidationError::DataTypeValidation {
                            id: reference.url.clone(),
                        })
                }
                (
                    PropertyWithMetadata::Array { value, metadata: _ },
                    Self::ArrayOfPropertyValues(schema),
                ) => schema.validate_value(value, components, provider).await,
                (PropertyWithMetadata::Array { .. }, Self::PropertyTypeObject(_)) => {
                    Err(Report::new(PropertyValidationError::InvalidType {
                        actual: JsonSchemaValueType::Array,
                        expected: JsonSchemaValueType::Object,
                    }))
                }
                (
                    PropertyWithMetadata::Object { value, metadata: _ },
                    Self::PropertyTypeObject(schema),
                ) => schema.validate_value(value, components, provider).await,
                (PropertyWithMetadata::Object { .. }, Self::ArrayOfPropertyValues(_)) => {
                    Err(Report::new(PropertyValidationError::InvalidType {
                        actual: JsonSchemaValueType::Object,
                        expected: JsonSchemaValueType::Array,
                    }))
                }
                (PropertyWithMetadata::Value { .. }, Self::ArrayOfPropertyValues(_)) => {
                    Err(Report::new(PropertyValidationError::InvalidType {
                        actual: value.json_type(),
                        expected: JsonSchemaValueType::Array,
                    }))
                }
                (PropertyWithMetadata::Value { .. }, Self::PropertyTypeObject(_)) => {
                    Err(Report::new(PropertyValidationError::InvalidType {
                        actual: value.json_type(),
                        expected: JsonSchemaValueType::Object,
                    }))
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {

    use serde_json::json;

    use crate::{tests::validate_property, ValidateEntityComponents};

    #[tokio::test]
    async fn address_line_1() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("123 Fake Street"),
            graph_test_data::property_type::ADDRESS_LINE_1_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn age() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::NUMBER_V1];

        validate_property(
            json!(42),
            graph_test_data::property_type::AGE_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn blurb() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("blurb"),
            graph_test_data::property_type::BLURB_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn city() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("Bielefeld"),
            graph_test_data::property_type::CITY_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn contact_information() {
        let property_types = [
            graph_test_data::property_type::EMAIL_V1,
            graph_test_data::property_type::PHONE_NUMBER_V1,
        ];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json! ({
                "https://blockprotocol.org/@alice/types/property-type/email/": "alice@example",
                "https://blockprotocol.org/@alice/types/property-type/phone-number/": "+0123456789",
            }),
            graph_test_data::property_type::CONTACT_INFORMATION_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn contrived_information() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::NUMBER_V1];

        validate_property(
            json!([12, 34, 56, 78]),
            graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");

        validate_property(
            json!(12_34_56_78),
            graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");

        _ = validate_property(
            json!([10, 20, 30, 40, 50]),
            graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect_err("validation succeeded");
    }

    #[tokio::test]
    async fn email() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("alice@example.com"),
            graph_test_data::property_type::EMAIL_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn favorite_film() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("Teletubbies"),
            graph_test_data::property_type::FAVORITE_FILM_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn favorite_quote() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("hold my beer"),
            graph_test_data::property_type::FAVORITE_QUOTE_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn favorite_song() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("Never gonna give you up"),
            graph_test_data::property_type::FAVORITE_SONG_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn favorite_hobby() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("Programming in Rust"),
            graph_test_data::property_type::HOBBY_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn numbers() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::NUMBER_V1];

        validate_property(
            json!([1, 2, 3, 4, 5]),
            graph_test_data::property_type::NUMBERS_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn phone_number() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("+0123456789"),
            graph_test_data::property_type::PHONE_NUMBER_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn postcode() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("12345"),
            graph_test_data::property_type::POSTCODE_NUMBER_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn published_on() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("2021-01-01T00:00:00Z"),
            graph_test_data::property_type::PUBLISHED_ON_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn text() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("lorem ipsum"),
            graph_test_data::property_type::TEXT_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn user_id() {
        let property_types = [];
        let data_types = [
            graph_test_data::data_type::TEXT_V1,
            graph_test_data::data_type::NUMBER_V1,
        ];

        validate_property(
            json!("1"),
            graph_test_data::property_type::USER_ID_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");

        _ = validate_property(
            json!(1),
            graph_test_data::property_type::USER_ID_V1,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect_err("validation succeeded");

        validate_property(
            json!("1"),
            graph_test_data::property_type::USER_ID_V2,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");

        validate_property(
            json!(1),
            graph_test_data::property_type::USER_ID_V2,
            property_types,
            data_types,
            ValidateEntityComponents::full(),
        )
        .await
        .expect("validation failed");
    }
}
