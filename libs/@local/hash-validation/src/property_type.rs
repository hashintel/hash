use core::borrow::Borrow;
use std::{collections::HashMap, num::NonZeroUsize};

use error_stack::{bail, Report, ResultExt};
use graph_types::knowledge::entity::Property;
use thiserror::Error;
use type_system::{
    url::{BaseUrl, VersionedUrl},
    Array, DataType, JsonSchemaValueType, Object, OneOf, PropertyType, PropertyTypeReference,
    PropertyValues, ValueOrArray,
};

use crate::{
    error::{Actual, Expected},
    OntologyTypeProvider, Schema, Validate, ValidationProfile,
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
}

impl<P> Schema<Property, P> for PropertyType
where
    P: OntologyTypeProvider<Self> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a Property,
        profile: ValidationProfile,
        provider: &'a P,
    ) -> Result<(), Report<PropertyValidationError>> {
        // TODO: Distinguish between format validation and content validation so it's possible
        //       to directly use the correct type.
        //   see https://linear.app/hash/issue/BP-33
        OneOf::new(self.one_of().to_vec())
            .expect("was validated before")
            .validate_value(value, profile, provider)
            .await
            .attach_lazy(|| Expected::PropertyType(self.clone()))
            .attach_lazy(|| Actual::Property(value.clone()))
    }
}

impl<P> Validate<PropertyType, P> for Property
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate(
        &self,
        schema: &PropertyType,
        profile: ValidationProfile,
        provider: &P,
    ) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self, profile, provider).await
    }
}

impl<P> Schema<Property, P> for PropertyTypeReference
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a Property,
        profile: ValidationProfile,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        let property_type =
            OntologyTypeProvider::<PropertyType>::provide_type(provider, self.url())
                .await
                .change_context_lazy(|| PropertyValidationError::PropertyTypeRetrieval {
                    id: self.url().clone(),
                })?;
        property_type
            .borrow()
            .validate_value(value, profile, provider)
            .await
            .attach_lazy(|| Expected::PropertyType(property_type.borrow().clone()))
            .attach_lazy(|| Actual::Property(value.clone()))
    }
}

impl<P> Validate<PropertyTypeReference, P> for Property
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate(
        &self,
        schema: &PropertyTypeReference,
        profile: ValidationProfile,
        context: &P,
    ) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self, profile, context).await
    }
}

impl<V, P, S> Schema<[V], P> for Array<S>
where
    V: Sync,
    P: Sync,
    S: Schema<V, P, Error = PropertyValidationError> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate_value<'a>(
        &'a self,
        values: &'a [V],
        profile: ValidationProfile,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<PropertyValidationError>> = Ok(());

        if profile == ValidationProfile::Full {
            if let Some(min) = self.min_items() {
                if values.len() < min {
                    extend_report!(
                        status,
                        PropertyValidationError::TooFewItems {
                            actual: values.len(),
                            min,
                        },
                    );
                }
            }

            if let Some(max) = self.max_items().map(NonZeroUsize::get) {
                if values.len() > max {
                    extend_report!(
                        status,
                        PropertyValidationError::TooManyItems {
                            actual: values.len(),
                            max,
                        },
                    );
                }
            }
        }

        for value in values {
            if let Err(report) = self.items().validate_value(value, profile, provider).await {
                extend_report!(status, report);
            }
        }

        status
    }
}

impl<V, P, S> Schema<V, P> for OneOf<S>
where
    V: Sync,
    P: Sync,
    S: Schema<V, P> + Sync,
{
    type Error = S::Error;

    async fn validate_value<'a>(
        &'a self,
        value: &'a V,
        profile: ValidationProfile,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<S::Error>> = Ok(());

        for schema in self.one_of() {
            if let Err(error) = schema.validate_value(value, profile, provider).await {
                extend_report!(status, error);
            } else {
                // Only one schema must match
                return Ok(());
            }
        }

        status
    }
}

impl<P, S> Schema<Property, P> for ValueOrArray<S>
where
    P: Sync,
    S: Schema<Property, P, Error = PropertyValidationError> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a Property,
        profile: ValidationProfile,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        match (value, self) {
            (value, Self::Value(schema)) => schema.validate_value(value, profile, provider).await,
            (Property::Array(array), Self::Array(schema)) => {
                schema.validate_value(array, profile, provider).await
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

impl<P, const MIN: usize> Schema<HashMap<BaseUrl, Property>, P>
    for Object<ValueOrArray<PropertyTypeReference>, MIN>
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a HashMap<BaseUrl, Property>,
        profile: ValidationProfile,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<Self::Error>> = Ok(());

        for (key, property) in value {
            if let Some(object_schema) = self.properties().get(key) {
                if let Err(report) = object_schema
                    .validate_value(property, profile, provider)
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

        if profile == ValidationProfile::Full {
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

impl<P> Schema<Property, P> for PropertyValues
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = PropertyValidationError;

    fn validate_value<'a>(
        &'a self,
        value: &'a Property,
        profile: ValidationProfile,
        provider: &'a P,
    ) -> impl Future<Output = Result<(), Report<Self::Error>>> + Send + '_ {
        Box::pin(async move {
            match (value, self) {
                (value, Self::DataTypeReference(reference)) => reference
                    .validate_value(value, profile, provider)
                    .await
                    .change_context(PropertyValidationError::DataTypeValidation {
                        id: reference.url().clone(),
                    }),
                (Property::Array(values), Self::ArrayOfPropertyValues(schema)) => {
                    schema.validate_value(values, profile, provider).await
                }
                (Property::Array(_), Self::PropertyTypeObject(_)) => {
                    Err(Report::new(PropertyValidationError::InvalidType {
                        actual: JsonSchemaValueType::Array,
                        expected: JsonSchemaValueType::Object,
                    }))
                }
                (Property::Object(object), Self::PropertyTypeObject(schema)) => {
                    schema.validate_value(object, profile, provider).await
                }
                (Property::Object(_), Self::ArrayOfPropertyValues(_)) => {
                    Err(Report::new(PropertyValidationError::InvalidType {
                        actual: JsonSchemaValueType::Object,
                        expected: JsonSchemaValueType::Array,
                    }))
                }
                (Property::Value(_), Self::ArrayOfPropertyValues(_)) => {
                    Err(Report::new(PropertyValidationError::InvalidType {
                        actual: value.json_type(),
                        expected: JsonSchemaValueType::Array,
                    }))
                }
                (Property::Value(_), Self::PropertyTypeObject(_)) => {
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

    use crate::{tests::validate_property, ValidationProfile};

    #[tokio::test]
    async fn address_line_1() {
        let property_types = [];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_property(
            json!("123 Fake Street"),
            graph_test_data::property_type::ADDRESS_LINE_1_V1,
            property_types,
            data_types,
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_property(
            json!(12_34_56_78),
            graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        _ = validate_property(
            json!([10, 20, 30, 40, 50]),
            graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
            property_types,
            data_types,
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
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
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        _ = validate_property(
            json!(1),
            graph_test_data::property_type::USER_ID_V1,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect_err("validation succeeded");

        validate_property(
            json!("1"),
            graph_test_data::property_type::USER_ID_V2,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_property(
            json!(1),
            graph_test_data::property_type::USER_ID_V2,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }
}
