mod number;
mod string;

use core::error::Error;

use error_stack::{Report, ResultExt as _};
pub use number::NumberValueDistribution;
use rand::Rng;
use rand_distr::{Bernoulli, Distribution};
pub use string::{StringValueDistribution, StringValueDistributionError};
use type_system::{
    knowledge::PropertyValue,
    ontology::{
        VersionedUrl,
        data_type::ClosedDataType,
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

pub struct ValueDistribution<'e> {
    value: InnerValueDistribution<'e>,
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
            }),
            [..] => {
                todo!("https://linear.app/hash/issue/H-5244/support-value-seeding-for-complex-data-types")
            }
        }
    }
}

impl Distribution<PropertyValue> for ValueDistribution<'_> {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> PropertyValue {
        match &self.value {
            InnerValueDistribution::Null => PropertyValue::Null,
            InnerValueDistribution::Boolean(boolean) => PropertyValue::Bool(boolean.sample(rng)),
            InnerValueDistribution::Number(number) => PropertyValue::Number(number.sample(rng)),
            InnerValueDistribution::String(string) => PropertyValue::String(string.sample(rng)),
        }
    }
}

pub trait ValueDistributionRegistry: Sync + Send {
    fn get_distribution(&self, url: &VersionedUrl) -> Option<ValueDistribution<'_>>;
}
