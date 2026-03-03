mod number;
mod string;

use alloc::{borrow::Cow, sync::Arc};
use core::error::Error;

use error_stack::{Report, ResultExt as _};
pub use number::NumberValueDistribution;
use rand::Rng;
use rand_distr::{Bernoulli, Distribution};
pub use string::{StringValueDistribution, StringValueDistributionError};
use type_system::{
    knowledge::{PropertyValue, property::PropertyValueWithMetadata, value::ValueMetadata},
    ontology::{
        VersionedUrl,
        data_type::{ClosedDataType, schema::DataTypeReference},
        json_schema::{SingleValueConstraints, ValueConstraints},
    },
};

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} distribution")]
pub enum ValueDistributionCreationError {
    #[display("number")]
    Number,
    #[display("string")]
    String,
}

impl Error for ValueDistributionCreationError {}

#[derive(Debug)]
enum InnerValueDistribution<'c> {
    Null,
    Boolean(Bernoulli),
    Number(NumberValueDistribution<'c>),
    String(StringValueDistribution<'c>),
}

impl InnerValueDistribution<'_> {
    fn boolean() -> Self {
        InnerValueDistribution::Boolean(Bernoulli::new(0.5).unwrap_or_else(|error| {
            unreachable!("Bernoulli distribution should always be able to be created: {error}")
        }))
    }
}

impl TryFrom<ValueConstraints> for InnerValueDistribution<'_> {
    type Error = Report<ValueDistributionCreationError>;

    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn try_from(constraints: ValueConstraints) -> Result<Self, Self::Error> {
        match constraints {
            ValueConstraints::Typed(typed) => match *typed {
                SingleValueConstraints::Null => Ok(Self::Null),
                SingleValueConstraints::Boolean => Ok(Self::boolean()),
                SingleValueConstraints::Number(number) => NumberValueDistribution::try_from(number)
                    .map(Self::Number)
                    .change_context(ValueDistributionCreationError::Number),
                SingleValueConstraints::String(string) => StringValueDistribution::try_from(string)
                    .map(Self::String)
                    .change_context(ValueDistributionCreationError::String),
                SingleValueConstraints::Array(_) => {
                    todo!("https://linear.app/hash/issue/H-5239/support-value-seeding-for-arrays")
                }
                SingleValueConstraints::Object => {
                    todo!("https://linear.app/hash/issue/H-5240/support-value-seeding-for-objects")
                }
            },
            ValueConstraints::AnyOf(_) => {
                todo!("https://linear.app/hash/issue/H-5241/support-value-seeding-for-anyof-types")
            }
        }
    }
}

impl<'c> TryFrom<&'c ValueConstraints> for InnerValueDistribution<'c> {
    type Error = Report<ValueDistributionCreationError>;

    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn try_from(constraints: &'c ValueConstraints) -> Result<Self, Self::Error> {
        match constraints {
            ValueConstraints::Typed(typed) => match &**typed {
                SingleValueConstraints::Null => Ok(Self::Null),
                SingleValueConstraints::Boolean => Ok(Self::boolean()),
                SingleValueConstraints::Number(number) => NumberValueDistribution::try_from(number)
                    .map(Self::Number)
                    .change_context(ValueDistributionCreationError::Number),
                SingleValueConstraints::String(string) => StringValueDistribution::try_from(string)
                    .map(Self::String)
                    .change_context(ValueDistributionCreationError::String),
                SingleValueConstraints::Array(_) => {
                    todo!("https://linear.app/hash/issue/H-5239/support-value-seeding-for-arrays")
                }
                SingleValueConstraints::Object => {
                    todo!("https://linear.app/hash/issue/H-5240/support-value-seeding-for-objects")
                }
            },
            ValueConstraints::AnyOf(_) => {
                todo!("https://linear.app/hash/issue/H-5241/support-value-seeding-for-anyof-types")
            }
        }
    }
}

#[derive(Debug)]
pub struct ValueDistribution<'e> {
    value: InnerValueDistribution<'e>,
    data_type_url: Cow<'e, VersionedUrl>,
}

impl TryFrom<ClosedDataType> for ValueDistribution<'_> {
    type Error = Report<ValueDistributionCreationError>;

    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn try_from(mut data_type: ClosedDataType) -> Result<Self, Self::Error> {
        let Some(constraints) = data_type.all_of.pop() else {
            todo!(
                "https://linear.app/hash/issue/H-5245/support-value-seeding-for-empty-data-types"
            );
        };

        if !data_type.all_of.is_empty() {
            todo!(
                "https://linear.app/hash/issue/H-5244/support-value-seeding-for-complex-data-types"
            );
        }

        Ok(ValueDistribution {
            value: InnerValueDistribution::try_from(constraints)?,
            data_type_url: Cow::Owned(data_type.id),
        })
    }
}

impl<'c> TryFrom<&'c ClosedDataType> for ValueDistribution<'c> {
    type Error = Report<ValueDistributionCreationError>;

    #[expect(clippy::todo, reason = "Incomplete implementation")]
    fn try_from(data_type: &'c ClosedDataType) -> Result<Self, Self::Error> {
        match data_type.all_of.as_slice() {
            [] => todo!(
                "https://linear.app/hash/issue/H-5245/support-value-seeding-for-empty-data-types"
            ),
            [constraints] => Ok(ValueDistribution {
                value: InnerValueDistribution::try_from(constraints)?,
                data_type_url: Cow::Borrowed(&data_type.id),
            }),
            [..] => {
                todo!("https://linear.app/hash/issue/H-5244/support-value-seeding-for-complex-data-types")
            }
        }
    }
}

impl Distribution<PropertyValueWithMetadata> for ValueDistribution<'_> {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> PropertyValueWithMetadata {
        let value = match &self.value {
            InnerValueDistribution::Null => PropertyValue::Null,
            InnerValueDistribution::Boolean(boolean) => PropertyValue::Bool(boolean.sample(rng)),
            InnerValueDistribution::Number(number) => PropertyValue::Number(number.sample(rng)),
            InnerValueDistribution::String(string) => PropertyValue::String(string.sample(rng)),
        };

        PropertyValueWithMetadata {
            value,
            metadata: ValueMetadata {
                data_type_id: Some(self.data_type_url.clone().into_owned()),
                ..ValueMetadata::default()
            },
        }
    }
}

pub trait ValueDistributionRegistry {
    fn get_distribution(&self, url: &DataTypeReference) -> Option<&ValueDistribution<'_>>;
}

impl<T> ValueDistributionRegistry for Arc<T>
where
    T: ValueDistributionRegistry,
{
    fn get_distribution(&self, url: &DataTypeReference) -> Option<&ValueDistribution<'_>> {
        (**self).get_distribution(url)
    }
}
